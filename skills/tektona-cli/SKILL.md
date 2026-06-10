---
name: tektona-cli
description: Use when the user mentions Tektona, asks to create or manage a remote sandbox / dev environment, needs to SSH or VNC into a sandbox, mint a preview URL for a forwarded port, configure egress network policy or an egress proxy profile, store a secret / manage a git credential / inject a credential (e.g. an API key or git token) at the egress boundary for sandbox outbound requests, set sandbox env vars, or runs `tektona` or `tektonactl` commands.
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

- **Sensitive values** (API keys, tokens, passwords) belong in a
  `tektona secret`, injected as an HTTP header on the sandbox's *outbound*
  requests by an **egress proxy profile** rule. The value is attached at the
  egress boundary and **never enters the sandbox** — agent code can't read or
  leak it. Same model as git credentials (see the private-clone workflow).
- **Non-secrets** (model names, base URLs, feature flags, `NODE_ENV`, …) — and
  any value a tool needs raw in-process for non-HTTP use — go in **environment
  variables** via `--env KEY=VAL`, which **are visible inside the sandbox**. Only
  put a secret in `--env` when egress injection genuinely can't carry it.

**Canonical example — an Anthropic API key for a coding agent.** The key is a
header to a known host, so it goes via secret + egress-proxy rule and the agent
never sees it; the model name and `NODE_ENV` aren't secret, so they go in `--env`:

```sh
# SECRET — never enters the sandbox; injected at the egress boundary
tektona secret set anthropic <<<"$ANTHROPIC_API_KEY"     # value read from stdin
tektona egress-proxy apply team-defaults --scope project --default   # create the profile first
tektona egress-proxy rule add team-defaults \
  --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'

# ENV — non-secret config, visible in-box (the right place for these)
tektona sandbox create -i node:22 \
  --env ANTHROPIC_MODEL=claude-sonnet-4-5 \
  --env NODE_ENV=production
#   NOT: --env ANTHROPIC_API_KEY=...   ← that would expose the key in the box
```

The rule references the secret as `${secret:KEY}`, resolved just-in-time at the
proxy, so rotating the secret needs no rule change. See **Secrets and egress
injection** below for the full command surface.

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

## Quick reference — `tektona`

| Task | Command |
|---|---|
| List projects (all orgs) | `tektona project ls` (alias `p ls`) `[--org <slug>] [--wide] [-o json]` |
| Switch context | `tektona ctx set <org/project>` (copy a CONTEXT value from `project ls`) |
| Create sandbox | `tektona sandbox create -i <image> [--cpu N --memory N --disk N --env K=V --egress-network-policy <policy> --egress-proxy <profile>]` |
| Create + SSH in | `tektona s c -i ubuntu:24.04 --ssh` |
| Create + VNC in browser | `tektona s c -i <image> --vnc --browser` |
| List active | `tektona sandbox ls` |
| List all (incl. terminated) | `tektona sandbox ls -A` |
| List with full digests + resources | `tektona sandbox ls -w` |
| Filter by state | `tektona sandbox ls --state running` |
| Show details | `tektona sandbox info <id>` |
| List listening ports | `tektona sandbox ports <id> [--json]` |
| Wait for state | `tektona sandbox wait <id> [--state running] [--timeout 5m]` |
| Pause | `tektona sandbox pause <id> [--mode hibernate\|suspend]` |
| Resume | `tektona sandbox resume <id>` |
| Reboot (cold restart) | `tektona sandbox reboot <id> [-y]` |
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
| VNC | `tektona vnc <id> [--browser] [--start-desktop]` |
| Start desktop | `tektona sandbox desktop start <id>` |
| Stop desktop | `tektona sandbox desktop stop <id>` |
| Screenshot to file | `tektona sandbox screenshot <id> -o out.png` |
| Preview URL for port | `tektona sandbox preview <id> <port> [--ttl 1h] [--open]` |
| Revoke preview | `tektona sandbox revoke-preview <id> <token>` |
| Show lifecycle config | `tektona sandbox lifecycle <id>` (no flags) |
| Set lifecycle | `tektona sandbox lifecycle <id> --auto-pause 15m --auto-pause-mode suspend --auto-destroy 30d [--no-auto-resume]` |
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
| Delete a proxy profile | `tektona egress-proxy rm <name>` |
| List git credentials | `tektona git-credential ls` (alias `gitcred`) `[--scope all\|project\|personal]` |
| Create a git credential (token via stdin) | `tektona git-credential create --name <slug> --display-name <label> --forge github\|gitlab --scope project\|personal --repo <url-or-name>` |
| Update a git credential (token via stdin if piped, else kept) | `tektona git-credential update <name> --scope ... [--display-name <l>] [--forge ...] [--repo <url-or-name>]` |
| Delete a git credential | `tektona git-credential rm <name> --scope ...` |

Add `-o json` to most commands for machine-readable output. Aliases:
`sandbox` → `s`, `project` → `p`/`proj`/`projects`, `create` → `c`/`new`,
`delete` → `rm`/`d`/`destroy`, `egress-network-policy` → `np`,
`egress-proxy` → `egress`/`egress-proxy-profile`, `git-credential` → `gitcred`,
`screenshot` → `ss`, `revoke-preview` → `rp`. `ls`/`list` are interchangeable.

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

Look up the latest version at
<https://github.com/tektona-ai/desktop-x11/pkgs/container/desktop-x11>
before suggesting a command. As of the most recent skill release the
newest tag is `0.3.2`, but verify — the registry may have rolled
forward.

## Common workflows

**Spin up a fresh dev box and drop into it:**
```sh
tektona sandbox create -i ubuntu:24.04 --cpu 4 --memory 4 --ssh
```
Use `--egress-network-policy tektona/open` (alias `--egress-policy`) if you need
unrestricted egress (default policy restricts egress).

**Spin up a desktop sandbox and open VNC:**
```sh
tektona sandbox create -i ghcr.io/tektona-ai/desktop-x11:0.3.2 --vnc --browser
```

**Wait for a sandbox to be ready:**
`create` returns immediately; the sandbox transitions
`scheduling` → `building_image` → `running` asynchronously. Either pass
`--ssh` / `--vnc` to `create` (which block until the connection is up),
or use `tektona sandbox wait`:
```sh
ID=$(tektona sandbox create -i ubuntu:24.04 -o json | jq -r .id)
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
tektona ssh "$ID" -- 'cd /workspace && npm start &'
tektona sandbox preview "$ID" 3000 --ttl 4h --open
```
Token-bearing URL by default. Pass `--public` at create time to get a
durable token-less URL via `sandbox preview` instead.

**Clone a git repo inside a sandbox:**
```sh
tektona ssh "$ID" -- 'git clone https://gitlab.com/group/repo.git'
```
Always clone over **HTTPS**, never SSH (`git@…` / `ssh://` URLs do not
authenticate). Private clones **authenticate automatically** — Tektona injects
the project's (or your personal) stored git credential for the repo at the egress
boundary, so the token never enters the sandbox and you pass nothing in the URL.
If a clone fails with an auth error, no credential covers that repo; register the
repo in the project, then add a credential for it:

```sh
gh auth token | tektona git-credential create --name acme-bot \
  --display-name "Acme bot" --forge github --scope project --repo <url-or-name>
```

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

**Pause when idle, auto-destroy stale boxes:**
```sh
tektona sandbox lifecycle <id>                                  # show current config
tektona sandbox lifecycle <id> --auto-pause 15m --auto-destroy 7d
tektona sandbox lifecycle <id> --auto-pause 15m --auto-pause-mode suspend --no-auto-resume
```
With no flags, `lifecycle` prints the current config instead of
updating — it's both the getter and the setter. `--auto-pause-mode`
(`hibernate`|`suspend`, default `hibernate`) picks how the idle pause
is taken; `--no-auto-resume` keeps it paused until explicitly resumed.

## Secrets and egress injection

See **Secrets where possible, everything else in ENV** above for *when* to use
this. This section is the *how*. Two independent controls shape outbound traffic:

- **Egress network policy** — the **gate**: which hosts a sandbox may reach at
  all (`egress-network-policy`, alias `np`).
- **Egress proxy profile** — the **treatment**: a bundle of **rules**, each
  matching a host and injecting a header built from a secret (`egress-proxy`,
  aliases `egress` / `egress-proxy-profile`).

A proxy rule **never opens the firewall** — if the policy doesn't already allow
the host, the rule is inert. Pair them: a policy that reaches
`api.anthropic.com`, and a profile that injects your key there.

**Secrets** — stored material referenced by key, never echoed back:

```sh
tektona secret set anthropic <<<"$KEY"   # upsert from STDIN (creates, or updates in place); default --scope project
tektona secret set my-tok --scope personal <<<"$TOK"   # only your sandboxes
tektona secret set org-key --scope org   <<<"$KEY"     # shared across the org
tektona secret ls                        # KEY / SCOPE / TYPE — values are NEVER shown
tektona secret ls --scope personal       # filter: all|project|personal|org
tektona secret rm anthropic              # default --scope project
```

`set` is an upsert: a new key is created, an existing one has its value rotated
in place (live on running sandboxes within seconds — no recreate).

Scopes: `personal` (only sandboxes you own) → `project` (everyone on the project)
→ `org` (every project in the org). A `${secret:KEY}` reference resolves
most-specific-first (personal → project → org), so a personal value shadows a
shared one with no rule change.

**Egress proxy profiles + inject rules:**

```sh
tektona egress-proxy apply team-defaults --scope project --default  # create (project default)
tektona egress-proxy rule add team-defaults \
  --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'  # inject a header
tektona egress-proxy rule add team-defaults \
  --host api.example.com   --header 'Authorization=Bearer ${secret:my-tok}'
tektona egress-proxy ls                  # NAME / SCOPE / DEFAULT / RULES
tektona egress-proxy show team-defaults  # the profile and its rules
tektona egress-proxy rm team-defaults
```

`rule add` requires `--host <domain>` and at least one repeatable
`--header 'NAME=TEMPLATE'`; a template references a secret as `${secret:KEY}`.
The value is resolved just-in-time at the proxy and **never enters the sandbox**.
Optional `--path <prefix>` scopes a rule to a path prefix.

Attach a profile at create time (the project default applies automatically
otherwise):

```sh
tektona sandbox create -i node:22 --egress-proxy team-defaults
#   --egress-proxy-profile is the long-form alias of --egress-proxy
```

**Runtime mutability.** Editing a network policy or proxy profile takes effect on
**already-running sandboxes within a few seconds** (the proxy re-resolves rules
and secrets on a short cache TTL) — no recreate or pause/resume needed to pick up
a changed policy, swapped profile, or rotated secret.

## Inside the sandbox: `tektonactl`

Once SSHed in, `tektonactl` is on `PATH` and drives the desktop and
sandbox introspection. From outside the sandbox, wrap it:

```sh
tektona ssh <id> -- tektonactl info
tektona ssh <id> -- tektonactl desktop screenshot -o /tmp/s.png
```

For the full command surface — `desktop` (screenshot, click, type,
clipboard, windows) — load the `tektonactl` skill.

## Common mistakes

- **Forgetting to set context.** `tektona ctx set <org/project>` once, or
  pass `--org`/`--project` per call. If you don't know the project slug,
  run `tektona project ls` and copy a `CONTEXT` value. Most "not found"
  errors are a wrong context, not a missing resource.
- **Egress blocked unexpectedly.** Default egress network policy is restrictive.
  Either pass `--egress-network-policy tektona/open` at create (the old
  `--network` flag is gone; `--egress-policy` is the alias), or use
  `tektona egress-network-policy ls` to find a policy that allows what you need.
- **Putting a secret in `--env`.** An env var is visible inside the sandbox, so
  untrusted agent code can read it. Sensitive values consumed as an HTTP header
  belong in a `tektona secret` + egress-proxy rule (injected at the edge, never
  in the box). Reserve `--env` for non-secret config. See **Secrets where
  possible, everything else in ENV** above.
- **Using bare `:latest` as the image ref.** Floating tags are
  rejected — pin with a digest (`image:latest@sha256:<digest>`) or use
  a real version tag. Tag-less digests (`image@sha256:<digest>`) are
  fine; that's the most deterministic pin you can give.
- **Inventing flags that don't exist on `wait`.** Real flags are
  `--state` (default `running`), `--timeout` (default `5m`), and
  `--interval` (default `2s`). Anything else will be rejected.
- **Treating `--public` and `preview` as interchangeable.** `--public` at
  create time gives durable canonical URLs. `sandbox preview` without
  `--public` mints a bearer-token URL (default 12h, max 24h). Pick one.
- **Editing files inside the sandbox via `tektona ssh -- vim`.** Works, but
  for AI-driven edits prefer `tektona ssh -- cat/sed/tee` or `tektona
  sandbox cp` to push the file in.
- **Reaching for `scp`/`rsync` to move files.** Use `tektona sandbox cp`
  instead — it goes through the same brokered access as `tektona ssh`,
  supports the bare `<id>:` WORKDIR shorthand, and parallelises by
  default. Legacy `scp -O` (pre-OpenSSH-9.0) is not supported by the
  access gateway; modern `scp` works over SFTP but the CLI command is
  the blessed path.
- **Using a sandbox-id prefix.** Refs must include the full 26-character
  ULID — `01JQ:/path` is rejected. Copy/paste the full id from
  `tektona sandbox ls`.
- **Using `tektona sandbox vnc` and `tektona vnc`.** Both exist (the first
  is an alias under `sandbox`); pick one for muscle memory.
- **Calling `tektonactl` from your laptop.** It only exists inside the
  sandbox. Wrap it: `tektona ssh <id> -- tektonactl ...`.

## When NOT to use this skill

- Building or modifying the Tektona platform itself (control plane, runner,
  proto definitions). That's repository code, not CLI usage.
- Programmatic access from production services — use the platform HTTP API
  directly instead of shelling out to `tektona`.
