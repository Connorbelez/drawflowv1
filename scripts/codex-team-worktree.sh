#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/codex-team-worktree.sh --ticket <slug> --role <slug> [--base <ref>]

Create one isolated worktree and branch for a writing Codex team agent.

Options:
  --ticket <slug>  Ticket or task identifier, for example eng-449
  --role <slug>    Agent role, for example implementation or reviewer
  --base <ref>    Git ref or SHA to branch from (default: HEAD)
  --help           Show this help

The worktree root can be changed with CODEX_TEAM_WORKTREE_ROOT. The default
is ~/.codex/worktrees/<repository>/<ticket>-<role>.
EOF
}

ticket=""
role=""
base_ref="HEAD"

while (($# > 0)); do
  case "$1" in
    --ticket)
      [[ $# -ge 2 ]] || { echo "--ticket requires a value" >&2; exit 2; }
      ticket="$2"
      shift 2
      ;;
    --role)
      [[ $# -ge 2 ]] || { echo "--role requires a value" >&2; exit 2; }
      role="$2"
      shift 2
      ;;
    --base)
      [[ $# -ge 2 ]] || { echo "--base requires a value" >&2; exit 2; }
      base_ref="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$ticket" || -z "$role" ]]; then
  echo "Both --ticket and --role are required." >&2
  usage >&2
  exit 2
fi

if [[ ! "$ticket" =~ ^[[:alnum:]][[:alnum:]_.-]*$ ]]; then
  echo "Invalid ticket slug: $ticket" >&2
  exit 2
fi

if [[ ! "$role" =~ ^[[:alnum:]][[:alnum:]_.-]*$ ]]; then
  echo "Invalid role slug: $role" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Run this command from inside a Git repository." >&2
  exit 1
}

base_sha="$(git rev-parse "${base_ref}^{commit}" 2>/dev/null)" || {
  echo "Could not resolve base ref: $base_ref" >&2
  exit 1
}

project_name="$(basename "$repo_root")"
worktree_root="${CODEX_TEAM_WORKTREE_ROOT:-${HOME}/.codex/worktrees}"
worktree_path="${worktree_root%/}/${project_name}/${ticket}-${role}"
branch_name="codex/${ticket}-${role}"

if [[ -e "$worktree_path" ]]; then
  echo "Worktree path already exists: $worktree_path" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  echo "Branch already exists: $branch_name" >&2
  exit 1
fi

mkdir -p "$(dirname "$worktree_path")"
git worktree add -b "$branch_name" "$worktree_path" "$base_sha"

cat <<EOF

Created isolated Codex worktree
  path:   $worktree_path
  branch: $branch_name
  base:   $base_sha

Open it in cmux:
  cmux "$worktree_path"

Launch the team from that worktree:
  cd "$worktree_path"
  scripts/cmux-codex-teams.sh
EOF
