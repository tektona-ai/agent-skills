# Files, processes, SSH and ports

Read this to run commands or background processes in a sandbox, copy files, forward ports, share a preview URL, or call `tektonactl` from outside.

## Contents

- Commands
- Run a server and share it (processes, previews, long jobs)
- Port forwarding
- Move files in and out
- Inside the sandbox: `tektonactl`

## Commands

| Task | Command |
|---|---|
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

## Run a server and share it

**Pick one preview model and stay in it.** `--public` at create time gives
durable canonical URLs. `sandbox preview` without `--public` mints a
bearer-token URL (default 12h, max 24h).

**Run a server in a sandbox and share it** (headless, so `tektona/sandbox-base`):
```sh
ID=$(tektona s c tektona/sandbox-base -o json | jq -r .id)
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

## Port forwarding

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

## Move files in and out

`tektona sandbox cp` goes through the same brokered access as `tektona ssh`,
and copies in parallel. Legacy `scp -O` (pre-OpenSSH-9.0) does not work with the
access gateway. To edit a file, push it in with `sandbox cp` or
`tektona ssh -- cat/sed/tee`; do not drive an interactive editor over SSH.

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

## Inside the sandbox: `tektonactl`

Once SSHed in, `tektonactl` is on `PATH` and drives the desktop and
sandbox introspection. From outside the sandbox, wrap it:

```sh
tektona ssh <id> -- tektonactl info
tektona ssh <id> -- tektonactl desktop screenshot -o /tmp/s.png
```

For the full command surface — `desktop` (screenshot, click, type,
clipboard, windows) — load the `tektonactl` skill.
