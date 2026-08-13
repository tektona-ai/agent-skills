---
name: tektona-cli
description: Use when the user mentions Tektona, or runs `tektona` / `tektonactl`. Covers remote sandboxes (create, SSH, VNC, preview URLs, file copy, fork), processes inside a sandbox (background servers, logs, autostart), sandbox lifecycle (auto-pause, auto-delete), orgs and projects, and credentials injected at the egress boundary (secrets, git credentials, egress network policy and proxy profiles).
---

# Tektona CLI

## Overview

`tektona` is the CLI for the Tektona agentic development platform. It manages
remote sandboxes and provides SSH, VNC, and HTTP preview access. Inside
a running sandbox, a second binary — `tektonactl` — drives
the desktop and sandbox introspection.

**RELATED SKILL:** Use `tektonactl` for anything *inside* a sandbox — computer
use (screenshot, click, type, clipboard). Reach it from
outside with `tektona ssh <id> -- tektonactl ...`.

## Secrets where possible, everything else in ENV

**This is the most important rule when wiring up a sandbox. Read it before
reaching for `--env`.**

> **Anything sensitive → a `tektona secret` + an egress-proxy rule.
> Everything else → `--env KEY=VAL`.**

An `--env` value is **visible inside the sandbox**, so agent code can read and
leak it. A secret is injected as an HTTP header at the egress boundary and
**never enters the sandbox**. Reserve `--env` for non-secret config — model
names, base URLs, feature flags, `NODE_ENV` — and for a value a tool needs raw
in-process for non-HTTP use.

**Canonical example — an Anthropic API key for a coding agent.** The key is a
header to a known host, so it goes in a secret; the model name is not sensitive,
so it goes in `--env`:

```sh
# SECRET — never enters the sandbox; injected at the egress boundary
tektona secret set anthropic <<<"$ANTHROPIC_API_KEY"     # value read from stdin
tektona egress-proxy apply team-defaults --scope project --default
tektona egress-proxy rule add team-defaults \
  --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'

# ENV — non-secret config, visible in-box (the right place for these)
tektona sandbox create -i node:22 --env ANTHROPIC_MODEL=claude-sonnet-4-5
#   NOT: --env ANTHROPIC_API_KEY=...   ← that would expose the key in the box
```

Two controls shape outbound traffic, and they are independent. The **gate**
(`egress-network-policy`) decides which hosts a sandbox may reach at all. The
**treatment** (`egress-proxy` profile) injects a header into requests to a host
the gate already allows. A treatment never widens the gate.

**For anything beyond that — scopes, the `${secret:KEY}` grammar, attaching or
rotating a treatment, TLS trust, or a rule that is not firing — read
[`references/egress-and-secrets.md`](references/egress-and-secrets.md).**

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

## Quick reference — `tektona`

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
| Create sandbox | `tektona sandbox create -i <image> [--cpu N --memory N --disk N --env K=V --egress-network-policy <policy> --egress-proxy <profile>]` |
| Create + SSH in | `tektona s c -i ghcr.io/tektona-ai/desktop-x11:<tag> --ssh` |
| Create + VNC in browser | `tektona s c -i <image> --vnc --browser` |
| List active | `tektona sandbox ls` |
| List all (incl. terminated) | `tektona sandbox ls -A` |
| List with full digests + resources | `tektona sandbox ls -w` |
| Filter by state | `tektona sandbox ls --state running` |
| Show details | `tektona sandbox get <id>` (aliases: `info`, `show`, `details`) |
| List listening ports | `tektona sandbox ports <id> [--json]` |
| Wait for state | `tektona sandbox wait <id> [--state running] [--timeout 5m]` |
| Pause | `tektona sandbox pause <id> [--mode hibernate\|suspend]` |
| Resume | `tektona sandbox resume <id>` |
| Reboot (orderly restart) | `tektona sandbox reboot <id> [-y]` — processes get SIGTERM; recent writes survive |
| Reset (hard reset) | `tektona sandbox reset <id> [-y]` — like pulling the power; un-synced writes lost; use only when the sandbox is unresponsive |
| Fork (filesystem snapshot) | `tektona sandbox fork <id> [--mode filesystem\|full]` |
| Delete | `tektona sandbox delete <id...>` / `--all` / `-y` |
| SSH | `tektona ssh <id> [-- <command>]` |
| One-shot exec | `tektona ssh <id> -- <command>` |
| Print SSH command | `tektona ssh <id> --print` |
| Port forward (sandbox → laptop) | ``eval "$(tektona ssh <id> --print)" -L 8080:localhost:3000 -N`` |
| Port forward (laptop → sandbox) | ``eval "$(tektona ssh <id> --print)" -R 5432:localhost:5432 -N`` |
| Upload file(s) | `tektona sandbox cp <local> <id>:/abs/path` |
| Upload to image WORKDIR | `tektona sandbox cp <local> <id>:`  (bare `<id>:` resolves against the image's WORKDIR) |
| Download file(s) | `tektona sandbox cp <id>:/abs/path <local>` |
| Copy a tree (parallel) | `tektona sandbox cp -r ./dir <id>:/dst/` (default 3 workers, cap 6) |
| Stream stdin/stdout | `tar c ./src \| tektona sandbox cp - <id>:/tmp/src.tar` / `tektona sandbox cp <id>:/path -` |
| Run a command (waits, exits with its code) | `tektona sandbox process run <id> -- <cmd...>` (alias `s p run`) |
| Run a shell one-liner (`&&`, pipes, globs) | `tektona sandbox process run <id> -s -- 'apt update && apt install -y nginx'` (`-s/--shell`: bash if the image has it, else sh) |
| Start a background process | `tektona sandbox process run <id> -d --name <name> -- <cmd...>` |
| Interactive shell (PTY) | `tektona sandbox process run <id> -t -- bash` |
| List processes | `tektona sandbox process ls <id>` (`--autostart` for definitions) |
| Tail logs | `tektona sandbox process logs <id> <ref> -f [-n/--tail N]` |
| Attach / reattach | `tektona sandbox process attach <id> <ref>` |
| Stop process | `tektona sandbox process stop <id> <ref> [--force]` |
| Signal process | `tektona sandbox process signal <id> <ref> SIGHUP` |
| Autostart on every boot | `tektona sandbox process run <id> -d --name <name> --autostart -- <cmd...>` / `process autostart <id> <ref> on\|off` |
| VNC | `tektona vnc <id> [--browser] [--start-desktop]` |
| Start desktop | `tektona sandbox desktop start <id>` |
| Stop desktop | `tektona sandbox desktop stop <id>` |
| Screenshot to file | `tektona sandbox screenshot <id> -o out.png` (add `--open` to also open it in a viewer) |
| Preview URL for port | `tektona sandbox preview <id> <port> [--ttl 1h] [--open]` |
| Revoke preview | `tektona sandbox revoke-preview <id> <token>` |
| Show lifecycle (effective + source tier) | `tektona sandbox get <id>` (lifecycle rows show each effective value and the tier that set it) |
| Set sandbox lifecycle overrides | `tektona sandbox lifecycle <id> --auto-pause 15m --auto-pause-mode suspend --auto-resume false --auto-delete 30d` |
| Never auto-pause (silent long job) | `tektona sandbox lifecycle <id> --auto-pause never` |
| Show / set project lifecycle defaults | `tektona project lifecycle-defaults <project> [--org <slug>] [--auto-pause 1h --auto-resume true --auto-delete 7d]` |
| Show egress network policies | `tektona egress-network-policy ls` (alias `np`) |
| Inspect a egress network policy | `tektona egress-network-policy info <name>` |
| Default egress network policy | `tektona egress-network-policy default --set <name>` |
| Set a secret (upsert; value via stdin) | `tektona secret set <key> [--scope project\|personal\|org]` (creates, or updates the value in place) |
| List secrets (keys only) | `tektona secret ls [--scope all\|project\|personal\|org]` |
| Delete a secret | `tektona secret rm <key> [--scope ...]` |
| List egress proxy profiles | `tektona egress-proxy ls` (alias `egress`) |
| Show a proxy profile + rules | `tektona egress-proxy show <name>` |
| Create a proxy profile | `tektona egress-proxy apply <name> [--scope project\|org] [--default]` (`--default` is project-scope only) |
| Add an inject rule | `tektona egress-proxy rule add <name> --host <domain> --header 'NAME=TEMPLATE'` |
| Remove an inject rule | `tektona egress-proxy rule rm <name> <rule-id>` (rule ids from `show`) |
| Attach/switch a proxy profile on an existing sandbox | `tektona sandbox egress-proxy set <id> <profile>` |
| Detach a sandbox's proxy profile | `tektona sandbox egress-proxy unset <id>` |
| Delete a proxy profile | `tektona egress-proxy rm <name>` |
| List repositories | `tektona repository ls` (alias `repo`) `[-o json]` |
| Register a repository | `tektona repository create --url <clone-url> [--name <n>] [--default-branch <b>] [--default]` |
| Show a repository | `tektona repository get <name-or-url>` |
| Remove a repository | `tektona repository rm <name-or-url>` |
| List git credentials | `tektona git-credential ls` (alias `gitcred`) `[--scope all\|project\|personal]` |
| Create a git credential (token via stdin) | `tektona git-credential create --name <slug> --display-name <label> --forge github\|gitlab --scope project\|personal --repo <url-or-name>` |
| Update a git credential (token via stdin if piped, else kept) | `tektona git-credential update <name> --scope ... [--display-name <l>] [--forge ...] [--repo <url-or-name>]` |
| Delete a git credential | `tektona git-credential rm <name> --scope ...` |

Add `-o json` to most commands for machine-readable output. Aliases:
`sandbox` → `s`, `org` → `o`/`orgs`, `project` → `p`/`proj`/`projects`, `create` → `c`/`new`,
`delete` → `rm`/`d`/`destroy`, `egress-network-policy` → `np`,
`egress-proxy` → `egress`/`egress-proxy-profile`, `repository` → `repo`/`repos`/`repositories`, `git-credential` → `gitcred`,
`screenshot` → `ss`, `revoke-preview` → `rp`, `process` → `proc`/`ps`/`p`.
`ls`/`list` are interchangeable.

## Choosing an image

Any OCI image works (`-i ubuntu:24.04`, `-i node:22`, `-i python:3.12`,
or your team's own image). The reference must be **deterministic** —
i.e. it must not float over time. A non-`latest` tag, a `@sha256:...`
digest, or both will satisfy that. The only rejected shapes are the
ones that float:

```text
image:tag                        ✓
image:tag@sha256:<digest>        ✓  tag + exact-build pin
image@sha256:<digest>            ✓  digest only (most deterministic, OCI-standard)
image:latest@sha256:<digest>     ✓  :latest is fine when pinned by digest
image:latest                     ✗  bare floating tag
image                            ✗  no tag and no digest
```

If the user asks for "the latest X" and you don't have a tag, look up
the highest-numbered tag on the image's registry page (or use `crane
ls <repo>` / `docker buildx imagetools inspect <repo>`) and pin to
that. If you only have a digest from a registry inspection, the bare
`image@sha256:...` form is the cleanest pin and is fully accepted.

For desktop, VNC, and `tektonactl desktop` workflows, **recommend the
official desktop image** unless the user specifies their own:

```sh
ghcr.io/tektona-ai/desktop-x11:<tag>
```

Resolve `<tag>` against the registry before you suggest a command:
<https://github.com/tektona-ai/desktop-x11/pkgs/container/desktop-x11>

## Common workflows

**Create a project for an agent (non-interactive):**
```sh
tektona project create reports --org acme-corp --display-name "Reports" \
  --description "Scheduled report generation"
```
Pass every input as a flag — `--org`, `--display-name`, and `--name` (or the
positional name) — so the command never prompts. Add `-o json` to capture the
returned project. The same flag-only form works for `tektona org create`.

**Spin up a fresh dev box and drop into it:**
```sh
tektona sandbox create -i ghcr.io/tektona-ai/desktop-x11:<tag> --cpu 4 --memory 4 --ssh
```
Use `--egress-network-policy tektona/open` (alias `--egress-policy`) if you need
unrestricted egress (default policy restricts egress).

**Spin up a desktop sandbox and open VNC:**
```sh
tektona sandbox create -i ghcr.io/tektona-ai/desktop-x11:<tag> --vnc --browser
```

**Wait for a sandbox to be ready:**
`create` returns immediately; the sandbox transitions
`scheduling` → `building_image` → `running` asynchronously. Either pass
`--ssh` / `--vnc` to `create` (which block until the connection is up),
or use `tektona sandbox wait`:
```sh
ID=$(tektona sandbox create -i ghcr.io/tektona-ai/desktop-x11:<tag> -o json | jq -r .id)
tektona sandbox wait "$ID"                                # default: state=running, timeout=5m
tektona sandbox wait "$ID" --state running --timeout 3m
tektona sandbox wait "$ID" --state paused                 # matches hibernated or suspended
tektona sandbox wait "$ID" --state hibernated             # exact pause mode
```
There is no literal `paused` state: `pause` settles into `hibernated`
(default) or `suspended`. `--state paused` matches either, so
`pause && wait --state paused` works regardless of `--mode`.
`wait` exits 0 on success, non-zero on timeout, and **fails fast** if
the sandbox enters a terminal state (`error`, `deleted`, `deleting`)
while waiting for a non-terminal target — so the agent doesn't hang on
broken images.

**Run a server in a sandbox and share it:**
```sh
ID=$(tektona s c -i node:22 -o json | jq -r .id)
tektona sandbox process run "$ID" -d --name web --cwd /workspace -- npm start
tektona sandbox preview "$ID" 3000 --ttl 4h --open
```
Prefer `sandbox process run -d` over `ssh -- 'npm start &'`: the process is
sandbox-owned (survives the SSH session), named, tailable
(`process logs "$ID" web -f`), and stoppable (`process stop "$ID" web`).
Token-bearing URL by default. Pass `--public` at create time to get a
durable token-less URL via `sandbox preview` instead.

**Run a long, network-silent job without it getting auto-paused:**
```sh
tektona sandbox process run "$ID" --prevent-auto-pause -- ./train.sh   # pins the sandbox awake while it runs
tektona sandbox process run "$ID" -d --name build --autostart -- make   # relaunched on every boot
```
`--prevent-auto-pause` keeps the sandbox active for the process's lifetime (an
alternative to `--auto-pause never` scoped to one process). `--on-hibernate
preserve|stop|restart_after_resume` controls what happens to a process across a
hibernate pause. `--timeout` takes a Go duration (e.g. `30s`, `5m`, `1h`; `0` =
no timeout; sub-second values round up to the 1s minimum). Give background processes a speaking `--name` that fits the
purpose, e.g. `run-frontend` or `build-backend`; if you omit it, a random
memorable name is generated.

**Clone a git repo inside a sandbox:**
```sh
tektona ssh "$ID" -- 'git clone https://gitlab.com/group/repo.git'
```
Always clone over **HTTPS**, never SSH (`git@…` / `ssh://` URLs do not
authenticate). Private clones **authenticate automatically** — Tektona injects
the project's (or your personal) stored git credential for the repo at the egress
boundary, so the token never enters the sandbox and you pass nothing in the URL.
If a clone fails with an auth error, no credential covers that repo. Wiring one up
is **two steps, in order** — register the repo in the project, then add a
credential that unlocks it:

```sh
# 1. register the repo (once per project); --name defaults to the URL's last segment
tektona repository create --url https://github.com/acme/api

# 2. add a credential that unlocks it (token read from stdin)
gh auth token | tektona git-credential create --name acme-bot \
  --display-name "Acme bot" --forge github --scope project --repo https://github.com/acme/api
```

`git-credential create --repo` only *references* a repo already registered in the
project — it can't create one. If it errors `no repository matches …`, you skipped
step 1: run `tektona repository create --url <clone-url>` first, then retry.
List what's registered with `tektona repository ls`.

A credential has an immutable `--name` (the handle it's addressed by) plus a
`--display-name` label; the token is read from stdin. Rotate it live with
`tektona git-credential update <name> --scope ...` (token from stdin if piped,
else kept) — the change applies to running sandboxes and new ones. Only deviate
from HTTPS/auto-auth if the user explicitly asks.

**Forward a sandbox port to your laptop (or vice versa):**
```sh
# Sandbox port 3000 → laptop port 8080. -N keeps the tunnel up without a shell.
eval "$(tektona ssh <id> --print)" -L 8080:localhost:3000 -N

# Laptop port 5432 (e.g. local Postgres) reachable inside the sandbox at localhost:5432.
eval "$(tektona ssh <id> --print)" -R 5432:localhost:5432 -N
```
`tektona ssh --print` emits the resolved `ssh` invocation; `eval` runs it
with extra flags appended. Use `-L` to pull a sandbox port to your
machine, `-R` to push a local service into the sandbox. Run in the
background with `&` if you need the shell back. For HTTP-only ports a
shareable URL is usually simpler — see `tektona sandbox preview`.

**Snapshot, branch, throw away:**
```sh
tektona sandbox fork <id> --mode filesystem --ssh   # cheap branch
tektona sandbox fork <id> --mode full --ssh         # includes RAM
tektona sandbox delete <fork-id> -y
```

**Move files in and out:**
```sh
# upload a file to an absolute path
tektona sandbox cp ./report.pdf <id>:/tmp/

# upload to the image's WORKDIR (bare host: shorthand)
tektona sandbox cp ./report.pdf <id>:

# download a remote file to CWD
tektona sandbox cp <id>:/var/log/app.log ./

# recursive tree copy, parallel by default (3 workers)
tektona sandbox cp -r ./build/ <id>:/srv/app/

# bigger trees: bump workers (capped at 6; higher values are clamped with a warning)
tektona sandbox cp --workers=6 -r ./large-dataset/ <id>:/data/
```
Exit codes: `0` clean, `1` per-file errors, `2` transport drop, `130`
interrupted. Use `--fail-fast` to abort the run on the first per-file
error. For scripting, pipe `--output json` to get one structured event
per line.

**Control when a sandbox pauses, wakes, and is deleted (lifecycle):**

By default a sandbox **auto-pauses (hibernates) after 15 minutes without
boundary-crossing traffic**, **wakes automatically on the next access**, and is
**never auto-deleted**. The idle timer only sees traffic that *crosses the sandbox
boundary* — SSH/VNC/exec sessions, preview HTTP, agent requests, outbound network
transfers. **Silent in-VM compute — a build, a training run, a local batch job —
looks idle**, so the sandbox hibernates mid-job. Hibernate preserves RAM, so the
job's processes survive and continue on resume, but wall-clock time stalls while
it's paused. Before launching a long, network-silent job, disable auto-pause:

```sh
tektona sandbox create -i node:22 --auto-pause never          # at create time
tektona sandbox lifecycle <id> --auto-pause never             # or on an existing sandbox
```

Each knob is **tri-state**: a duration (`15m`, `2h`, `30d`), `never` (disable —
interval knobs only), or `inherit` (fall through **sandbox override → project
default → platform default**). Set any subset at create or later:

```sh
tektona sandbox create -i node:22 \
  --auto-pause 2h --auto-pause-mode suspend --auto-resume false --auto-delete 7d
tektona sandbox lifecycle <id> --auto-pause 30m --auto-delete 30d
```

- `--auto-pause-mode` is `hibernate` (default; preserves RAM, sub-second resume)
  or `suspend` (disk only, cheaper to store, cold-boots on resume).
- `--auto-resume false` keeps a paused sandbox paused until you resume it
  explicitly; with the default (`true`) any access resumes it.
- `--auto-delete` applies **only to a paused sandbox**, and the clock starts at
  the pause. A running sandbox is never auto-deleted, however old it is. Resume
  clears the clock, so the next pause starts the full interval again. Read
  `--auto-delete 7d` as "delete 7 days after it pauses", not "7 days after
  creation".

**Viewing:** `tektona sandbox lifecycle <id>` with no flags now **errors** — it's
setter-only. Read effective values with `tektona sandbox get <id>`, whose
lifecycle rows show each value and the tier (own / project / platform) that
supplied it.

**Project-wide defaults** apply to every sandbox that doesn't override the knob
itself. With no flags the command prints the defaults; with flags it updates the ones you pass (omitted flags keep their value):

```sh
tektona project lifecycle-defaults <project> --org <slug>              # show
tektona project lifecycle-defaults <project> --auto-pause 1h --auto-delete 7d
tektona project lifecycle-defaults <project> --auto-delete inherit     # clear one default
```

**Waking is automatic:** you do NOT need to resume a hibernated sandbox before
`tektona ssh`, a preview URL, or an agent request — the access resumes it and then
serves the request. Expect a few seconds' extra latency on first contact with a
paused sandbox (a warm hibernate resume is typically sub-second).

## Inside the sandbox: `tektonactl`

Once SSHed in, `tektonactl` is on `PATH` and drives the desktop and
sandbox introspection. From outside the sandbox, wrap it:

```sh
tektona ssh <id> -- tektonactl get
tektona ssh <id> -- tektonactl desktop screenshot -o /tmp/s.png
```

For the full command surface — `desktop` (screenshot, click, type,
clipboard, windows) — load the `tektonactl` skill.

## Rules that bite

- **Set the context first.** Run `tektona ctx set <org/project>` once, or pass
  `--org`/`--project` per call. Most "not found" errors are a wrong context, not
  a missing resource — so read a "not found" as a context question first.
- **Open the gate before you expect egress.** The default gate is restrictive.
  Pass `--egress-network-policy tektona/open` at create (`--egress-policy` is the
  alias), or run `tektona egress-network-policy ls` to find one that allows what
  you need.
- **Address a sandbox by its full 26-character ULID.** A prefix such as
  `01JQ:/path` is rejected. Copy the whole id from `tektona sandbox ls`.
- **Pick one preview model and stay in it.** `--public` at create time gives
  durable canonical URLs. `sandbox preview` without `--public` mints a
  bearer-token URL (default 12h, max 24h).
- **Move files with `tektona sandbox cp`.** It goes through the same brokered
  access as `tektona ssh`, supports the bare `<id>:` WORKDIR shorthand, and
  parallelises by default. Legacy `scp -O` (pre-OpenSSH-9.0) is unsupported by
  the access gateway.
- **Edit files by pushing them in.** `tektona sandbox cp`, or
  `tektona ssh -- cat/sed/tee`, beats driving an interactive editor over SSH.
- **Set `--auto-resume false` where you mean it.** `--no-auto-resume` is a
  deprecated hidden alias.

## When NOT to use this skill

- Building or modifying the Tektona platform itself (control plane, runner,
  proto definitions). That's repository code, not CLI usage.
- Programmatic access from production services — use the platform HTTP API
  directly instead of shelling out to `tektona`.
