#!/usr/bin/env bash
# Downloads every Content > Files asset (plus the best rendition of each
# video) from the OLD store's CDN into ./media/. Run this from any machine
# with normal internet access BEFORE the old Shopify store is closed —
# CDN links die when the store does. Then bulk-upload ./media/ to the new
# store via Admin > Content > Files.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p media
fail=0
while IFS= read -r url; do
  [ -z "$url" ] && continue
  fname=$(basename "${url%%\?*}")
  if [ -s "media/$fname" ]; then echo "skip   $fname"; continue; fi
  if curl -sfL "$url" -o "media/$fname"; then echo "ok     $fname"
  else echo "FAILED $url"; fail=1; fi
done < media-manifest.txt
exit $fail
