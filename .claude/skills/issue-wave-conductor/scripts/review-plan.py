#!/usr/bin/env python3
"""review-plan.py <checkout> [--base origin/develop] [--head HEAD] — which reviewers an issue branch triggers.

Reads `git diff <base>...<head>` (file names plus added and removed lines) and prints one JSON line:
  {"ok": true, "code": bool, "ux": "required"|"optional"|false, "perf": bool, "flags": {...}, "reasons": {...}}

Rules (conductor skill step 7):

- **code** (`review-final`): any change except a docs/copy-only diff. Copy-only means every changed file outside
  tests and visual baselines is Markdown, `docs/`, or `apps/frontend/src/lib/copy/`. A copy change that only
  re-pins test labels or regenerates baselines stays copy-only, so it gets no review (owner rule).
- **ux** (`review-ux`):
  - `required`: a non-test `.tsx` under `apps/frontend/src/{features,routes,lib/layout}`, any non-test file under
    `packages/ui/src`, frontend styles, or a changed visual baseline (outside a copy-only diff).
  - `optional`: the conductor decides with a one-line reason. Covers frontend `.ts` only, backend routes,
    controllers, validation, policies or permissions, and `packages/shared` sources. These change what a user sees
    without touching a component.
- **perf** (measure with nav-perf; launch `review-perf` only on a threshold breach or an unbounded new query):
  - a non-test change under `apps/frontend/src/{routes,lib/router,lib/api,lib/layout,lib/query,lib/cross-system,lib/auth}`;
  - any file whose name starts with `use`, or `InternalLink`;
  - a frontend dependency change;
  - added or removed query options or fetches (`useQuery`, `useInfiniteQuery`, `queryKey`, `staleTime`,
    `refetchInterval`, `invalidateQueries`, `enabled:`, `fetch(`, `apiRequest`, `apiClient`). `useMutation` alone
    does not count;
  - backend module code changing list queries: raw `ILIKE|ORDER BY|LIMIT|OFFSET` or Drizzle `.orderBy(`, `.limit(`,
    `.offset(`, `ilike(` anywhere in a module, plus `LIKE`, `like(` and `.from(` in read or repository code
    (`read/`, `repository*`, `repo.ts`, `repo-*`).
- **flags** (informational; they steer briefs and task files):
  - `backend`: `apps/backend` or `packages/shared` changed, so the previews need `--backend`;
  - `migration`: `apps/backend/migrations` changed;
  - `permission`: a permission, policy, auth or scope path, or a permission-check line changed. Put no-leak first in
    every reviewer task, and give the UX reviewer a restricted persona;
  - `instructions`: `.claude/**`, an `AGENTS.md` or a `CLAUDE.md` changed. Reviewers read these from the branch, so
    the conductor reads that diff before launching anyone.

With the default `--head HEAD`, uncommitted changes outside `.review/` make it exit 2: the previews would serve code
the plan never saw.
"""
import argparse
import json
import re
import subprocess
import sys


def git(checkout, *args):
    result = subprocess.run(['git', '-C', checkout, *args], text=True, capture_output=True)
    if result.returncode != 0:
        print(json.dumps({'ok': False, 'error': result.stderr.strip() or 'git failed'}))
        sys.exit(2)
    return result.stdout


def is_test(path):
    return bool(re.search(r'(__tests__/|\.test\.|\.spec\.|^apps/frontend/tests/|test-support/)', path))


def is_baseline(path):
    return path.startswith('apps/frontend/tests/visual/baselines/')


FE_PERF_PATH = re.compile(
    r'^apps/frontend/src/(routes|lib/router|lib/api|lib/layout|lib/query|lib/cross-system|lib/auth)/'
)
USE_FILE = re.compile(r'(^|/)use[A-Z\-][\w-]*\.tsx?$|InternalLink')
QUERY_OPTS = re.compile(
    r'\b(useQuery|useInfiniteQuery|queryKey|staleTime|refetchInterval|invalidateQueries|apiRequest|apiClient)\b'
    r'|\benabled\s*:|\bfetch\('
)
BE_READ = re.compile(r'^apps/backend/src/modules/.*/(read/|repository|repo\.ts$|repo-)')
SQL_LIST = re.compile(
    r'\b(ILIKE|LIKE|ORDER BY|LIMIT|OFFSET)\b|\.orderBy\(|\.limit\(|\.offset\(|\bilike\(|\blike\(|\.from\('
)
SQL_LIST_ANYWHERE = re.compile(r'\b(ILIKE|ORDER BY|LIMIT|OFFSET)\b|\.orderBy\(|\.limit\(|\.offset\(|\bilike\(')
# `_authed` is the authenticated route folder, not auth logic.
PERMISSION_PATH = re.compile(r'(permission|polic|(?<!_)auth(?!ed)|scope|grant|deny)', re.I)
PERMISSION_LINE = re.compile(r'PERMISSION_BLOCKED|requireReadable|requirePermission|capability|readScope|triageScope|scopeFilter|outOfScope|out_of_scope')
UX_OPTIONAL = re.compile(r'^apps/backend/src/modules/.*(routes?|controller|validation|polic|permission)')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('checkout')
    parser.add_argument('--base', default='origin/develop')
    parser.add_argument('--head', default='HEAD')
    args = parser.parse_args()

    if args.head == 'HEAD':
        dirty = [line for line in git(args.checkout, 'status', '--porcelain').splitlines()
                 if line[3:] and not line[3:].startswith('.review/')]
        if dirty:
            print(json.dumps({'ok': False, 'error': 'uncommitted changes outside .review/; commit first',
                              'dirty': dirty[:5]}))
            sys.exit(2)

    diff_range = f'{args.base}...{args.head}'
    files = [f for f in git(args.checkout, 'diff', '--name-only', diff_range).splitlines() if f]
    changed = []  # (file, text) for added and removed lines in non-test files; import reshuffles skipped
    current = None
    for line in git(args.checkout, 'diff', '--unified=0', diff_range).splitlines():
        if line.startswith('--- '):
            current = line[6:] if line.startswith('--- a/') else None
            continue
        if line.startswith('+++ '):
            if line.startswith('+++ b/'):
                current = line[6:]
            continue
        if line[:1] in '+-' and current is not None and not is_test(current):
            text = line[1:].strip()
            if text.startswith('import ') or re.match(r"^[\w{},\s]*\}?\s*from\s+['\"]", text) or re.fullmatch(r'\w+,?', text):
                continue
            changed.append((current, text))

    reasons = {'code': [], 'ux': [], 'perf': []}
    flags = {'backend': False, 'migration': False, 'permission': False, 'instructions': False}
    substantive = [f for f in files if not is_test(f) and not is_baseline(f)]
    copy_only = all(
        f.endswith('.md') or f.startswith('docs/') or f.startswith('apps/frontend/src/lib/copy/') for f in substantive
    )
    if files and not copy_only:
        reasons['code'].append('code change')

    ux_required, ux_optional = [], []
    for f in files:
        if f.startswith(('apps/backend/', 'packages/shared/')):
            flags['backend'] = True
        if f.startswith('apps/backend/migrations/'):
            flags['migration'] = True
        if f.startswith('.claude/') or f.endswith(('AGENTS.md', 'CLAUDE.md')):
            flags['instructions'] = True
        if not is_test(f) and f.startswith(('apps/', 'packages/')) and PERMISSION_PATH.search(f):
            flags['permission'] = True
        if copy_only or is_test(f):
            continue
        if is_baseline(f):
            ux_required.append(f'visual baseline: {f}')
        elif (re.match(r'^apps/frontend/src/(features|routes|lib/layout)/.*\.tsx$', f)
              or f.startswith('packages/ui/src/') or re.match(r'^apps/frontend/src/.*\.css$', f)):
            ux_required.append(f)
        elif f.startswith(('apps/frontend/src/', 'packages/shared/src/')) or UX_OPTIONAL.search(f):
            ux_optional.append(f)
        if FE_PERF_PATH.search(f) or (f.startswith(('apps/frontend/', 'packages/ui/')) and USE_FILE.search(f)):
            reasons['perf'].append(f'routing/fetch path: {f}')
        if re.search(r'^(apps/frontend|packages/ui)/package\.json$', f):
            reasons['perf'].append(f'dependency change: {f}')

    if any(PERMISSION_LINE.search(text) for _, text in changed):
        flags['permission'] = True
    fetching = sorted({f for f, text in changed
                       if f.startswith(('apps/frontend/', 'packages/ui/')) and QUERY_OPTS.search(text)})
    if fetching:
        reasons['perf'].append('query options or fetches changed: ' + ', '.join(fetching[:3]))
    # Repositories own queries, but a module service can still sort or page: Drizzle/SQL list calls count anywhere in
    # a backend module, while the generic `.from(` counts only in read and repository code.
    predicates = sorted({f for f, text in changed if f.startswith('apps/backend/src/modules/') and (
        (BE_READ.search(f) and SQL_LIST.search(text)) or SQL_LIST_ANYWHERE.search(text))})
    if predicates:
        reasons['perf'].append('list query changed in backend read code: ' + ', '.join(predicates[:3]))

    reasons['ux'] = ux_required or [f'optional: {f}' for f in ux_optional]
    ux = 'required' if ux_required else ('optional' if ux_optional else False)
    for key, values in reasons.items():
        if len(values) > 6:
            reasons[key] = values[:6] + [f'… +{len(values) - 6} more']
    print(json.dumps({
        'ok': True,
        'code': bool(reasons['code']),
        'ux': ux,
        'perf': bool(reasons['perf']),
        'flags': flags,
        'reasons': reasons,
        'files': len(files),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
