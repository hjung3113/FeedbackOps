#!/usr/bin/env python3
"""nav-perf-summary.py <result.json> [<log>]: print nav-perf.sh's plain-text table and step-7d breach verdict.

The second base is compared with the first; a single base reports only timeouts. A target breaches when its
median readyMs exceeds first x 1.2 + 50, it reloads only in the second base, its median apiCalls grows by 2 or
more, or it timed out. A target with no usable sample on a compared base (all excluded, e.g. 429) is
`inconclusive`, not `ok`. Exit 1 when the result is missing, recorded errors, or any target is inconclusive (rerun
before accepting it); a breach alone exits 0 (the verdict line reports it).
"""
import json
import os
import sys


def breach_reasons(a, b):
    why = []
    if a is None:
        return ['timedOut'] if b['timedOut'] else []
    if a['readyMs'] is not None and b['readyMs'] is not None and b['readyMs'] > a['readyMs'] * 1.2 + 50:
        why.append('slower')
    if b['reloaded'] and not a['reloaded']:
        why.append('reloaded')
    if a['apiCalls'] is not None and b['apiCalls'] is not None and b['apiCalls'] >= a['apiCalls'] + 2:
        why.append('apiCalls+2')
    if b['timedOut']:
        why.append('timedOut')
    return why


def main(argv):
    out = argv[1]
    log = argv[2] if len(argv) > 2 else None
    if not os.path.exists(out):
        print(f'nav-perf: no result at {out}' + (f'; see {log}' if log else ''))
        return 1
    with open(out) as f:
        d = json.load(f)
    labels = [b['label'] for b in d['config']['bases']]
    per = d['perBase']
    ref = labels[0]
    cand = labels[1] if len(labels) > 1 else labels[0]
    print(f"nav-perf: out={out} samples={len(d['rows'])} errors={len(d['errors'])}" + (f' log={log}' if log else ''))
    print(f"{'href':<34}{ref + ' ms':>14}{cand + ' ms':>14}{'api':>10}  verdict")
    breaches = []
    inconclusive = []
    for href in d['config']['targets']:
        a, b = per[ref][href], per[cand][href]
        empty = [label for label in {ref, cand} if per[label][href]['samples'] == 0]
        if empty:
            inconclusive.append(href)
            excluded = ', '.join(f"{label} {per[label][href]['rateLimitedSamples']} excluded" for label in sorted(empty))
            why = [f'inconclusive: no usable sample ({excluded})']
        else:
            why = breach_reasons(a if len(labels) > 1 else None, b)
        if why and not empty:
            breaches.append(href)
        api = f"{a['apiCalls']}/{b['apiCalls']}"
        print(f"{href:<34}{str(a['readyMs']):>14}{str(b['readyMs']):>14}{api:>10}  {', '.join(why) or 'ok'}")
    print(f"breach: {', '.join(breaches) if breaches else 'none'}")
    if inconclusive:
        print(f"inconclusive: {', '.join(inconclusive)}")
    for err in d['errors']:
        print(f'error: {json.dumps(err)[:200]}')
    return 1 if d['errors'] or inconclusive else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
