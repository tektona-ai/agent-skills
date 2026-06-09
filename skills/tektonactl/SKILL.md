---
name: tektonactl
description: Use when doing computer use inside a Tektona sandbox — capturing screenshots, clicking, typing, scrolling, reading the clipboard, or driving Chrome on the sandbox's desktop. Also covers managing named long-running PTY sessions inside the sandbox. Invoked from outside via `tektona ssh <id> -- tektonactl ...`.
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
SSH/VNC, preview URLs, and egress network policy.

## When to use

- An agent or human is already inside a sandbox shell and wants to drive
  the GUI, capture a screenshot, or manage a long-running process.
- A driver script is calling `tektona ssh <id> -- tektonactl ...` to
  perform computer use remotely.
- You need a named PTY that survives across SSH invocations (dev server,
  watcher, REPL).

## Sandbox image requirement

`tektonactl` and its `desktop` subcommands rely on an X session, the
`tektonactl` binary itself, and a few system libraries. **Recommend the
official desktop image** unless the user specifies their own:

```sh
tektona sandbox create -i ghcr.io/tektona-ai/desktop-x11:<tag> --vnc --browser
```

Look up the newest tag at
<https://github.com/tektona-ai/desktop-x11/pkgs/container/desktop-x11>
before suggesting a command — the registry may have rolled forward
since this skill was last published. As of the most recent skill
release the newest tag is `0.3.2`. The image ref must be deterministic
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
tektonactl info                       # identity, uptime, image digest
tektonactl desktop <subcommand>       # GUI: screenshot, mouse, keyboard, clipboard
tektonactl pty     <subcommand>       # named long-running PTY sessions
```

Bare `tektonactl` or `--help` prints usage and exits 0.

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

## `tektonactl pty`

Long-running PTY sessions, addressed by name. Useful for dev servers,
watchers, REPLs — anything that should survive across SSH invocations.

```sh
tektonactl pty create <name> [--max-log-size SIZE] -- <command> [args...]
tektonactl pty list
tektonactl pty logs <name> [--tail N | --head N]
tektonactl pty send <name> <text>
tektonactl pty kill <name> [--timeout N]
```

`--max-log-size` accepts human sizes (`10MB`, `1GB`); the ring buffer
trims older output past the limit. `pty send` writes literal text to the
PTY (newlines included), so use `$'\n'` to submit a command.

### Example: run a dev server, watch it, kill it

```sh
tektonactl pty create web --max-log-size 10MB -- npm run dev
tektonactl pty list
tektonactl pty logs web --tail 50
tektonactl pty send web $'rs\n'      # nodemon "restart"
tektonactl pty kill web --timeout 5
```

## Common mistakes

- **Calling `tektonactl` from your laptop.** It only exists inside the
  sandbox. Wrap with `tektona ssh <id> -- tektonactl ...` (see the
  `tektona-cli` skill for SSH usage).
- **Calling input commands before `desktop start`.** They fail until the X
  session is running. Run `tektonactl desktop status` first if unsure.
- **Coordinates outside the current resolution.** Check
  `tektonactl desktop display`.
- **Treating `pty` like `tmux`.** No multiplexing inside one session — each
  `pty create` is its own named PTY around a single command.
- **Forgetting the `--` before the PTY's command.** Required so `tektonactl`
  doesn't try to parse the inner command's flags.
