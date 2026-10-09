#!/usr/bin/env python3
"""worker-hygiene.sh on a throwaway git repo: a new biome-ignore fails; whitespace churn is only reported."""
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / 'worker-hygiene.sh'
SOURCE = '\n'.join(f'export const v{i} = {i};' for i in range(20)) + '\n'


def git(repo, *args):
    subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', *args], cwd=repo, check=True,
                   capture_output=True)


def run(repo):
    r = subprocess.run(['bash', str(SCRIPT), str(repo)], env={'HYGIENE_BASE': 'base', 'PATH': '/usr/bin:/bin'},
                       capture_output=True, text=True)
    return r.returncode, r.stdout


with tempfile.TemporaryDirectory(prefix='hygiene-test-') as tmp:
    repo = Path(tmp)
    (repo / 'apps').mkdir()
    git(repo, 'init', '-q', '-b', 'base')
    for name in ('a.ts', 'b.ts'):
        (repo / 'apps' / name).write_text(SOURCE)
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'base')
    git(repo, 'checkout', '-qb', 'feat')

    # (edit to apps/b.ts, edit to apps/a.ts, untracked file) -> (exit code, text that must appear)
    cases = [
        ('real edit only', None, SOURCE.replace('v3 = 3', 'v3 = 33'), None, 0, 'no new biome-ignore'),
        # The whitespace-only file is the only change: `git diff -w` prints nothing (an awk NR==FNR trap).
        ('whitespace churn only', SOURCE.replace(' = ', '  =  '), None, None, 0, 'apps/b.ts: 40 changed lines'),
        ('tracked suppression', None, SOURCE + '// biome-ignore lint/x: y\n', None, 1, 'apps/a.ts: // biome-ignore'),
        ('untracked suppression', None, None, '// biome-ignore lint/z: w\n', 1, 'apps/c.ts:1:'),
    ]
    for label, b, a, c, code, needle in cases:
        git(repo, 'checkout', '-q', '--', '.')
        (repo / 'apps' / 'c.ts').unlink(missing_ok=True)
        if b is not None:
            (repo / 'apps' / 'b.ts').write_text(b)
        if a is not None:
            (repo / 'apps' / 'a.ts').write_text(a)
        if c is not None:
            (repo / 'apps' / 'c.ts').write_text(c)
        got, out = run(repo)
        assert got == code and needle in out, (label, got, out)
    print(f'PASS: worker-hygiene {len(cases)} cases')
