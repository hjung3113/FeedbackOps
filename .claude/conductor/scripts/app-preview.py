#!/usr/bin/env python3
"""app-preview.py — run a checkout's frontend (and optionally its backend) on free ports for real-app checks.

  app-preview.py start <checkout> [--backend --env <file> [--seed]] [--name <label>]
  app-preview.py stop <label> | --all
  app-preview.py status

`start` serves the checkout's vite on a free port at `http://<label>.localhost:<port>`.

Each preview gets its own host because the session cookie is host-only and is not scoped by port. Two previews (or
a preview and the owner's :3010) would otherwise overwrite each other's login. Chromium resolves `*.localhost` to
loopback.

The dev proxy goes to:

- **without `--backend`:** the user's backend on :3011 (develop code, the owner's dev DB). Use this only for the
  conductor's own quick checks, never for reviewers: logging in writes session and audit rows.
- **with `--backend`:** the checkout's own backend on a free port.
  - It **requires `--env`** naming a throwaway env (`$WAVE_STATE/env.verify.<n>` from `verify-db.sh`). An env whose
    database URL points at port 5434 (the dev DB) is refused. A branch backend boots pg-boss with supervise and
    schedule on, so on the dev DB it would work the owner's live job queue with unreviewed code.
  - `--seed` runs the idempotent seed with `SEED_MODE=personas` first, so every mock persona can log in.
    After the backend is healthy it runs `preview-fixtures.mjs`, which creates one `[preview]` record per
    drawer surface, including Task Request (one converted, one pending). A fixtures failure is a warning on
    the start JSON (`fixtures`), not a failed start. The child's stdout and stderr are written to
    `$WAVE_STATE/preview-<label>-fixtures.log` and are not copied into that JSON.

Each process starts in its own session, and `stop` kills the whole process group (npx → node children). Backends
carry a `--fops-preview=<label>` argument, and vite configs are named `preview-<label>.vite.config.mts`. That lets
`status` and `stop --all` find orphans left by an ended session through `ps`. The generated config is an `.mts` file:
a `.ts` config outside the package is bundled as CJS and fails on ESM-only plugins. It imports the checkout's
`vite.config.ts` and changes only the port, `allowedHosts` and the proxy targets.

State is kept in `$WAVE_STATE/preview-<label>.json`. Prints one JSON line. Before a handoff, `status` must be empty.
"""
import argparse
import json
import os
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

NODE22 = '/opt/homebrew/opt/node@22/bin'
USER_BACKEND_PORT = 3011
DEV_DB_PORT = '5434'


def emit(obj, code=0):
    print(json.dumps(obj))
    sys.exit(code)


def fail(message, code=1):
    emit({'ok': False, 'error': message}, code)


def state_dir():
    raw = os.environ.get('WAVE_STATE')
    if not raw:
        fail('set WAVE_STATE to the wave scratch directory', 2)
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def http_ok(url, timeout=2):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status < 500
    except Exception:
        return False


def wait_http(url, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if http_ok(url):
            return True
        time.sleep(0.5)
    return False


def spawn(cmd, cwd, env, log):
    with open(log, 'w') as out, open(os.devnull) as null:
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=null, stdout=out, stderr=subprocess.STDOUT,
                                start_new_session=True)
    return proc.pid


def alive(pid):
    try:
        os.killpg(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def kill_group(pid):
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    for _ in range(20):
        if not alive(pid):
            return
        time.sleep(0.25)
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def read_env_file(path):
    env = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.removeprefix('export ').strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        env[key] = value
    return env


def _as_text(value):
    if value is None:
        return ''
    if isinstance(value, bytes):
        return value.decode('utf-8', 'replace')
    return value


def _write_fixtures_log(log_path, stdout, stderr):
    Path(log_path).write_text(f'--- stdout ---\n{_as_text(stdout)}\n--- stderr ---\n{_as_text(stderr)}')


def _project_ref(value):
    if not isinstance(value, dict) or 'id' not in value or 'display_id' not in value:
        return None
    if not (value['id'] is None or isinstance(value['id'], str)):
        return None
    if not (value['display_id'] is None or isinstance(value['display_id'], str)):
        return None
    return {'id': value['id'], 'display_id': value['display_id']}


def project_fixtures_result(result):
    """Keep ok/created/reused/failed. Anything else is a fixed shape error."""
    unexpected = {'ok': False, 'error': 'preview fixtures JSON had an unexpected shape'}
    if not isinstance(result, dict) or not isinstance(result.get('ok'), bool):
        return dict(unexpected)
    created, reused, failed = result.get('created'), result.get('reused'), result.get('failed')
    if not isinstance(created, dict) or not isinstance(reused, list) or not isinstance(failed, list):
        return dict(unexpected)
    projected_created = {}
    for kind, ref in created.items():
        projected = _project_ref(ref)
        if not isinstance(kind, str) or projected is None:
            return dict(unexpected)
        projected_created[kind] = projected
    projected_reused = []
    for row in reused:
        projected = _project_ref(row) if isinstance(row, dict) else None
        if projected is None or not isinstance(row.get('kind'), str):
            return dict(unexpected)
        projected_reused.append({
            'kind': row['kind'],
            'id': projected['id'],
            'display_id': projected['display_id'],
        })
    projected_failed = []
    for row in failed:
        if not isinstance(row, dict):
            return dict(unexpected)
        step, status, code = row.get('step'), row.get('status'), row.get('code')
        if (
            not isinstance(step, str)
            or isinstance(status, bool)
            or not isinstance(status, int)
            or not isinstance(code, str)
        ):
            return dict(unexpected)
        projected_failed.append({'step': step, 'status': status, 'code': code})
    return {'ok': result['ok'], 'created': projected_created, 'reused': projected_reused, 'failed': projected_failed}


def run_preview_fixtures(port, env, log_path):
    """One [preview] record per drawer, Task Request (one converted, one pending).

    Failure is a result object, not an exception. Child stdout and stderr are written to
    log_path and are never returned.
    """
    script = Path(__file__).resolve().parent / 'preview-fixtures.mjs'
    node = str(Path(NODE22) / 'node')
    log_path = Path(log_path)
    try:
        proc = subprocess.run(
            [node, str(script), '--api', f'http://127.0.0.1:{port}'],
            capture_output=True, text=True, env=env, timeout=120,
        )
    except subprocess.TimeoutExpired as exc:
        _write_fixtures_log(log_path, exc.stdout, exc.stderr)
        return {'ok': False, 'error': f'preview fixtures timed out; see {log_path}'}
    except OSError as exc:
        return {'ok': False, 'error': f'preview fixtures failed to start: {exc}'}
    _write_fixtures_log(log_path, proc.stdout, proc.stderr)
    line = next(
        (candidate.strip() for candidate in reversed(proc.stdout.splitlines()) if candidate.strip()),
        '',
    )
    if not line:
        return {'ok': False, 'error': f'preview fixtures produced no JSON; see {log_path}'}
    try:
        result = json.loads(line)
    except json.JSONDecodeError:
        return {'ok': False, 'error': f'preview fixtures produced invalid JSON; see {log_path}'}
    return project_fixtures_result(result)


def db_port(url):
    match = re.search(r'@[^:/]+:(\d+)/', url or '')
    return match.group(1) if match else None


def orphans():
    """Preview processes visible in `ps` (by marker); the caller filters out the ones it tracks."""
    out = subprocess.run(['ps', '-axo', 'pid=,pgid=,command='], text=True, capture_output=True).stdout
    found = []
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        pid, pgid, command = int(parts[0]), int(parts[1]), parts[2]
        marker = re.search(r'--fops-preview=([\w.-]+)|preview-([\w.-]+)\.vite\.config\.mts', command)
        if marker and pid == pgid:
            found.append({'pid': pid, 'label': marker.group(1) or marker.group(2), 'command': command[:120]})
    return found


def start(args):
    states = state_dir()
    checkout = Path(args.checkout).resolve()
    frontend = checkout / 'apps' / 'frontend'
    backend = checkout / 'apps' / 'backend'
    if not (frontend / 'vite.config.ts').is_file():
        fail(f'not a FeedbackOps checkout: {checkout}', 2)
    label = re.sub(r'[^a-z0-9-]', '-', (args.name or checkout.name).lower()).strip('-') or 'preview'
    state_path = states / f'preview-{label}.json'
    if state_path.exists():
        fail(f'preview {label} is already running; stop it first', 2)
    if args.seed and not args.backend:
        fail('--seed needs --backend', 2)
    env = dict(os.environ)
    env['PATH'] = f'{NODE22}:{env.get("PATH", "")}'

    # A fresh worktree has no gitignored route tree; vite would serve a broken app.
    if not (frontend / 'src' / 'routeTree.gen.ts').exists():
        subprocess.run(['node', 'scripts/generate-routes.mjs'], cwd=checkout, env=env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    state = {'name': label, 'checkout': str(checkout), 'pids': []}
    backend_port = USER_BACKEND_PORT
    warnings = []
    fixtures = None
    if args.backend:
        if not args.env:
            fail('--backend needs --env <throwaway env file> (verify-db.sh create <n> writes $WAVE_STATE/env.verify.<n>)', 2)
        env_file = Path(args.env)
        if not env_file.is_file():
            fail(f'backend env file not found: {env_file}', 2)
        backend_env = {**env, **read_env_file(env_file)}
        for key in ('DATABASE_URL', 'DATABASE_URL_MIGRATE'):
            if db_port(backend_env.get(key)) == DEV_DB_PORT:
                fail(f'refusing {key} on port {DEV_DB_PORT} (the dev DB); use a throwaway env', 2)
        if backend_env.get('NODE_ENV') == 'production':
            fail('refusing NODE_ENV=production', 2)
        if args.seed:
            seed = subprocess.run(['npx', 'tsx', 'src/seed/index.ts'], cwd=backend,
                                  env={**backend_env, 'SEED_MODE': 'personas'}, capture_output=True, text=True)
            if seed.returncode != 0:
                fail(f'seed failed: {seed.stderr.strip()[-300:]}')
        backend_port = free_port()
        backend_env['PORT'] = str(backend_port)
        pid = spawn(['npx', 'tsx', 'src/index.ts', f'--fops-preview={label}'], backend, backend_env,
                    states / f'preview-{label}-backend.log')
        state['pids'].append(pid)
        state.update(backend_port=backend_port, backend_env=str(env_file))
        state_path.write_text(json.dumps(state) + '\n')
        if not wait_http(f'http://127.0.0.1:{backend_port}/health', 90):
            for p in state['pids']:
                kill_group(p)
            state_path.unlink(missing_ok=True)
            fail(f'backend did not become healthy; see {states / f"preview-{label}-backend.log"}')
        if args.seed:
            fixtures = run_preview_fixtures(backend_port, env, states / f'preview-{label}-fixtures.log')
            if fixtures.get('ok') is not True:
                warnings.append('preview fixtures did not succeed; see the fixtures field')
    elif not http_ok(f'http://127.0.0.1:{USER_BACKEND_PORT}/health'):
        warnings.append(f'the user backend on :{USER_BACKEND_PORT} is not answering; API calls will fail')

    frontend_port = free_port()
    config = states / f'preview-{label}.vite.config.mts'
    config.write_text(
        '// Generated by app-preview.py: changes only the port, allowedHosts and the dev proxy targets.\n'
        f"import base from {json.dumps(str(frontend / 'vite.config.ts'))};\n"
        'const proxy = Object.fromEntries(\n'
        '  Object.entries(base.server?.proxy ?? {}).map(([key, value]) => [\n'
        '    key,\n'
        "    typeof value === 'string'\n"
        f"      ? value.replace(':{USER_BACKEND_PORT}', ':{backend_port}')\n"
        f"      : {{ ...value, target: String(value.target).replace(':{USER_BACKEND_PORT}', ':{backend_port}') }},\n"
        '  ]),\n'
        ');\n'
        'export default {\n'
        '  ...base,\n'
        f"  server: {{ ...base.server, port: {frontend_port}, strictPort: true, allowedHosts: ['.localhost'], proxy }},\n"
        '};\n'
    )
    pid = spawn(['npx', 'vite', '--config', str(config)], frontend, env, states / f'preview-{label}-vite.log')
    state['pids'].append(pid)
    state.update(frontend_port=frontend_port, url=f'http://{label}.localhost:{frontend_port}', vite_config=str(config))
    state_path.write_text(json.dumps(state) + '\n')
    if not wait_http(f'http://localhost:{frontend_port}/', 90):
        for p in state['pids']:
            kill_group(p)
        state_path.unlink(missing_ok=True)
        fail(f'vite did not start; see {states / f"preview-{label}-vite.log"}')
    api = (f'checkout backend :{backend_port} on {state["backend_env"]}' if args.backend
           else f'user backend :{USER_BACKEND_PORT} (develop code, dev DB): conductor checks only, not reviewers')
    payload = {'ok': True, 'command': 'start', **state, 'api': api, 'warnings': warnings}
    if args.seed:
        payload['fixtures'] = fixtures
    emit(payload)


def stop_one(states, label):
    state_path = states / f'preview-{label}.json'
    if not state_path.exists():
        return False
    state = json.loads(state_path.read_text())
    for pid in state.get('pids', []):
        kill_group(pid)
    if state.get('vite_config'):
        Path(state['vite_config']).unlink(missing_ok=True)
    state_path.unlink()
    return True


def stop(args):
    states = state_dir()
    if args.all:
        stopped = [p.name[len('preview-'):-len('.json')] for p in sorted(states.glob('preview-*.json'))]
        for label in stopped:
            stop_one(states, label)
        killed = []
        for orphan in orphans():
            kill_group(orphan['pid'])
            killed.append(orphan)
        emit({'ok': True, 'command': 'stop', 'stopped': stopped, 'orphans_killed': killed})
    if not args.name:
        fail('stop needs <label> or --all', 2)
    if not stop_one(states, args.name):
        fail(f'no preview named {args.name}', 2)
    emit({'ok': True, 'command': 'stop', 'name': args.name})


def status(_args):
    states = state_dir()
    previews = []
    tracked = set()
    for path in sorted(states.glob('preview-*.json')):
        state = json.loads(path.read_text())
        state['alive'] = [pid for pid in state.get('pids', []) if alive(pid)]
        tracked.update(state.get('pids', []))
        previews.append(state)
    untracked = [o for o in orphans() if o['pid'] not in tracked]
    emit({'ok': True, 'command': 'status', 'previews': previews, 'orphans': untracked})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    p_start = sub.add_parser('start')
    p_start.add_argument('checkout')
    p_start.add_argument('--backend', action='store_true', help="also run the checkout's backend (needs --env)")
    p_start.add_argument('--env', help='throwaway backend env file, e.g. $WAVE_STATE/env.verify.<n>')
    p_start.add_argument('--seed', action='store_true',
                         help='personas seed, then one [preview] record per drawer surface')
    p_start.add_argument('--name', help='label and host prefix (default: checkout directory name)')
    p_stop = sub.add_parser('stop')
    p_stop.add_argument('name', nargs='?')
    p_stop.add_argument('--all', action='store_true', help='stop every tracked preview and kill orphans')
    sub.add_parser('status')
    args = parser.parse_args()
    {'start': start, 'stop': stop, 'status': status}[args.command](args)


if __name__ == '__main__':
    main()
