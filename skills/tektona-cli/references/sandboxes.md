# Sandboxes: create, desktop, lifecycle, sharing

Read this to create, wait for, view, fork, tag, pause, resume or delete a sandbox, set its lifecycle, or share it.

## Contents

- Commands
- Create and wait
- Desktop, VNC and screenshots
- Fork and tags
- Lifecycle: pause, wake, delete
- Ownership and visibility

## Commands

| Task | Command |
|---|---|
| Create sandbox | `tektona sandbox create <template>[:<template-tag>] [--template-version <id> --cpu N --memory N --disk N --env K=V --egress-network-policy <policy> --egress-proxy-profile <profile> --tag <sandbox-tag> ...]` (`--tag` labels the sandbox, it does not pick a template tag) |
| Show resource limits (min, max, default) | `tektona sandbox limits [-o json]` |
| Create + SSH in | `tektona s c tektona/desktop --ssh` |
| Create + desktop in browser | `tektona s c tektona/desktop` then `tektona vnc <id> --start-desktop --browser` |
| List active (yours only — see Ownership) | `tektona sandbox ls` |
| List all (incl. terminated) | `tektona sandbox ls --include-deleted` |
| List with full digests + resources | `tektona sandbox ls -w` |
| Filter by state | `tektona sandbox ls --state running` |
| Filter by tags | `tektona sandbox ls --tag <tag> [--tag <tag> ...]` (all tags must match) |
| Include others' shared sandboxes | `tektona sandbox ls --scope shared\|all` |
| Search every project in the org | `tektona sandbox ls --all-projects` |
| Share with the project | `tektona sandbox share <id> [--type use\|manage]` |
| Make private again | `tektona sandbox unshare <id>` |
| Hand to another member | `tektona sandbox transfer <id> <email-or-user-id>` (alias `chown`) |
| Admin: any sandbox incl. private | `tektona admin sandbox ls\|get\|pause\|rm` `[--all-projects] [--owner <email>] [--orphaned] [--older-than 24h]` |
| Show details | `tektona sandbox get <id>` (aliases: `info`, `show`, `details`) |
| List listening ports | `tektona sandbox ports <id> [--json]` |
| Wait for state | `tektona sandbox wait <id> [--state running] [--timeout 10m]` |
| Pause | `tektona sandbox pause <id> [--mode hibernate\|suspend]` |
| Resume | `tektona sandbox resume <id>` |
| Reboot (orderly restart) | `tektona sandbox reboot <id> [-y]` — processes get SIGTERM; recent writes survive |
| Reset (hard reset) | `tektona sandbox reset <id> [-y]` — like pulling the power; un-synced writes lost; use only when the sandbox is unresponsive |
| Fork (copy the disk) | `tektona sandbox fork <id> [--mode filesystem\|full] [--tag <tag> ...\|--clear-tags]` |
| Replace sandbox tags | `tektona sandbox tag replace <id> [--tag <tag> ...]` |
| Add sandbox tags | `tektona sandbox tag add <id> --tag <tag> [--tag <tag> ...]` |
| Delete | `tektona sandbox delete <id...>` / `--all` / `-y` |
| VNC | `tektona vnc <id> [--browser] [--start-desktop]` (the desktop does not start by itself) |
| Start desktop (needs a desktop image — see below) | `tektona sandbox desktop start <id>` |
| Stop desktop | `tektona sandbox desktop stop <id>` |
| Desktop status | `tektona sandbox desktop status <id>` (prints `active` or `inactive`) |
| Screenshot to file | `tektona sandbox screenshot <id> -o out.png` (add `--open` to also open it in a viewer) |
| Preview URL for port | `tektona sandbox preview <id> <port> [--ttl 1h] [--open]` |
| Revoke preview | `tektona sandbox revoke-preview <id> <token>` |
| Show lifecycle (effective + source tier) | `tektona sandbox get <id>` (lifecycle rows show each effective value and the tier that set it) |
| Set sandbox lifecycle overrides | `tektona sandbox lifecycle <id> --auto-pause 15m --auto-pause-mode suspend --auto-resume false --auto-delete 30d` |
| Never auto-pause (silent long job) | `tektona sandbox lifecycle <id> --auto-pause never` |
| Show / set project lifecycle defaults | `tektona project lifecycle-defaults <project> [--org <slug>] [--auto-pause 1h --auto-resume true --auto-delete 7d]` |

## Create and wait

**Read the limits before you ask for a large shape.** The CPU, memory and disk
maximum is set per installation. Run `tektona sandbox limits` before a create,
a resize or a template build with `--cpu`, `--memory`, `--disk` or
`spec.build.resources` above 2 cores, 2 GiB or 10 GiB. A value outside the
limit is refused, not reduced. A new request needs at least 5 GiB of disk.

**Spin up a fresh dev box and drop into it:**
```sh
tektona sandbox create tektona/desktop --cpu 4 --memory 4 --ssh
```
Use `--egress-network-policy tektona/open` (alias `--egress-policy`) if you need
unrestricted egress (default policy restricts egress).

**Spin up a desktop sandbox and open it in the browser:**
```sh
ID=$(tektona sandbox create tektona/desktop -o json | jq -r .id)
tektona vnc "$ID" --start-desktop --browser
```

**Wait for a sandbox to be ready:**
`create` waits until the sandbox runs, for up to 10 minutes, and then returns.
After a create that stopped early, a resume or a reboot, use
`tektona sandbox wait`:
```sh
ID=$(tektona sandbox create tektona/desktop -o json | jq -r .id)
tektona sandbox wait "$ID"                                # default: state=running, timeout=10m
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

## Desktop, VNC and screenshots

**`tektona sandbox desktop start` and every `tektonactl desktop` command need an
image that ships a desktop.** That is `tektona/desktop`, a template built from
`ghcr.io/tektona-ai/desktop-x11`, or your own image with an executable
`/etc/tektona/desktop-session` that starts a window manager on `DISPLAY=:0`.
`desktop start` errors on any other image, `tektona/sandbox-base` included.

`tektona vnc` and `tektona sandbox screenshot` need no desktop image. They read
the sandbox screen, which shows the text console when no desktop runs.

**The desktop does not start by itself**, also on `tektona/desktop`.
`sandbox create --vnc` does not start it either. Pass `--start-desktop` to
`tektona vnc`, or run `tektona sandbox desktop start <id>` first. A console
view on a desktop template means that nobody started the desktop.

## Fork and tags

**Fork, branch, throw away:**
```sh
tektona sandbox fork <id> --mode filesystem --ssh   # cheap branch
tektona sandbox fork <id> --mode full --ssh         # includes RAM
tektona sandbox delete <fork-id> -y
```

**Set sandbox tags:**

```sh
tektona sandbox tag replace <id> --tag review --tag frontend
tektona sandbox tag add <id> --tag urgent
tektona sandbox tag replace <id>       # clear all tags
tektona sandbox fork <id> --tag review # replace tags on the fork
tektona sandbox fork <id>               # inherit the parent tags
tektona sandbox fork <id> --clear-tags  # create an untagged fork
```

Tags are unique strings with a maximum of 20 items. Each tag has 1 to 100
ASCII letters, numbers, `_`, `.`, `-`, or `/`. Tags cannot start with `tektona/`.
Use `--tag` more than once on create, fork, list, replace, and add. `add` keeps
existing tags. `replace` sets the complete list. `--tag` and `--clear-tags`
cannot be used together.

## Lifecycle: pause, wake, delete

Write `--auto-resume false`; `--no-auto-resume` is a deprecated hidden alias.

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
tektona sandbox create tektona/sandbox-base --auto-pause never      # at create time; a batch job needs no desktop
tektona sandbox lifecycle <id> --auto-pause never             # or on an existing sandbox
```

Each knob is **tri-state**: a duration (`15m`, `2h`, `30d`), `never` (disable —
interval knobs only), or `inherit` (fall through **sandbox override → project
default → platform default**). Set any subset at create or later:

```sh
tektona sandbox create tektona/desktop \
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

## Ownership and visibility

A sandbox belongs to one user and is **private by default**. `tektona sandbox ls`
defaults to `--scope mine`, so **it lists only your own sandboxes** — a
teammate's sandbox is absent from that output even when it is running and you
have every right to use it. Read an unexpectedly empty list as a scope question
before you conclude the sandbox is gone:

```sh
tektona sandbox ls --scope shared      # sandboxes others shared with you
tektona sandbox ls --scope all         # everything you can access
tektona sandbox ls --all-projects      # every project in the org (still --scope mine unless you widen it)
```

`--scope` chooses **whose**, `--all-projects` chooses **which projects**. They
are independent, so `--all-projects` alone still shows only yours.

The owner (or a project/org admin) shares it. `--type use` lets project members
operate it; `--type manage` also lets them delete it. A `manage` holder still
cannot reshare or transfer. Sharing exposes the sandbox **screen**, so anyone who
can observe it can screenshot the desktop — keep a sandbox private while secrets
are on screen.

`tektona sandbox transfer` moves ownership to a project **writer or higher**, and
it **revokes outstanding SSH, VNC, and preview tokens**. Open sessions stop, and
the new owner re-establishes them.

To reach another member's *private* sandbox you need the admin surface, which
requires project-admin (or org-owner for `--all-projects`) and returns 403
otherwise:

```sh
tektona admin sandbox ls --orphaned --older-than 24h
tektona admin sandbox rm <id> --yes
```
