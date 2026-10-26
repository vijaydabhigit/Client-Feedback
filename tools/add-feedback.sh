#!/usr/bin/env bash
# Client Feedback: add (or remove with --remove) the widget line on every HTML page. Mac / Linux.
# Run from the site folder that contains the feedback folder:
#   bash tools/add-feedback.sh            # add
#   bash tools/add-feedback.sh --remove   # remove before go-live
REMOVE=0; ROOT=.
for a in "$@"; do if [ "$a" = "--remove" ]; then REMOVE=1; else ROOT="$a"; fi; done
cd "$ROOT" || exit 1
if [ $REMOVE = 0 ] && [ ! -f feedback/feedback.js ]; then
  echo "No feedback/feedback.js found in $(pwd). Copy the feedback folder into the site first."; exit 1
fi
n=0
while IFS= read -r -d '' f; do
  rel="${f#./}"
  if [ $REMOVE = 1 ]; then
    grep -q 'feedback/feedback\.js' "$f" || continue
    perl -0pi -e 's{[ \t]*<script src="[^"]*feedback/feedback\.js"[^>]*></script>\r?\n?}{}g' "$f"
    echo "Removed: $f"; n=$((n+1)); continue
  fi
  if grep -q 'feedback/feedback\.js' "$f"; then echo "Already has it: $f"; continue; fi
  if ! grep -qi '</body>' "$f"; then echo "Skipped (no </body>): $f"; continue; fi
  depth=$(awk -F/ '{print NF-1}' <<< "$rel")
  prefix=$(printf '../%.0s' $(seq 1 "$depth") 2>/dev/null); [ "$depth" = 0 ] && prefix=""
  TAG="<script src=\"${prefix}feedback/feedback.js\" defer></script>" perl -0pi -e 's{(</body>)(?!.*</body>)}{$ENV{TAG}\n$1}is' "$f"
  echo "Added:   $f"; n=$((n+1))
done < <(find . -type f \( -iname '*.html' -o -iname '*.htm' \) -not -path './feedback/*' -not -path '*/node_modules/*' -not -path '*/.*/*' -print0)
echo "Done: $n page(s) $([ $REMOVE = 1 ] && echo cleaned || echo updated)."
