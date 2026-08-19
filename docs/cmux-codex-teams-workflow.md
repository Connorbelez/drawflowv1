# cmux + Codex Teams workflow

This repository has two small helpers for running Codex teams in cmux:

- scripts/cmux-codex-teams.sh launches cmux's native codex-teams wrapper.
- scripts/codex-team-worktree.sh creates one branch and worktree for a
  writing agent.

The cmux wrapper creates the visual team layout. Git worktrees still define
which agent owns which files. Do not let parallel agents edit the same
checkout or overlapping files.

## One-time machine setup

cmux is installed as an app on this machine. If its CLI is not on PATH, use
the app-bundled binary or add the Homebrew link:

~~~bash
CMUX_CLI=/Applications/cmux.app/Contents/Resources/bin/cmux
test -x "$CMUX_CLI"
"$CMUX_CLI" hooks setup codex --yes
~~~

If command -v cmux is still empty and /opt/homebrew/bin is writable:

~~~bash
ln -s "$CMUX_CLI" /opt/homebrew/bin/cmux
~~~

Confirm the integration:

~~~bash
cmux version
codex features list | rg 'multi_agent|multi_agent_v2'
~~~

## Start a team

Open this repository in a cmux workspace, then launch the root Codex session:

~~~bash
cmux "$PWD"
scripts/cmux-codex-teams.sh
~~~

The wrapper forwards Codex arguments:

~~~bash
scripts/cmux-codex-teams.sh -- --model gpt-5.6-luna
scripts/cmux-codex-teams.sh -- --help
~~~

The launcher refuses a dirty checkout. This is intentional: the current
DrawFlow checkout may contain user-owned work. For read-only planning or a
fully isolated task, an explicit override is available:

~~~bash
scripts/cmux-codex-teams.sh --allow-dirty
~~~

## Assign work safely

Use one lead and bounded specialist roles:

| Role | Write access | Responsibility |
| --- | --- | --- |
| Lead | Integration checkout only | Owns the task contract, merges changes, and makes the final claim |
| Explorer | Read-only | Maps relevant files, owners, tests, and risks |
| Implementer | Dedicated worktree | Changes one bounded slice of the task |
| Verifier | Dedicated or post-merge checkout | Runs the required checks and records branch/SHA evidence |
| Reviewer | Read-only | Reviews the exact diff and checks ownership boundaries |

Create a worktree for each writing role from a verified base SHA:

~~~bash
git status --short --branch
base_sha="$(git rev-parse HEAD)"
scripts/codex-team-worktree.sh \
  --ticket eng-xxx \
  --role implementation \
  --base "$base_sha"
~~~

Use the generated worktree for that agent only. Keep the lead checkout free
for integration. Remove a worktree only after its branch and changes are no
longer needed, using the normal Git worktree command after confirming the
target path.

## Prompt contract for the lead

Give the root agent a short contract like this:

~~~text
Act as the lead. First record the checkout path, branch, HEAD SHA, and dirty
state. Delegate only disjoint work. Read-only agents may inspect shared state;
writing agents must use their assigned worktree and branch. Before integration,
review the exact diff, run the required checks, and report the final SHA.
Do not start another dev server or mutate shared Convex data without naming
the owner and port/deployment.
~~~

Codex's subagent panes are for visibility and coordination. They are not a
substitute for branch ownership, exact-SHA evidence, or the repository's
domain and authorization rules in AGENTS.md.

## DrawFlow checks

For DrawFlow work, use the repository's Bun commands from the agent's assigned
checkout:

~~~bash
bun run test
bun run build
bun x convex codegen
bun x tsc -p convex/tsconfig.json
~~~

When backend work is in scope, read
convex/_generated/ai/guidelines.md before editing Convex code. Keep one owner
for any shared local Convex/dev server and record the exact branch and SHA used
for browser or acceptance evidence.

## If the repository is cmux itself

The cmux source repository has an additional tagged-build contract:

~~~bash
./scripts/setup.sh
./scripts/reload.sh --tag <short-tag>
CMUX_TAG=<short-tag> scripts/cmux-debug-cli.sh list-workspaces
~~~

Use ./scripts/reload-extension.sh --tag <short-tag> for a matching sample
sidebar extension. Never use a bare xcodebuild, an untagged cmux DEV.app, or
/tmp/cmux-cli for tagged dogfood. Do not re-sign a tagged appex after
reload-extension.sh builds it.
