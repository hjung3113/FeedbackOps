#!/bin/bash
# biome-cmp.sh <worktree> <file>... — per file, biome error categories on origin/develop vs the branch.
# develop=[] branch=[x] → the branch introduced it: fix it (imports-only or format). Same on both → allowlist it
# in scripts/gates/frontend-biome-allowlist.txt ("<path> <category> -- pre-existing on develop (measured <date>); ...").
wt=$1; shift; cd "$wt" || exit 2; export PATH=/opt/homebrew/opt/node@22/bin:$PATH
cats() { npx biome check --reporter=json --max-diagnostics=500 "$1" 2>/dev/null | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{try{const j=JSON.parse(s);console.log(JSON.stringify([...new Set((j.diagnostics||[]).filter(d=>d.severity==="error").map(d=>d.category))].sort()))}catch(e){console.log("ERR")}})'; }
tmp=$(mktemp)
for f in "$@"; do cp "$f" "$tmp"; if git show origin/develop:"$f" > "$f" 2>/dev/null; then d=$(cats "$f"); else d="(new file)"; fi
  cp "$tmp" "$f"; b=$(cats "$f"); echo "$f develop=$d branch=$b"; done
rm -f "$tmp"
