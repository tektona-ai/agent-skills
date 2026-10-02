---
name: tektona-cli
description: Use when the user drives Tektona from a shell, or runs `tektona` / `tektonactl`. Covers remote sandboxes (create, SSH, VNC, preview URLs, file copy, fork), sandbox templates (build from an image, build steps, tags, versions, org templates, build logs), processes inside a sandbox (background servers, logs, autostart), sandbox lifecycle (auto-pause, auto-delete), sharing and ownership, orgs, projects and roles, and credentials injected at the egress boundary (secrets, git credentials, egress network policy and proxy profiles). For Tektona from TypeScript or JavaScript code, use the `tektona-typescript-sdk` skill instead.
---

# Tektona CLI

Tektona runs isolated cloud sandboxes for AI agents. A sandbox is a full
Linux VM (Ubuntu 26.04 with systemd) that starts from a **template**.
`tektona` drives sandboxes from outside: create, SSH, VNC, preview URLs, file
copy, fork, pause. Inside a sandbox, `tektonactl` drives the desktop and
processes — load the `tektonactl` skill for that. From TypeScript code, load
`tektona-typescript-sdk` instead.

## What you can do, and where to read

| Task | Read |
|---|---|
| Install, authenticate, set org/project context, manage orgs, projects, roles | [references/setup.md](references/setup.md) |
| Pick a template, build one from an image or a manifest, share with the org, tags, versions, build logs | [references/templates.md](references/templates.md) |
| Create, wait, desktop/VNC, screenshot, fork, tags, pause/resume, lifecycle, sharing, ownership | [references/sandboxes.md](references/sandboxes.md) |
| SSH, run commands and background processes, copy files, port forward, preview URLs | [references/files-and-processes.md](references/files-and-processes.md) |
| Clone private repos: register a repository and a git credential | [references/git.md](references/git.md) |
| Secrets, egress network policy (the gate), egress proxy profiles (the treatment), AWS signing | [references/egress-and-secrets.md](references/egress-and-secrets.md) |

Read the reference for the task before you run commands that are not shown
here. Every command takes `-o json` for machine-readable output and `--help`.

## Quick start

```sh
tektona api-key set <KEY>                 # or TEKTONA_API_KEY
tektona ctx set <org>/<project>           # or TEKTONA_ORG / TEKTONA_PROJECT
ID=$(tektona sandbox create tektona/desktop -o json | jq -r .id)   # waits until running
tektona ssh "$ID" -- uname -a             # one-shot command
tektona sandbox process run "$ID" -d --name web -- npm start       # background process
tektona sandbox preview "$ID" 3000 --open # share an HTTP port
tektona vnc "$ID" --start-desktop --browser                        # see the desktop
tektona sandbox delete "$ID" -y
```

## Secrets where possible, everything else in ENV

> **Anything sensitive → a `tektona secret` + an egress-proxy rule.
> Everything else → `--env KEY=VAL`.**

An `--env` value is **visible inside the sandbox**, so agent code can read and
leak it. A secret is injected as an HTTP header at the egress boundary and
**never enters the sandbox**. Reserve `--env` for non-secret config (model
names, base URLs, feature flags) and for a value a tool needs raw for non-HTTP
use:

```sh
# SECRET — never enters the sandbox; injected at the egress boundary
tektona secret set anthropic <<<"$ANTHROPIC_API_KEY"     # value read from stdin
tektona egress-proxy apply team-defaults --scope project --default
tektona egress-proxy rule add team-defaults \
  --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'

# ENV — non-secret config, visible in-box
tektona sandbox create tektona/desktop --env ANTHROPIC_MODEL=claude-sonnet-4-5
#   NOT: --env ANTHROPIC_API_KEY=...   ← that would expose the key in the box
```

AWS, rule scopes, TLS trust and a rule that does not fire:
[references/egress-and-secrets.md](references/egress-and-secrets.md).

## Rules that bite

- **Use `tektona/desktop` unless the user names another template.** Use
  `tektona/sandbox-base` for headless work (CI, servers, batch jobs). A
  sandbox starts from a template, never an image: to use an image, run
  `tektona template create <name> --image <ref>` first.
- **The desktop does not start by itself**, also on `tektona/desktop`. Use
  `tektona vnc <id> --start-desktop` or `tektona sandbox desktop start <id>`.
- **Set the context first.** Most "not found" errors are a wrong org or
  project, not a missing resource. `tektona ctx show` names the source of each
  value.
- **Pass every input as a flag.** Agents take the non-interactive path, so
  nothing prompts. `tektona login` only prompts; use `api-key set` and
  `ctx set`.
- **Open the gate before you expect egress.** The default egress network
  policy is restrictive. Pass `--egress-network-policy tektona/open` at create,
  or find a policy with `tektona egress-network-policy ls`.
- **Address a sandbox by its full 26-character ULID.** A prefix is rejected.
- **`sandbox ls` shows only your own sandboxes.** Add `--scope all` before you
  conclude that a sandbox is gone.
- **Silent compute looks idle.** A sandbox hibernates after 15 minutes without
  traffic that crosses its boundary. Before a long, network-silent job, pass
  `--auto-pause never` or run the job with `process run --prevent-auto-pause`.
- **Move files with `tektona sandbox cp`**, not `scp -O` and not an editor
  over SSH.
- **Read `tektona sandbox limits` before you ask for more than** 2 cores,
  2 GiB or 10 GiB. A value outside the limit is refused, not reduced.

## When NOT to use this skill

- Building or modifying the Tektona platform itself (control plane, runner,
  proto definitions). That is repository code, not CLI usage.
- Programmatic access from production services — use `@tektona/sdk` (the
  `tektona-typescript-sdk` skill) or the platform HTTP API.
