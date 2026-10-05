#!/usr/bin/env python3
"""Report changed visual baselines and their before/after crops.

Run from any directory. The default is read-only. To apply a selection, pass
--keep REGEX (keep matching baselines and restore other changed tracked PNGs)
or --revert REGEX (restore matching baselines only). --name and --region keep
their historical selection meaning when used with --keep.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[4]


def git_bytes(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT)


def changed_pngs() -> list[tuple[str, bool]]:
    """Return (repository-relative path, tracked-at-HEAD) changed PNGs."""
    raw = git_bytes("status", "--porcelain=v1", "-z", "--untracked-files=all")
    fields = raw.split(b"\0")
    found: dict[str, bool] = {}
    index = 0
    while index < len(fields):
        record = fields[index]
        index += 1
        if not record:
            continue
        status = record[:2].decode("ascii", errors="replace")
        path_bytes = record[3:]
        if "R" in status or "C" in status:
            # With -z Git emits the destination first, then the source path.
            if index < len(fields):
                index += 1
        path = Path(path_bytes.decode(errors="surrogateescape")).as_posix()
        if not path.startswith("apps/frontend/") or not path.lower().endswith(".png"):
            continue
        found[path] = status != "??"
    return sorted(found.items())


def read_head_image(path: str) -> Image.Image | None:
    try:
        content = git_bytes("show", f"HEAD:{path}")
    except subprocess.CalledProcessError:
        return None
    with Image.open(io.BytesIO(content)) as image:
        return image.convert("RGB").copy()


def difference(before: Image.Image, after: Image.Image, threshold: int):
    delta = ImageChops.difference(before, after)
    channels = delta.split()
    max_channel = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    raw_mask = max_channel.point(lambda value: 255 if value > 0 else 0)
    counted_mask = max_channel.point(lambda value: 255 if value > threshold else 0)
    raw_bbox = raw_mask.getbbox()
    return counted_mask.histogram()[255], raw_bbox, raw_bbox, delta, max_channel


def crop_bounds(box: tuple[int, int, int, int], size: tuple[int, int]):
    left, top, right, bottom = box
    return (
        max(0, left - 10),
        max(0, top - 10),
        min(size[0], right + 10),
        min(size[1], bottom + 10),
    )


def make_crop_paths(root: Path, rel: str):
    stem = Path(rel).with_suffix("").as_posix().replace("/", "__")
    base = root / f"{stem}"
    return base.with_name(base.name + ".before.png"), base.with_name(base.name + ".after.png"), base.with_name(base.name + ".diff.png")


def region_matches(max_channel: Image.Image | None, region: tuple[int, int, int, int] | None) -> bool:
    if region is None:
        return True
    if max_channel is None:
        return False
    # Preserve the historical region test: there must be a changed pixel in
    # the target box, and no >40-channel noise may occur outside it. Counting
    # any pixel inside avoids dropping an intended small visual change.
    high_mask = max_channel.point(lambda value: 255 if value > 40 else 0)
    inside_any = max_channel.crop(region).point(lambda value: 255 if value > 0 else 0).histogram()[255]
    full_high = high_mask.histogram()[255]
    inside_high = high_mask.crop(region).histogram()[255]
    return inside_any > 0 and full_high == inside_high


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--keep", metavar="REGEX", help="keep matching baselines and restore other changed tracked PNGs")
    action.add_argument("--revert", metavar="REGEX", help="restore matching changed tracked PNGs")
    parser.add_argument("--report", action="store_true", help="explicitly request the default read-only report")
    parser.add_argument("--region", help="legacy keep qualifier: x0,y0,x1,y1; changed pixels must stay inside")
    parser.add_argument("--name", help="legacy keep qualifier: match the PNG basename; takes precedence over --region")
    parser.add_argument("--threshold", type=int, default=10, help="per-channel threshold for the reported pixel count (default: 10)")
    parser.add_argument("--output-dir", default=".review/baseline-keep-crops", help="crop output directory (default: %(default)s)")
    args = parser.parse_args()

    if args.report and (args.keep or args.revert):
        parser.error("--report cannot be combined with --keep or --revert")
    if args.threshold < 0 or args.threshold > 255:
        parser.error("--threshold must be between 0 and 255")
    try:
        keep_re = re.compile(args.keep) if args.keep else None
        revert_re = re.compile(args.revert) if args.revert else None
        name_re = re.compile(args.name) if args.name else None
    except re.error as error:
        parser.error(f"invalid regular expression: {error}")
    region = None
    if args.region:
        try:
            region = tuple(int(part) for part in args.region.split(","))
        except ValueError:
            parser.error("--region must be x0,y0,x1,y1")
        if len(region) != 4 or region[0] < 0 or region[1] < 0 or region[2] <= region[0] or region[3] <= region[1]:
            parser.error("--region must be a non-empty x0,y0,x1,y1 box")

    try:
        candidates = changed_pngs()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Could not read changed PNGs from Git: {error}", file=sys.stderr)
        print(json.dumps({"ok": False, "changed": 0, "error": "git-status"}, separators=(",", ":")))
        return 1

    output_root = Path(args.output_dir)
    if not output_root.is_absolute():
        output_root = ROOT / output_root

    rows = []
    errors = 0
    for rel, tracked in candidates:
        current_path = ROOT / rel
        try:
            if current_path.is_file():
                with Image.open(current_path) as image:
                    after = image.convert("RGB").copy()
            else:
                after = None
            before = read_head_image(rel) if tracked else None
        except (OSError, subprocess.CalledProcessError) as error:
            print(f"ERROR {rel}: {error}")
            errors += 1
            rows.append({"path": rel, "tracked": tracked, "error": str(error)})
            continue

        row = {"path": rel, "tracked": tracked, "pixels": None, "bbox": None, "before": None, "after": None, "diff": None, "raw_bbox": None, "region_ok": False}
        if after is None:
            if before is None:
                print(f"ERROR {rel}: current and HEAD images are both unavailable")
                errors += 1
                row["error"] = "current and HEAD images are both unavailable"
                rows.append(row)
                continue
            output_root.mkdir(parents=True, exist_ok=True)
            before_path, _, _ = make_crop_paths(output_root, rel)
            before.save(before_path)
            full_bbox = (0, 0, before.width, before.height)
            row.update(bbox=full_bbox, raw_bbox=full_bbox, before=str(before_path), diff="unavailable (PNG deleted)")
            print(f"DELETE {rel} pixels=n/a bbox={full_bbox} before={before_path} after=n/a diff=n/a")
        elif before is None:
            output_root.mkdir(parents=True, exist_ok=True)
            before_path, after_path, diff_path = make_crop_paths(output_root, rel)
            after.save(after_path)
            row.update(after=str(after_path), diff="unavailable (new PNG)")
            print(f"NEW {rel} pixels=n/a bbox=n/a before=n/a after={after_path} diff=n/a")
        elif before.size != after.size:
            output_root.mkdir(parents=True, exist_ok=True)
            before_path, after_path, diff_path = make_crop_paths(output_root, rel)
            before.save(before_path)
            after.save(after_path)
            row.update(before=str(before_path), after=str(after_path), diff="unavailable (image dimensions differ)")
            print(f"CHANGE {rel} pixels=n/a bbox=n/a before={before_path} after={after_path} diff=n/a size={before.size}->{after.size}")
        else:
            pixels, bbox, raw_bbox, delta, max_channel = difference(before, after, args.threshold)
            before_path, after_path, diff_path = make_crop_paths(output_root, rel)
            if bbox is not None:
                crop = crop_bounds(bbox, before.size)
            elif raw_bbox is not None:
                crop = crop_bounds(raw_bbox, before.size)
            else:
                crop = (0, 0, min(before.width, 160), min(before.height, 120))
            output_root.mkdir(parents=True, exist_ok=True)
            before_crop = before.crop(crop)
            after_crop = after.crop(crop)
            before_crop.save(before_path)
            after_crop.save(after_path)
            gutter = Image.new("RGB", (10, before_crop.height), "red")
            combined = Image.new("RGB", (before_crop.width * 2 + gutter.width, before_crop.height), "black")
            combined.paste(before_crop, (0, 0))
            combined.paste(gutter, (before_crop.width, 0))
            combined.paste(after_crop, (before_crop.width + gutter.width, 0))
            combined.save(diff_path)
            row.update(pixels=pixels, bbox=bbox, raw_bbox=raw_bbox, region_ok=region_matches(max_channel, region), before=str(before_path), after=str(after_path), diff=str(diff_path))
            print(f"CHANGE {rel} pixels>{args.threshold}:{pixels} bbox={bbox or 'none'} before={before_path} after={after_path} diff={diff_path}")
        rows.append(row)

    if args.keep or args.revert:
        expression = keep_re or revert_re
        matched = []
        for row in rows:
            if "error" in row:
                continue
            rel = row["path"]
            matches = bool(expression.search(rel) or expression.search(Path(rel).name))
            if keep_re and name_re:
                matches = matches and bool(name_re.search(Path(rel).name)) and row.get("raw_bbox") is not None
            if keep_re and not name_re and region is not None:
                matches = matches and bool(row.get("region_ok"))
            if revert_re and matches:
                matched.append(row)
            elif keep_re and matches:
                matched.append(row)
        if not matched:
            print("ERROR action regex matched no eligible changed PNGs")
            errors += 1
        else:
            matched_paths = {row["path"] for row in matched}
            for row in rows:
                if "error" in row:
                    continue
                rel = row["path"]
                selected = rel in matched_paths
                should_restore = selected if revert_re else (row["tracked"] and not selected)
                if not should_restore:
                    print(f"KEEP {rel}")
                    continue
                if not row["tracked"]:
                    print(f"NEW-LEFT {rel} (no HEAD baseline to restore)")
                    continue
                try:
                    subprocess.run(["git", "restore", "--source=HEAD", "--worktree", "--", rel], cwd=ROOT, check=True)
                    print(f"REVERT {rel}")
                except (OSError, subprocess.CalledProcessError) as error:
                    print(f"ERROR could not restore {rel}: {error}")
                    errors += 1

    print(json.dumps({"ok": errors == 0, "changed": len(candidates), "reported": len(rows), "errors": errors}, separators=(",", ":")))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
