#!/usr/bin/env python3
"""wave-status.py: which worker states count as wave state, and how each one reads."""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / 'wave-status.py'

with tempfile.TemporaryDirectory(prefix='wave-status-test-') as tmp:
    t = Path(tmp)
    states = t / 'wave'
    states.mkdir()
    live_wt = t / 'wt-live'
    live_wt.mkdir()
    now = int(time.time())

    def state(name, cwd, pid=None, report=None, started=now - 600):
        rep = t / f'{name}-REPORT.md'
        if report is not None:
            rep.write_text(report)
        data = dict(name=name, role='impl', model='m', effort='e', cwd=str(cwd), report=str(rep),
                    sentinel=f'<!-- {name}-DONE -->', started_at=started, log=str(t / f'{name}.log'))
        if pid:
            data['pid'] = pid
        (states / f'{name}.json').write_text(json.dumps(data))
        return rep

    state('running', live_wt, pid=os.getpid())
    state('stopped', live_wt, pid=99999999)
    state('terminal', live_wt)
    state('done', live_wt, report='body\n<!-- done-DONE -->\n')
    old = state('done-old', live_wt, report='body\n<!-- done-old-DONE -->\n', started=now - 9 * 3600)
    os.utime(old, (now - 8 * 3600, now - 8 * 3600))
    state('closed', t / 'removed-worktree', pid=99999999)
    state('wrong-sentinel', live_wt, pid=99999999, report='body\nnot the sentinel\n')
    (states / 'preview-dead.json').write_text(json.dumps(dict(name='dead', pids=[99999999])))
    (states / 'preview-live.json').write_text(json.dumps(dict(name='live', pids=[os.getpid()])))

    out = subprocess.run([sys.executable, str(SCRIPT), '--json', '--state-dir', str(states)],
                         capture_output=True, text=True, check=True).stdout
    snap = json.loads(out)
    got = {w['name']: w['status'] for w in snap['workers']}
    want = {'running': 'running', 'stopped': 'stopped', 'terminal': 'running', 'done': 'done',
            'wrong-sentinel': 'stopped'}
    assert got == want, got
    assert [p['name'] for p in snap['previews']] == ['live'], snap['previews']
    text = subprocess.run([sys.executable, str(SCRIPT), '--state-dir', str(states)],
                          capture_output=True, text=True, check=True).stdout
    assert text.startswith('Workers: 4 active, 1 done'), text
    print('PASS: wave-status worker states, previews and text summary')
