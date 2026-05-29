---
name: tektona-cli
description: Use when the user mentions Tektona, asks to create or manage a remote sandbox / dev environment, needs to SSH or VNC into a sandbox, mint a preview URL for a forwarded port, configure network policy, or runs `tektona` or `tektonactl` commands.
---

# Tektona CLI

## Overview

`tektona` is the CLI for the Tektona agentic development platform. It manages
remote sandboxes and provides SSH, VNC, and HTTP preview access. Inside
a running sandbox, a second binary — `tektonactl` — drives
the desktop, named PTY sessions, and sandbox introspection.

**RELATED SKILL:** Use `tektonactl` for anything happening *inside* a
sandbox — computer use (screenshot, click, type, clipboard) and named
PTY sessions. Reach it from outside with
`tektona ssh <id> -- tektonactl ...`.

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
tektona ctx show
tektona ctx list                   # every org/project the key can reach
```

List your projects across every org you belong to (non-interactive),
then copy a `CONTEXT` value straight into `ctx set`:

```sh
tektona project ls                 # all your projects, across every org (alias: p ls)
tektona project ls --org acme-corp # filter to one org
tektona project ls -o json         # machine-readable
tektona ctx set acme-corp/backend  # paste a value from the CONTEXT column
```

Override per-call with `--org` / `--project`.

## Quick reference — `tektona`

| Task | Command |
|---|---|
| List projects (all orgs) | `tektona project ls` (alias `p ls`) `[--org <slug>] [--wide] [-o json]` |
| Switch context | `tektona ctx set <org/project>` (copy a CONTEXT value from `project ls`) |
| Create sandbox | `tektona sandbox create -i <image> [--cpu N --memory N --disk N --env K=V --network <policy>]` |
| Create + SSH in | `tektona s c -i ubuntu:24.04 --ssh` |
| Create + VNC in browser | `tektona s c -i <image> --vnc --browser` |
| List active | `tektona sandbox ls` |
| List all (incl. terminated) | `tektona sandbox ls -A` |
| List with full digests + resources | `tektona sandbox ls -w` |
| Filter by state | `tektona sandbox ls --state running` |
| Show details | `tektona sandbox info <id>` |
| Wait for state | `tektona sandbox wait <id> [--state running] [--timeout 5m]` |
| Pause | `tektona sandbox pause <id> [--mode hibernate\|suspend]` |
| Resume | `tektona sandbox resume <id>` |
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
| Start desktop | `tektona sandbox start-desktop <id>` |
| Stop desktop | `tektona sandbox stop-desktop <id>` |
| Screenshot to file | `tektona sandbox screenshot <id> -o out.png` |
| Preview URL for port | `tektona sandbox preview <id> <port> [--ttl 1h] [--open]` |
| Revoke preview | `tektona sandbox revoke-preview <id> <token>` |
| Show lifecycle config | `tektona sandbox lifecycle <id>` (no flags) |
| Set lifecycle | `tektona sandbox lifecycle <id> --auto-pause 15m --auto-pause-mode suspend --auto-destroy 30d [--no-auto-resume]` |
| Show network policies | `tektona network-policy ls` (alias `np`) |
| Inspect a network policy | `tektona network-policy info <name>` |
| Default network policy | `tektona network-policy default --set <name>` |

Add `-o json` to most commands for machine-readable output. Aliases:
`sandbox` → `s`, `project` → `p`/`proj`/`projects`, `create` → `c`/`new`,
`delete` → `rm`/`d`/`destroy`, `network-policy` → `np`, `screenshot` → `ss`,
`revoke-preview` → `rp`. `ls` and `list` are interchangeable.

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
Use `--network tektona/open` if you need unrestricted egress (default policy
restricts egress).

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
tektona sandbox wait "$ID" --state paused                 # also works for pause/resume flows
```
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

## Inside the sandbox: `tektonactl`

Once SSHed in, `tektonactl` is on `PATH` and drives the desktop, PTY
sessions, and sandbox introspection. From outside the sandbox, wrap it:

```sh
tektona ssh <id> -- tektonactl info
tektona ssh <id> -- tektonactl desktop screenshot -o /tmp/s.png
tektona ssh <id> -- tektonactl pty list
```

For the full command surface — `desktop` (screenshot, click, type,
clipboard, windows) and `pty` (named long-running sessions) — load the
`tektonactl` skill.

## Common mistakes

- **Forgetting to set context.** `tektona ctx set <org/project>` once, or
  pass `--org`/`--project` per call. If you don't know the project slug,
  run `tektona project ls` and copy a `CONTEXT` value. Most "not found"
  errors are a wrong context, not a missing resource.
- **Egress blocked unexpectedly.** Default network policy is restrictive.
  Either pass `--network tektona/open` at create, or use
  `tektona network-policy ls` to find a policy that allows what you need.
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
