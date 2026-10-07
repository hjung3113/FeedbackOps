#!/usr/bin/env python3
"""app-preview.py — run a checkout's frontend (and optionally its backend) on free ports for real-app checks.

  app-preview.py start <checkout> [--backend] [--env <file>] [--name <label>]
  app-preview.py stop <label>
  app-preview.py status

`start` serves the checkout's vite on a free port. Its dev proxy goes to:

- the user's backend on :3011 (develop code) by default;
- with `--backend`, to that checkout's own backend, started on another free port.

The backend env comes from the main checkout's `.env` (the dev DB on :5434) unless `--env` names another file, e.g. a
throwaway `$WAVE_STATE/env.verify.<n>`. Anything the UI writes goes to that database, so use the throwaway env
when the check writes.

Each process starts in its own session and `stop` kills the whole process group. That covers npx → node children,
which a bare PID kill misses. The temporary vite config is an `.mts` file in `$WAVE_STATE`. It imports the
checkout's `vite.config.ts` and remaps only `server.proxy` targets: a `.ts` config outside the package is bundled as
CJS and fails on ESM-only plugins.

The state is kept in `$WAVE_STATE/preview-<label>.json`. Prints one JSON line.
"""
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

NODE22 = '/opt/homebrew/opt/node@22/bin'
USER_BACKEND_PORT = 3011


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


def wait_http(url, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def spawn(cmd, cwd, env, log):
    with open(log, 'w') as out, open(os.devnull) as null:
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=null, stdout=out, stderr=subprocess.STDOUT,
                                start_new_session=True)
    return proc.pid


def kill_group(pid):
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    for _ in range(20):
        try:
            os.killpg(pid, 0)
        except ProcessLookupError:
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


def start(args):
    states = state_dir()
    checkout = Path(args.checkout).resolve()
    frontend = checkout / 'apps' / 'frontend'
    backend = checkout / 'apps' / 'backend'
    if not (frontend / 'vite.config.ts').is_file():
        fail(f'not a FeedbackOps checkout: {checkout}', 2)
    label = args.name or checkout.name
    state_path = states / f'preview-{label}.json'
    if state_path.exists():
        fail(f'preview {label} is already running; stop it first', 2)
    env = dict(os.environ)
    env['PATH'] = f'{NODE22}:{env.get("PATH", "")}'

    # A fresh worktree has no gitignored route tree; vite would serve a broken app.
    if not (frontend / 'src' / 'routeTree.gen.ts').exists():
        subprocess.run(['node', 'scripts/generate-routes.mjs'], cwd=checkout, env=env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    state = {'name': label, 'checkout': str(checkout), 'pids': []}
    backend_port = USER_BACKEND_PORT
    if args.backend:
        main_checkout = Path(os.environ.get('FOPS_MAIN', checkout))
        env_file = Path(args.env) if args.env else main_checkout / '.env'
        if not env_file.is_file():
            fail(f'backend env file not found: {env_file}', 2)
        backend_port = free_port()
        backend_env = {**env, **read_env_file(env_file), 'PORT': str(backend_port)}
        if backend_env.get('NODE_ENV') == 'production':
            fail('refusing NODE_ENV=production', 2)
        pid = spawn(['npx', 'tsx', 'src/index.ts'], backend, backend_env, states / f'preview-{label}-backend.log')
        state['pids'].append(pid)
        state.update(backend_port=backend_port, backend_env=str(env_file))
        state_path.write_text(json.dumps(state) + '\n')
        if not wait_http(f'http://127.0.0.1:{backend_port}/health', 90):
            for p in state['pids']:
                kill_group(p)
            state_path.unlink(missing_ok=True)
            fail(f'backend did not become healthy; see {states / f"preview-{label}-backend.log"}')

    frontend_port = free_port()
    config = states / f'preview-{label}.vite.config.mts'
    config.write_text(
        '// Generated by app-preview.py — remaps only the dev proxy targets.\n'
        f"import base from {json.dumps(str(frontend / 'vite.config.ts'))};\n"
        'const proxy = Object.fromEntries(\n'
        '  Object.entries(base.server?.proxy ?? {}).map(([key, value]) => [\n'
        '    key,\n'
        "    typeof value === 'string'\n"
        f"      ? value.replace(':{USER_BACKEND_PORT}', ':{backend_port}')\n"
        f"      : {{ ...value, target: String(value.target).replace(':{USER_BACKEND_PORT}', ':{backend_port}') }},\n"
        '  ]),\n'
        ');\n'
        f'export default {{ ...base, server: {{ ...base.server, port: {frontend_port}, strictPort: true, proxy }} }};\n'
    )
    pid = spawn(['npx', 'vite', '--config', str(config)], frontend, env, states / f'preview-{label}-vite.log')
    state['pids'].append(pid)
    state.update(frontend_port=frontend_port, url=f'http://localhost:{frontend_port}', vite_config=str(config))
    state_path.write_text(json.dumps(state) + '\n')
    if not wait_http(f'http://localhost:{frontend_port}/', 90):
        for p in state['pids']:
            kill_group(p)
        state_path.unlink(missing_ok=True)
        fail(f'vite did not start; see {states / f"preview-{label}-vite.log"}')
    emit({'ok': True, 'command': 'start', **state,
          'api': f'branch backend :{backend_port}' if args.backend else f'user backend :{USER_BACKEND_PORT} (develop code)'})


def stop(args):
    states = state_dir()
    state_path = states / f'preview-{args.name}.json'
    if not state_path.exists():
        fail(f'no preview named {args.name}', 2)
    state = json.loads(state_path.read_text())
    for pid in state.get('pids', []):
        kill_group(pid)
    if state.get('vite_config'):
        Path(state['vite_config']).unlink(missing_ok=True)
    state_path.unlink()
    emit({'ok': True, 'command': 'stop', 'name': args.name})


def status(_args):
    states = state_dir()
    previews = [json.loads(p.read_text()) for p in sorted(states.glob('preview-*.json'))]
    emit({'ok': True, 'command': 'status', 'previews': previews})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    p_start = sub.add_parser('start')
    p_start.add_argument('checkout')
    p_start.add_argument('--backend', action='store_true', help="also run the checkout's backend")
    p_start.add_argument('--env', help='backend env file (default: $FOPS_MAIN/.env, the dev DB)')
    p_start.add_argument('--name', help='label (default: checkout directory name)')
    p_stop = sub.add_parser('stop')
    p_stop.add_argument('name')
    sub.add_parser('status')
    args = parser.parse_args()
    {'start': start, 'stop': stop, 'status': status}[args.command](args)


if __name__ == '__main__':
    main()
