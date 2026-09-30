#!/bin/bash
# watch-any.sh — block until the first not-yet-seen report sentinel appears, print "DONE <id>", exit.
# Spec lines in $WAVE_STATE/watch-spec.txt:  ID|/absolute/report/path.md|<!-- SENTINEL -->
# Run it with the Bash tool's run_in_background (never `cmd &`); restart it after every notification.
: "${WAVE_STATE:?set WAVE_STATE to the wave state dir}"
seen=$WAVE_STATE/seen.txt; spec=$WAVE_STATE/watch-spec.txt; touch "$seen"
while true; do
  while IFS='|' read -r id f s; do [ -z "$id" ] && continue
    if ! grep -qx "$id" "$seen" && [ -f "$f" ] && grep -qF -- "$s" "$f"; then echo "$id" >> "$seen"; echo "DONE $id"; exit 0; fi
  done < "$spec"; sleep 30
done
