#!/usr/bin/env python3
"""One-shot snapshot of a running wave: workers and reviewers, previews, worktrees, containers, open PRs.

Read-only. Used by the wave-panel mod (`--json`, every few seconds) and by the conductor when the owner asks for
progress (plain text). Worker states are the `worker-launch.sh` JSON files in $WAVE_STATE, or, without it, in
every session scratch `wave/` directory of this project touched in the last day.

  python3 wave-status.py [--json] [--prs] [--state-dir <dir>]...
"""
import argparse
import json
import os
import subprocess
import time
from pathlib import Path

DAY = 24 * 3600
RECENT = 3 * 3600
REPO = Path(__file__).resolve().parents[4]


def run(args, timeout=10):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, cwd=REPO)
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (ProcessLookupError, ValueError, TypeError):
        return False
    except PermissionError:
        return True


def state_dirs(explicit):
    if explicit:
        return [Path(d) for d in explicit]
    if os.environ.get('WAVE_STATE'):
        return [Path(os.environ['WAVE_STATE'])]
    slug = str(REPO).replace('/', '-')
    now = time.time()
    found = []
    for root in {Path('/private/tmp'), Path(os.environ.get('TMPDIR', '/tmp'))}:
        for d in root.glob(f'claude-*/{slug}/*/scratchpad/wave'):
            if d.is_dir() and now - d.stat().st_mtime < DAY:
                found.append(d)
    return sorted(found, key=lambda d: d.stat().st_mtime, reverse=True)


def report_done(s):
    report = Path(s.get('report', ''))
    if not report.is_file() or report.stat().st_mtime < s.get('started_at', 0):
        return False
    lines = [l for l in report.read_text(errors='replace').splitlines() if l.strip()]
    return bool(lines) and lines[-1] == s.get('sentinel')


def worker(path, now):
    s = json.loads(path.read_text())
    started = s.get('started_at') or int(path.stat().st_mtime)
    if report_done(s):
        status = 'done'
    elif not Path(s.get('cwd', '/nonexistent')).is_dir():
        # The worktree is gone: the conductor finished with this worker (merged or abandoned).
        status = 'closed'
    elif s.get('pid'):
        status = 'running' if alive(s['pid']) else 'stopped'
    else:
        # Orca terminal workers have no PID here; without a report they count as running.
        status = 'running'
    report = Path(s.get('report', ''))
    finished = int(report.stat().st_mtime) if status == 'done' else None
    log = Path(s.get('log', ''))
    quiet = int((now - log.stat().st_mtime) / 60) if log.is_file() else None
    return dict(name=s.get('name', path.stem), role=s.get('role'), model=s.get('model'), effort=s.get('effort'),
                worktree=Path(s.get('cwd', '')).name, status=status, minutes=int((now - started) / 60),
                log_quiet_minutes=quiet, started_at=started, finished_at=finished)


def snapshot(dirs, with_prs):
    now = time.time()
    workers, previews = [], []
    for d in dirs:
        for path in d.glob('*.json'):
            if path.name.startswith('preview-'):
                try:
                    p = json.loads(path.read_text())
                except ValueError:
                    continue
                live = [pid for pid in p.get('pids', []) if alive(pid)]
                if live:
                    previews.append(dict(name=p.get('name', path.stem), url=p.get('url'), pids=len(live)))
                continue
            try:
                w = worker(path, now)
            except (ValueError, OSError):
                continue
            # Closed workers, and finished ones whose report is older than RECENT, are history, not wave state.
            if w['status'] == 'closed' or (w['status'] == 'done' and now - w['finished_at'] > RECENT):
                continue
            workers.append(w)
    order = {'running': 0, 'stopped': 1, 'done': 2}
    workers.sort(key=lambda w: (order.get(w['status'], 3), -w['started_at']))

    worktrees = []
    out = run(['git', 'worktree', 'list', '--porcelain'])
    if out:
        for block in out.strip().split('\n\n')[1:]:
            fields = dict(line.split(' ', 1) for line in block.splitlines() if ' ' in line)
            worktrees.append(dict(path=Path(fields.get('worktree', '')).name,
                                  branch=fields.get('branch', '').replace('refs/heads/', '')))

    containers = []
    out = run(['docker', 'ps', '--format', '{{.Names}}\t{{.Status}}'])
    if out:
        containers = [dict(zip(('name', 'status'), line.split('\t', 1))) for line in out.splitlines() if line]

    prs = None
    if with_prs:
        out = run(['gh', 'pr', 'list', '--state', 'open', '--limit', '20', '--json',
                   'number,title,baseRefName,statusCheckRollup'], timeout=20)
        if out:
            prs = []
            for p in json.loads(out):
                checks = p.get('statusCheckRollup') or []
                states = {c.get('conclusion') or c.get('state') or c.get('status') for c in checks}
                ci = ('fail' if states & {'FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'} else
                      'pass' if checks and states <= {'SUCCESS', 'NEUTRAL', 'SKIPPED'} else
                      'pending' if checks else 'none')
                prs.append(dict(number=p['number'], title=p['title'], base=p['baseRefName'], ci=ci))
    return dict(at=int(now), state_dirs=[str(d) for d in dirs], workers=workers, previews=previews,
                worktrees=worktrees, containers=containers, prs=prs)


def text(s):
    lines = []
    running = [w for w in s['workers'] if w['status'] != 'done']
    lines.append(f"Workers: {len(running)} active, {len(s['workers']) - len(running)} done")
    for w in s['workers']:
        quiet = f", log quiet {w['log_quiet_minutes']}m" if w['log_quiet_minutes'] is not None else ''
        lines.append(f"  {w['status']:8} {w['name']:18} {w['role'] or '-':14} {w['model'] or '-'} {w['effort'] or ''}"
                     f" ({w['minutes']}m{quiet})")
    lines.append(f"Previews: {', '.join(p['name'] for p in s['previews']) or 'none'}")
    lines.append(f"Worktrees: {', '.join(w['path'] for w in s['worktrees']) or 'none'}")
    lines.append(f"Containers: {', '.join(c['name'] for c in s['containers']) or 'none'}")
    if s['prs'] is not None:
        lines.append('Open PRs: ' + (', '.join(f"#{p['number']}→{p['base']} {p['ci']}" for p in s['prs']) or 'none'))
    return '\n'.join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--json', action='store_true')
    p.add_argument('--prs', action='store_true', help='also list open PRs with their CI state (gh)')
    p.add_argument('--state-dir', action='append', default=[])
    a = p.parse_args()
    s = snapshot(state_dirs(a.state_dir), a.prs)
    print(json.dumps(s) if a.json else text(s))


if __name__ == '__main__':
    main()
