#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
hook="$root/.git/hooks/pre-push"
src="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/pre-push"

if [ -f "$hook" ] && ! grep -q "skillgate" "$hook"; then
  echo "refusing to overwrite existing pre-push hook: $hook" >&2
  echo "merge the skillgate call manually, or move the existing hook aside." >&2
  exit 1
fi

cp "$src" "$hook"
chmod +x "$hook"
echo "installed $hook"
