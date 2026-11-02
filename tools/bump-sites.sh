#!/bin/sh
# Points every site's import of pages-common at a new release. Doesn't commit.
# Usage: tools/bump-sites.sh 1.0.1
[ -n "$1" ] || { echo "usage: $0 <version>"; exit 1; }
for site in rummikub notes korean-dict filedrop podcast-player spider-solitaire dual-subs-remote; do
  for f in "$HOME/projects/$site"/*.js; do
    grep -q "pages-common@" "$f" || continue
    sed -i '' -E "s#pages-common@[0-9]+\.[0-9]+\.[0-9]+/#pages-common@$1/#g" "$f"
    echo "$site/$(basename "$f")"
  done
done
