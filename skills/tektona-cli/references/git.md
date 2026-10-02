# Git: repositories and credentials

Read this to clone a repo in a sandbox, or to register a repository and a git credential so private clones authenticate.

## Commands

| Task | Command |
|---|---|
| List repositories | `tektona repository ls` (alias `repo`) `[--default] [-o json]` |
| Register a repository | `tektona repository create --url <clone-url> [--name <n>] [--default-branch <b>] [--default]` |
| Show a repository | `tektona repository get <name-url-or-id>` |
| Change a repository (unset flags keep their value) | `tektona repository update <name-url-or-id> [--name <n>] [--url <u>] [--default-branch <b>] [--default]` |
| Remove a repository | `tektona repository rm <name-url-or-id>` |
| List git credentials | `tektona git-credential ls` (alias `gitcred`) `[--scope all\|project\|personal]` |
| Create a git credential (token via stdin) | `tektona git-credential create --name <slug> --display-name <label> --forge github\|gitlab --scope project\|personal --repo <url-name-or-id>` |
| Update a git credential (token via stdin if piped, else kept) | `tektona git-credential update <name> --scope ... [--display-name <l>] [--forge ...] [--repo <url-name-or-id>]` |
| Delete a git credential | `tektona git-credential rm <name> --scope ...` |

## Clone a private repo

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

Fix a registered repo with `tektona repository update` — never `rm` + `create`,
which strips the repo from every credential that covers it. The default repo set
is append-only: `--default` adds a repo to it, and only `rm` takes one out.

Only the name is unique in a project, so two repos can hold the same URL. If a
command errors `N repositories match …`, pass the repo's id (from
`tektona repository ls -o json`) instead of the URL.

A credential has an immutable `--name` (the handle it's addressed by) plus a
`--display-name` label; the token is read from stdin. Rotate it live with
`tektona git-credential update <name> --scope ...` (token from stdin if piped,
else kept) — the change applies to running sandboxes and new ones. Only deviate
from HTTPS/auto-auth if the user explicitly asks.
