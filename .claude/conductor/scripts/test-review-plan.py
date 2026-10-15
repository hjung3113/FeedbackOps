#!/usr/bin/env python3
"""Table test for review-plan.py on a throwaway git repo (no network, no worktree)."""
import json, subprocess, sys, tempfile
from pathlib import Path

PLAN = Path(__file__).resolve().parent / 'review-plan.py'


def sh(repo, *args):
    subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)


def write(repo, path, text):
    target = Path(repo) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def plan(repo, *extra):
    r = subprocess.run([sys.executable, str(PLAN), str(repo), *extra], capture_output=True, text=True)
    return r.returncode, json.loads(r.stdout.strip().splitlines()[-1])


BASE_FILES = {
    'apps/frontend/src/lib/copy/voc.ts': "export const A = '가';\n",
    'apps/frontend/src/features/voc/VocRow.tsx': 'export const Row = () => null;\n',
    'apps/frontend/src/lib/layout/AppFrame.tsx': 'const q = { staleTime: 30000 };\n',
    'apps/frontend/src/lib/api/client.ts': 'export const x = 1;\n',
    'apps/backend/src/modules/tasks/repo.ts': 'export const list = () => db.select();\n',
    'apps/backend/src/modules/tasks/service.ts': 'export const s = () => 1;\n',
    'packages/shared/src/tasks/schema.ts': 'export const schema = 1;\n',
    'docs/frontend/specs/voc.md': '# VOC\n',
}

CASES = [
    # name, {path: new text}, expected subset
    ('docs only', {'docs/frontend/specs/voc.md': '# VOC\nmore\n'}, {'code': False, 'ux': False, 'perf': False}),
    ('copy + re-pinned test', {'apps/frontend/src/lib/copy/voc.ts': "export const A = '나';\n",
                               'apps/frontend/src/features/voc/__tests__/VocRow.test.tsx': "it('x', () => {});\n"},
     {'code': False, 'ux': False}),
    ('copy + baseline png', {'apps/frontend/src/lib/copy/voc.ts': "export const A = '다';\n",
                             'apps/frontend/tests/visual/baselines/darwin/chromium/a.png': 'png'},
     {'code': False, 'ux': False}),
    ('screen tsx', {'apps/frontend/src/features/voc/VocRow.tsx': 'export const Row = () => <div />;\n'},
     {'code': True, 'ux': 'required', 'perf': False}),
    ('staleTime removed in AppFrame', {'apps/frontend/src/lib/layout/AppFrame.tsx': 'const q = {};\n'},
     {'code': True, 'perf': True}),
    ('frontend .ts only', {'apps/frontend/src/lib/api/client.ts': 'export const x = 2;\n'},
     {'ux': 'optional', 'perf': True}),
    ('repo.ts orderBy', {'apps/backend/src/modules/tasks/repo.ts': 'export const list = () => db.select().orderBy(t.id);\n'},
     {'code': True, 'perf': True, 'ux': False, 'flags.backend': True}),
    ('service orderBy', {'apps/backend/src/modules/tasks/service.ts': 'export const s = () => q.orderBy(x).limit(5);\n'},
     {'perf': True}),
    ('shared schema', {'packages/shared/src/tasks/schema.ts': 'export const schema = 2;\n'},
     {'ux': 'optional', 'flags.backend': True}),
    ('migration', {'apps/backend/migrations/0099_x.sql': 'select 1;\n'}, {'flags.migration': True}),
    ('permission path', {'apps/backend/src/modules/permissions/check.ts': 'export const c = 1;\n'},
     {'flags.permission': True}),
    ('agent instructions', {'.claude/agents/review-ux.md': '---\nname: review-ux\n---\n'},
     {'flags.instructions': True}),
]


def get(obj, dotted):
    for part in dotted.split('.'):
        obj = obj[part]
    return obj


failures = 0
with tempfile.TemporaryDirectory() as tmp:
    repo = Path(tmp)
    sh(repo, 'init', '-q', '-b', 'main')
    sh(repo, 'config', 'user.email', 't@t'); sh(repo, 'config', 'user.name', 't')
    for path, text in BASE_FILES.items():
        write(repo, path, text)
    sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', 'base')
    base = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    for name, edits, expected in CASES:
        sh(repo, 'checkout', '-q', '--detach', base)
        for path, text in edits.items():
            write(repo, path, text)
        sh(repo, 'add', '-A'); sh(repo, 'commit', '-qm', name)
        code, out = plan(repo, '--base', base)
        for key, value in expected.items():
            if code != 0 or get(out, key) != value:
                failures += 1
                print(f'FAIL {name}: {key} expected {value!r}, got {get(out, key) if code == 0 else out!r}')
    # Uncommitted changes outside .review/ refuse to plan.
    write(repo, 'apps/frontend/src/features/voc/VocRow.tsx', 'dirty\n')
    code, out = plan(repo, '--base', base)
    if code != 2:
        failures += 1
        print(f'FAIL uncommitted: expected exit 2, got {code} {out}')
    sh(repo, 'checkout', '-q', '--', '.')
    write(repo, '.review/notes.md', 'scratch\n')
    code, out = plan(repo, '--base', base)
    if code != 0:
        failures += 1
        print(f'FAIL .review scratch should be ignored: {code} {out}')

print('PASS' if failures == 0 else f'{failures} failure(s)', f'{len(CASES) + 2} cases')
sys.exit(1 if failures else 0)
