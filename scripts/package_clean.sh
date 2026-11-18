#!/bin/sh
# Submission archive. Secrets, git metadata, caches, dependencies, and the local database stay out.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
out="$root/vanta-protocol-submission.zip"
cd "$root"
rm -f "$out"
zip -r "$out" . \
  -x "*.git/*" \
  -x ".env" \
  -x ".env.*" \
  -x "!.env.example" \
  -x ".cursor/*" \
  -x ".pytest_cache/*" \
  -x "*__pycache__/*" \
  -x "node_modules/*" \
  -x "*/node_modules/*" \
  -x "venv/*" \
  -x "*.db" \
  -x "*.db-*" \
  -x "frontend/dist/*"
echo "Wrote $out"
