#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/cmux-codex-teams.sh [--allow-dirty] [-- codex-args...]

Launch the cmux-managed Codex team from this repository.

The wrapper refuses a dirty checkout by default. Use --allow-dirty only for
read-only planning/review work or when every write is explicitly isolated.
Arguments after --, and all unrecognized arguments, are passed to Codex.
EOF
}

allow_dirty=false
codex_args=()

while (($# > 0)); do
  case "$1" in
    --allow-dirty)
      allow_dirty=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    --)
      shift
      codex_args+=("$@")
      break
      ;;
    *)
      codex_args+=("$1")
      shift
      ;;
  esac
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

if ! git -C "$repo_root" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "This launcher must live inside a Git repository: $repo_root" >&2
  exit 1
fi

dirty_state="$(git -C "$repo_root" status --porcelain)"
if [[ -n "$dirty_state" && "$allow_dirty" != true ]]; then
  cat >&2 <<EOF
Refusing to launch a writing team from a dirty checkout.

Checkout: $repo_root
Branch:   $(git -C "$repo_root" branch --show-current || true)
HEAD:     $(git -C "$repo_root" rev-parse --short HEAD)

Create an isolated worktree with scripts/codex-team-worktree.sh, or pass
--allow-dirty for read-only work whose writes are explicitly isolated.
EOF
  exit 2
fi

if [[ -n "${CMUX_BIN:-}" ]]; then
  cmux_bin="$CMUX_BIN"
elif command -v cmux >/dev/null 2>&1; then
  cmux_bin="$(command -v cmux)"
elif [[ -x /Applications/cmux.app/Contents/Resources/bin/cmux ]]; then
  cmux_bin="/Applications/cmux.app/Contents/Resources/bin/cmux"
else
  cat >&2 <<'EOF'
cmux was not found. Install cmux, or set CMUX_BIN to its CLI path.
Expected app-bundled path:
  /Applications/cmux.app/Contents/Resources/bin/cmux
EOF
  exit 1
fi

if [[ ! -x "$cmux_bin" ]]; then
  echo "CMUX_BIN is not executable: $cmux_bin" >&2
  exit 1
fi

echo "Starting Codex team"
echo "  repository: $repo_root"
echo "  branch:     $(git -C "$repo_root" branch --show-current || true)"
echo "  HEAD:       $(git -C "$repo_root" rev-parse --short HEAD)"
echo "  cmux:       $cmux_bin"

exec "$cmux_bin" codex-teams "${codex_args[@]}"
