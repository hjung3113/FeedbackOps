#!/usr/bin/env python3
"""baseline-keep.py — run from apps/frontend AFTER `playwright test --update-snapshots=all`.

Keeps only the regenerated baselines whose change is intended; `git checkout`s every other changed PNG
(develop drift, the known unstable dialog baselines, anti-aliasing noise). Prints what it kept.

  --region x0,y0,x1,y1   keep a PNG only if every changed pixel (>threshold) lies inside this box
                          (e.g. the sidebar strip 0,0,300,960) and nothing outside changes by >40
  --name REGEX           keep PNGs whose file name matches REGEX (their diff anywhere)
  --threshold N          per-channel difference that counts inside the region (default 10: faint borders count)
Sub-threshold UI changes pass the harness against stale baselines, so regenerate deliberately.
"""
import argparse, io, re, subprocess
from PIL import Image, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument('--region'); ap.add_argument('--name'); ap.add_argument('--threshold', type=int, default=10)
a = ap.parse_args()
box = tuple(int(v) for v in a.region.split(',')) if a.region else None
for line in subprocess.check_output(['git', 'status', '--short']).decode().splitlines():
    p = line.split()[-1]
    if not p.endswith('.png'):
        continue
    try:
        old = Image.open(io.BytesIO(subprocess.check_output(['git', 'show', 'HEAD:apps/frontend/' + p]))).convert('RGB')
    except subprocess.CalledProcessError:
        print('NEW ', p); continue
    new = Image.open(p).convert('RGB')
    keep = False
    if old.size == new.size:
        d = ImageChops.difference(old, new)
        if a.name and re.search(a.name, p.split('/')[-1]):
            keep = d.getbbox() is not None
        elif box:
            inside = sum(1 for px in d.crop(box).getdata() if max(px) > a.threshold)
            full = sum(1 for px in d.getdata() if max(px) > 40)
            inner = sum(1 for px in d.crop(box).getdata() if max(px) > 40)
            keep = inside > 0 and full == inner
    if keep:
        print('KEEP', p.split('/')[-1])
    else:
        subprocess.run(['git', 'checkout', '--', p], check=True)
