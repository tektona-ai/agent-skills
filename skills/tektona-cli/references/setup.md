# Setup: install, auth, context, orgs and projects

Read this to install the CLI, authenticate, pick the org and project, or manage orgs, projects and roles.

## Contents

- Commands
- Install
- Authenticate
- Set context (org + project)
- Manage orgs and projects

## Commands

| Task | Command |
|---|---|
| List orgs | `tektona org ls` (alias `o ls`) `[--wide] [-o json]` |
| Show org + members | `tektona org get [<org>] [-o json]` (aliases: `show`, `info`, `details`) |
| Create org | `tektona org create --name <slug> --display-name <label>` (alias `org new`) |
| Update org | `tektona org update <org> [--display-name <l>] [--default-location <id>] [--default-project-role none\|reader\|writer\|admin]` |
| List projects (all orgs) | `tektona project ls` (alias `p ls`) `[--org <slug>] [--wide] [-o json]` |
| Show project | `tektona project get <project> --org <slug> [-o json]` (aliases: `show`, `info`, `details`) |
| Create project | `tektona project create <name> --org <slug> --display-name <label> [--description <d>]` (alias `p new`) |
| Update project | `tektona project update <project> --org <slug> [--display-name <l>] [--description <d>]` |
| Switch context | `tektona ctx set <org/project>` (copy a CONTEXT value from `project ls`) |

Add `-o json` to most commands for machine-readable output. Aliases:
`sandbox` → `s`, `org` → `o`/`orgs`, `project` → `p`/`proj`/`projects`, `create` → `c`/`new`,
`delete` → `rm`/`d`/`destroy`, `egress-network-policy` → `np`,
`egress-proxy` → `egress`/`egress-proxy-profile`, `repository` → `repo`/`repos`/`repositories`, `git-credential` → `gitcred`,
`screenshot` → `ss`, `revoke-preview` → `rp`, `process` → `proc`/`ps`/`p`.
`ls`/`list` are interchangeable.

## Install

```sh
npm install -g @tektona/cli         # cross-platform
brew install tektona-ai/tap/tektona # macOS
```

Check it works: `tektona version`.

## Authenticate

```sh
tektona api-key set <KEY>      # writes ~/.config/tektona/api_key
tektona api-key show
```

Override per-invocation with `--api-key` or `TEKTONA_API_KEY`. Override the
API URL with `--api-url` or `TEKTONA_API_URL`.

`tektona login` sets the API URL, key, and default org/project in one pass, but
it **only prompts** — it takes no flags. Agents use `api-key set` and `ctx set`.

## Set context (org + project)

Almost every command runs in the active org/project context. Set it once:

```sh
tektona ctx set <org/project>      # e.g. acme-corp/backend (or two args: acme-corp backend)
tektona ctx show                   # shows the resolved context AND where each value came from
tektona ctx list                   # every org/project the key can reach
```

**Where `ctx set` writes (important when several agents run in parallel).**
By default it writes a committable, repo-local `.tektona/config.json` at the
**git-repo root** (discovery is bounded to the repo, never above it), so agents in
**different repos/worktrees never clobber each other's context**. Use `--global`
only for a machine-wide default:

```sh
tektona ctx set acme-corp/backend          # repo-local (this repo only) — the default
tektona ctx set --global acme-corp/backend # machine-wide default in ~/.config/tektona
```

Resolution precedence (highest to lowest): `--org`/`--project` flags →
`TEKTONA_ORG`/`TEKTONA_PROJECT` env vars → repo-local file → global config. For a
one-off against a different project, prefer a per-call override over mutating a
config file. `tektona ctx show` reports the winning source per field when a
command targets the wrong place.

List your projects across every org, then copy a `CONTEXT` value into `ctx set`:

```sh
tektona project ls                 # all your projects, across every org (alias: p ls)
tektona project ls --org acme-corp # filter to one org
tektona project ls -o json         # machine-readable
tektona ctx set acme-corp/backend  # paste a value from the CONTEXT column
```

## Manage orgs and projects

Create, update, list, and inspect organizations and projects from the CLI.
Every command works two ways: an interactive wizard on a terminal, or a fully
non-interactive path when inputs are supplied as flags, stdin is not a TTY, or
`--no-input` / `-o json` is set. **Agents must take the non-interactive path** —
pass every input as a flag so nothing is ever prompted.

```sh
tektona org ls                                   # your orgs (alias: o ls); * marks context
tektona org get acme-corp                          # detail + members (defaults to context org)
tektona org create --name beta-labs --display-name "Beta Labs"
tektona org update acme-corp --default-project-role reader

tektona project get web --org acme-corp           # detail + your effective role
tektona project create reports --org acme-corp --display-name "Reports"
tektona project update web --org acme-corp --description "New copy"
```

`update` is a read-modify-write: unspecified fields keep their current values,
so `project update web --description X` preserves the display name. Org and
project names match `^[a-z0-9][a-z0-9-]*[a-z0-9]$`; `tektona` is reserved (and
`personal` for orgs). The name is fixed at creation and can't be changed on
update.

**Roles decide what a 403 means.** A project **reader** can view a shared sandbox
but not create one. A **writer** creates and operates sandboxes, and can *use* a
project or org secret without ever seeing its value. Project-level material —
shared secrets and git credentials, egress network policies, container
registries, project settings and members — needs project **admin**. Org owners
are admin on every project automatically.

**Create a project for an agent (non-interactive):**
```sh
tektona project create reports --org acme-corp --display-name "Reports" \
  --description "Scheduled report generation"
```
Pass every input as a flag — `--org`, `--display-name`, and `--name` (or the
positional name) — so the command never prompts. Add `-o json` to capture the
returned project. The same flag-only form works for `tektona org create`.
