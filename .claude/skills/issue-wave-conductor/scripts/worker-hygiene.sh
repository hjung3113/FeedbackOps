#!/bin/bash
# worker-hygiene.sh <worktree> — the two worker violations that recurred in sessions 59, 61, 63 and 65.
#   1. A new `biome-ignore` suppression fails the check: allowlisted diagnostics need none and briefs forbid them
#      (none in the last 25 merged PRs, so no false positives).
#   2. Whitespace-only churn is reported, not failed: files with more than HYGIENE_WS_LINES (default 6) changed
#      lines that differ only in whitespace. Re-indenting code under a new wrapper is legitimate (#940's
#      TriageActions had 30 such lines), so the conductor reads the diff of each listed file before committing.
# Only product sources (apps/, packages/) count. Compares the working tree (commits + uncommitted + untracked) with the merge-base of HYGIENE_BASE
# (default origin/develop).
wt=${1:?usage: worker-hygiene.sh <worktree>}; cd "$wt" || exit 2
base=${HYGIENE_BASE:-origin/develop}; limit=${HYGIENE_WS_LINES:-6}
mb=$(git merge-base "$base" HEAD) || exit 2
found=0

ignores=$(git diff -U0 "$mb" -- apps packages ':(exclude)*.png' | awk '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+/ && /biome-ignore/ { print file ": " substr($0, 2) }')
untracked_ignores=$(git ls-files --others --exclude-standard -z -- apps packages | xargs -0 grep -Hn 'biome-ignore' 2>/dev/null)
if [ -n "$ignores$untracked_ignores" ]; then
  found=1
  echo "NEW biome-ignore (forbidden; allowlisted diagnostics need no suppression):"
  printf '%s\n' "$ignores" "$untracked_ignores" | sed '/^$/d; s/^/  /'
fi

churn=$(awk -F'\t' -v limit="$limit" '
  FILENAME == ARGV[1] { if ($1 != "-") ws[$3] = $1 + $2; next }
  $1 != "-" { d = $1 + $2 - ws[$3]; if (d > limit) print "  " $3 ": " d " changed lines differ only in whitespace" }' \
  <(git diff -w --numstat "$mb" -- .) <(git diff --numstat "$mb" -- .))
if [ -n "$churn" ]; then
  echo "Review (not a failure): whitespace-only lines; confirm each is re-indentation the change needed:"
  echo "$churn"
fi

[ "$found" -eq 0 ] && echo "worker-hygiene: no new biome-ignore"
exit "$found"
