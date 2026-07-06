---
name: tektonactl
description: Use when doing work inside a Tektona sandbox — running or managing processes (background servers, one-off commands, interactive shells, logs, autostart) via `tektonactl process`, or computer use (screenshots, clicking, typing, scrolling, clipboard, driving Chrome on the desktop). Also covers printing Tektona's egress CA (`tektonactl ca cert`) so tools with their own trust store (e.g. Java keytool) can import it. Invoked from outside via `tektona ssh <id> -- tektonactl ...`.
---

# tektonactl — in-sandbox control tool

## Overview

`tektonactl` runs **inside** a Tektona sandbox. It is on `PATH` for any
shell created through `tektona ssh`. From outside the sandbox, wrap calls:

```sh
tektona ssh <sandbox-id> -- tektonactl <command> [args]
```

**RELATED SKILL:** Use `tektona-cli` for getting into the sandbox in the
first place — installing the CLI, authenticating, creating sandboxes,
SSH/VNC, preview URLs, env vars, secrets, and egress network policy /
egress proxy profiles.

## When to use

- An agent or human is already inside a sandbox shell and wants to drive
  the GUI, capture a screenshot, or manage a long-running process.
- A driver script is calling `tektona ssh <id> -- tektonactl ...` to
  perform computer use remotely.

## Sandbox image requirement

`tektonactl` and its `desktop` subcommands rely on an X session, the
`tektonactl` binary itself, and a few system libraries. **Recommend the
official desktop image** unless the user specifies their own:

```sh
tektona sandbox create -i ghcr.io/tektona-ai/desktop-x11:0.4.1 --vnc --browser
```

Look up the newest tag at
<https://github.com/tektona-ai/desktop-x11/pkgs/container/desktop-x11>
before suggesting a command — the registry may have rolled forward
since this skill was last published. As of the most recent skill
release the newest tag is `0.4.1`. The image ref must be deterministic
— a real tag, a `@sha256:...` digest, or both. Bare `:latest` (no
digest) is rejected because it floats; bare `image@sha256:...` digests
are accepted.

## When NOT to use

- You haven't created a sandbox yet — start with the `tektona-cli` skill.
- You want the sandbox itself paused/forked/deleted — that's `tektona
  sandbox …` from outside, in `tektona-cli`.
- You're capturing a screenshot for a one-off look — `tektona sandbox
  screenshot <id>` from outside is one command and does not require the
  desktop to be already started in the same way.

## Top level

```
tektonactl get                        # identity, uptime, image digest (aliases: info, show)
tektonactl process <subcommand>       # run and manage processes (aliases: proc, ps, p)
tektonactl desktop <subcommand>       # GUI: screenshot, mouse, keyboard, clipboard
tektonactl ca cert                    # print Tektona's egress CA as PEM
```

Bare `tektonactl` or `--help` prints usage and exits 0.

## Injected secrets are NOT visible in the sandbox

Credentials Tektona injects (API keys, tokens — see the egress proxy profile /
secrets flow in the `tektona-cli` skill) are attached to outbound requests **at
the egress boundary, outside the sandbox**. They are *not* present in the box:
not in the environment, not on disk, not readable by anything you run via
`tektonactl` or `tektona ssh`. A request to a matched host (e.g.
`api.anthropic.com`) leaves carrying the credential, but nothing inside can read
it. Don't go hunting for an injected key in env vars or files — it isn't there by
design. (Non-secret config passed with `tektona sandbox create --env KEY=VAL`
*is* visible in-box; that's the intended split.)

## `tektonactl ca cert` — egress CA for tools with their own trust store

When an egress proxy profile injects into a host, the proxy terminates TLS for
that host, so the sandbox must trust Tektona's egress CA. Tektona stages this
automatically at boot for the common tools (`curl`, Node, Python `requests`, Go,
`git`) via the system trust store and the standard CA-bundle env vars — those
work with no setup.

Some runtimes ship their **own** trust store and ignore the system one — **Java**
is the usual example. `tektonactl ca cert` prints the *current* CA as PEM to
stdout, so it pipes straight into such an importer and stays correct across CA
rotation:

```sh
tektonactl ca cert | keytool -importcert -alias tektona \
  -cacerts -storepass changeit -noprompt
```

Read the live cert at boot — never bake the CA into your image: it rotates, and a
baked copy goes stale.

## `tektonactl process` — run background work

The primary way an in-sandbox agent runs background processes. It targets **this
sandbox** (no id), talks to the same process manager the outside
`tektona sandbox process` commands use, and needs no API key or network hop.
Anything started here is fully visible and controllable from outside, and vice
versa.

```sh
# Start a background server; -d returns immediately with its id
tektonactl process run -d --name dev-server -- npm run dev

# Wait for a one-off command and exit with its code (stdin piped through)
tektonactl process run -- npm test

# Interactive shell (real PTY)
tektonactl process run -t -- bash

tektonactl process ls                     # running + finished (alias: list)
tektonactl process get <ref>              # by name or ULID (aliases: info, show)
tektonactl process logs <ref> -f [--tail N]
tektonactl process attach <ref>           # reattach: replays recent output, then live
tektonactl process stop <ref> [--force]   # SIGTERM → grace → SIGKILL (group)
tektonactl process signal <ref> SIGHUP
```

`run` flags: `-d/--detach`, `-t/--tty`, `-n/--name`, `--env K=V` (repeatable),
`--cwd`, `--user`, `--timeout <dur>`, `--prevent-auto-pause` (keep the sandbox
awake while it runs), `--on-suspend preserve|stop|restart_after_resume`,
`--autostart` (relaunch on every boot; requires `--name`), `--max-log-bytes`
(`0` = logging off).

A `--name` is `[a-z0-9_-]`, unique among running processes, and lets you address
the process later without the ULID. Processes are server-owned: they survive
this shell disconnecting. Prefer this over `npm start &` — a shell-backgrounded
process isn't tracked, tailable, or stoppable by name.

## `tektonactl desktop`

Drives the sandbox's desktop session. The desktop must be started
before screenshot/input commands work:

```sh
tektonactl desktop start [resolution]   # default 1280x720
tektonactl desktop stop
tektonactl desktop status               # active | inactive
tektonactl desktop display              # current resolution
```

You can also start the desktop from outside via
`tektona sandbox desktop start <id>` (see the `tektona-cli` skill).

### Screenshot

```sh
tektonactl desktop screenshot                    # PNG to stdout
tektonactl desktop screenshot -o /tmp/shot.png   # write to file
tektonactl desktop screenshot --format jpeg      # JPEG
```

### Mouse

```sh
tektonactl desktop click <x> <y>
tektonactl desktop click <x> <y> --button left|middle|right
tektonactl desktop click <x> <y> --double
tektonactl desktop click <x> <y> --triple
tektonactl desktop click <x> <y> --modifier shift|ctrl|alt
tektonactl desktop move <x> <y>
tektonactl desktop drag <x1> <y1> <x2> <y2>
tektonactl desktop scroll <x> <y> --delta-y N      # negative = scroll down
tektonactl desktop cursor                          # print current position
```

### Keyboard

```sh
tektonactl desktop type "hello world" [--delay 12]
# Bump --delay (e.g. 150) for GTK widgets that drop fast repeats
tektonactl desktop key Return | Tab | Escape | BackSpace | ...
tektonactl desktop hotkey ctrl+s
tektonactl desktop hotkey ctrl+shift+t
```

### Windows / clipboard

```sh
tektonactl desktop windows     # list open windows
tektonactl desktop clipboard   # current clipboard contents
```

### `--screenshot` modifier

Every input action (`click`, `move`, `drag`, `scroll`, `type`, `key`,
`hotkey`) accepts `--screenshot` to return a PNG of the post-action screen
on stdout. Useful for closing the perception loop in one round trip:

```sh
tektonactl desktop click 600 400 --screenshot > after.png
```

## Common mistakes

- **Calling `tektonactl` from your laptop.** It only exists inside the
  sandbox. Wrap with `tektona ssh <id> -- tektonactl ...` (see the
  `tektona-cli` skill for SSH usage).
- **Calling input commands before `desktop start`.** They fail until the X
  session is running. Run `tektonactl desktop status` first if unsure.
- **Coordinates outside the current resolution.** Check
  `tektonactl desktop display`.
