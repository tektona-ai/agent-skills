---
name: tektona-sdk
description: Use when writing TypeScript or JavaScript against Tektona with `@tektona/sdk` — creating sandboxes from code, running processes and streaming their output, preview URLs, SSH and VNC access tokens, desktop control, secrets, egress network policies, orgs, projects, repositories, registries, git credentials, pagination, and typed errors.
---

# Tektona TypeScript SDK

## Overview

`@tektona/sdk` is the official TypeScript client for the Tektona API. It runs on
Node.js (>= 22), Bun, Deno, and edge runtimes with `fetch`. Use it to drive
sandboxes from your own code — a service, a worker, an agent harness, a test
suite — instead of shelling out to the CLI.

The package is alpha. The API can change before `1.0`.

**RELATED SKILLS:** Use `tektona-cli` for shell work — one-off sandbox
management, `tektona ssh`, file copy, and the egress-proxy commands the SDK does
not wrap yet. Use `tektonactl` for computer use *inside* a sandbox.

## Secrets where possible, everything else in env

**This is the most important rule when you wire up a sandbox. Read it before you
reach for `env`.**

> **Anything sensitive → a secret + an egress-proxy rule.
> Everything else → `env` in the create body.**

An `env` value is **visible inside the sandbox**, so agent code can read and leak
it. A secret is injected as an HTTP header at the egress boundary and **never
enters the sandbox**. Reserve `env` for non-secret config — model names, base
URLs, feature flags, `NODE_ENV` — and for a value a tool needs raw in-process for
non-HTTP use.

**Canonical example — an Anthropic API key for a coding agent.** The key is a
header to a known host, so it goes in a secret. The model name is not sensitive,
so it goes in `env`:

```ts
// SECRET — never enters the sandbox; injected at the egress boundary
await tek.secret.create({
  key: 'anthropic',
  scope: 'project',            // 'org' | 'project' | 'personal'
  type: 'generic',             // 'generic' | 'git'
  value: process.env.ANTHROPIC_API_KEY!,
})

// The rule that injects it is NOT in the SDK facade yet — see "Gaps" below.
// tektona egress-proxy rule add team-defaults \
//   --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'

// ENV — non-secret config, visible in-box (the right place for these)
const sandbox = await tek.sandbox.create({
  image: 'node:22',
  env: { ANTHROPIC_MODEL: 'claude-sonnet-4-5' },
  // NOT: env: { ANTHROPIC_API_KEY: '…' }  ← that would expose the key in the box
})
```

Two controls shape outbound traffic, and they are independent. The **gate**
(`egress_network_policy`) decides which hosts a sandbox may reach at all. The
**treatment** (`egress_proxy_profile`) injects a header into requests to a host
the gate already allows. A treatment never widens the gate.

## Install

```sh
pnpm add @tektona/sdk   # or npm / yarn / bun
```

Node 22 is the floor. The SDK uses the global `fetch` **and** the global
`WebSocket` — process streaming (`run`, `wait`, `attach`, `logs({follow:true})`,
`waitForPort`) opens a WebSocket. A runtime with no global `WebSocket` fails on
those calls only.

## Create a client

```ts
import { Tektona } from '@tektona/sdk'

const tek = new Tektona({
  apiKey: process.env.TEKTONA_API_KEY, // else TEKTONA_API_KEY
  apiUrl: 'https://api.tektona.ai',    // else TEKTONA_API_URL, else this default
  org: 'acme-corp',                    // else TEKTONA_ORG
  project: 'backend',                  // else TEKTONA_PROJECT
  timeoutMs: 60_000,                   // per request; default 60s
  headers: { 'X-My-Header': 'foo' },
})
```

Every option falls back to its environment variable. The client is cheap and
stateless — construct one per process and reuse it.

**The SDK reads env vars only.** It does **not** read the CLI's stored key
(`~/.config/tektona/api_key`) or the repo-local `.tektona/config.json` that
`tektona ctx set` writes. A script that works after `tektona login` fails under
the SDK until you export `TEKTONA_API_KEY` (and usually `TEKTONA_ORG` /
`TEKTONA_PROJECT`).

### Scope — org and project

Most resources live under an org and a project. Set defaults on the client and
override per call:

```ts
await tek.secret.list()                    // acme-corp/backend
await tek.secret.list({ project: 'api' })  // override this call only
await tek.org.list()                       // top-level, ignores scope
```

A scoped call with no org or project — neither per-call nor default — throws
`InvalidArgumentError` **before the network call**, naming what is missing.

## Quick reference — `@tektona/sdk`

`tek.sandbox.create` / `.get` / `.list` return a `Sandbox` instance. Every
per-sandbox action exists twice: `tek.sandbox.<op>(id, …)` and `sandbox.<op>(…)`.

| Task | Code |
|---|---|
| Create a sandbox | `tek.sandbox.create({ image, resources, env, egress_network_policy })` |
| Create with a request timeout | `tek.sandbox.create(body, { timeoutMs: 120_000 })` |
| Get one | `tek.sandbox.get(id)` |
| List (one page) | `tek.sandbox.list({ limit: 50, state: ['running'] })` |
| List everything | `for await (const sb of tek.sandbox.listAll()) …` |
| Include others' shared sandboxes | `tek.sandbox.list({ scope: 'shared' \| 'all' })` |
| Search the whole org | build a client with no `project` — see the note below the table |
| Delete (idempotent) | `tek.sandbox.delete(id)` |
| Pause | `sandbox.pause({ mode: 'hibernate' \| 'suspend' })` |
| Resume | `sandbox.resume()` |
| Reboot | `sandbox.reboot()` |
| Fork | `sandbox.fork({ mode: 'filesystem' \| 'full' })` |
| Resize | `sandbox.resize({ cpu: 4, memory: 8, force: true })` |
| Lifecycle config | `sandbox.getLifecycleConfig()` / `sandbox.updateLifecycleConfig({ auto_pause_after: '15m' })` |
| State history | `sandbox.listTransitions({ limit: 20 })` / `sandbox.listAllTransitions()` |
| Listening ports | `sandbox.listPorts()` |
| Effective inject rules | `sandbox.listEgressInjectionRules()` |
| Share / unshare | `sandbox.share({ share_type: 'use' \| 'manage' })` / `sandbox.unshare()` |
| Transfer ownership | `sandbox.transfer({ to: 'user@example.com', reason: 'handover' })` |
| SSH credentials | `sandbox.ssh.access()` → `{ url, token, ssh_host, ssh_port, ssh_ports? }` |
| VNC token | `sandbox.vnc.access({ start_desktop: true })` → `{ url, token, expires_at }` |
| Start / stop the desktop | `sandbox.desktop.start()` / `sandbox.desktop.stop()` |
| Screenshot (base64 PNG) | `sandbox.desktop.screenshot()` |
| Preview URL for a port | `sandbox.preview.create(3000, { ttl: '1h' })` |
| Revoke a preview URL | `sandbox.preview.revoke(token)` |
| Run a command, wait for it | `sandbox.process.run('npm test', { cwd: '/workspace' })` |
| Start a background process | `sandbox.process.start('npm run dev', { name: 'dev-server' })` |
| Wait for a port | `handle.waitForPort(3000, { timeoutMs: 30_000 })` |
| Tail logs | `for await (const ev of handle.logs({ follow: true, tail: 100 })) …` |
| Wait for exit | `await handle.wait()` → exit code |
| Stop / signal | `handle.stop({ force: true })` / `handle.signal('SIGHUP')` |
| Interactive PTY | `handle.attach({ onData })` → `{ write, resize, signal, detach }` |
| Address a process later | `sandbox.process.getByName('dev-server')` / `.getById(ulid)` |
| List processes | `sandbox.process.list({ autostart: true })` |
| Secrets | `tek.secret.list()` / `.create(body)` / `.update(id, body)` / `.delete(id)` |
| Egress network policies | `tek.egressNetworkPolicy.list()` / `.create()` / `.get(name)` / `.update()` / `.delete()` |
| Org-scoped policies | `tek.egressNetworkPolicy.listOrgScoped()` and the other `*OrgScoped` methods |
| System policies (read-only) | `tek.egressNetworkPolicy.listSystem()` / `.getSystem('tektona/dev')` |
| Orgs | `tek.org.list()` / `.get(org)` / `.create()` / `.update()` / `.listMembers(org)` |
| Projects | `tek.project.list()` / `.get(name)` / `.create()` / `.update()` / `.delete()` |
| Projects across every org | `tek.project.listForUser()` / `.listAllForUser()` |
| Sandbox settings | `tek.project.getSandboxSettings()` / `tek.org.getSandboxSettings()` (+ `update…`) |
| Repositories | `tek.repository.list()` / `.create({ url, name })` / `.update()` / `.delete()` |
| Git credentials | `tek.gitCredential.list()` / `.create(body)` / `.update(id, body, { scope })` / `.delete(id, { scope })` |
| Registries | `tek.registry.list()` / `.create(body, { dryRun: true })` / `.update()` / `.delete()` |
| Locations | `tek.location.list()` |

Every `list()` returns one `Page<T>`. Every list-backed service also has a
`listAll()` async iterator that walks the pages for you.

`sandbox.list` needs an org and narrows to a project when one is set. A per-call
`project` **overrides** the client default, but it cannot clear it — passing
`project: undefined` falls back to the client's project. For an org-wide list,
construct a client with `org` only.

## snake_case bodies, camelCase options

This is the mistake that costs the most time. The rule is mechanical:

- **A request body is the wire type — snake_case.** `egress_network_policy`,
  `auto_pause_after`, `share_type`, `start_desktop`, `max_log_bytes`.
- **SDK-owned options and instance fields are camelCase.** `timeoutMs`,
  `preventAutoPause`, `timeoutSeconds`, `maxLogBytes`, `egressNetworkPolicy`,
  `nextCursor`, `hasMore`.

```ts
const sandbox = await tek.sandbox.create({
  image: 'ghcr.io/tektona-ai/sandbox-base:0.4.3',
  egress_network_policy: 'tektona/open',  // body → snake_case
  resources: { cpu: 2, memory: 4, disk: 20 },  // cores, GiB, GiB
})
sandbox.egressNetworkPolicy                 // instance field → camelCase
```

A misspelled body field is silently ignored by the API, so the sandbox comes up
with the **project default** policy instead of the one you asked for. If egress
behaves unexpectedly, check the casing first.

Process options are the exception that proves the rule: `run`/`start` take
SDK-owned camelCase options (`preventAutoPause`, `onHibernate`,
`timeoutSeconds`, `maxLogBytes`) and the SDK maps them onto the wire body.

## Choosing an image

Any OCI image works. The reference must be **deterministic** — it must not float
over time. A non-`latest` tag, a `@sha256:...` digest, or both will satisfy that:

```text
image:tag                        ✓
image:tag@sha256:<digest>        ✓  tag + exact-build pin
image@sha256:<digest>            ✓  digest only (most deterministic)
image:latest@sha256:<digest>     ✓  :latest is fine when pinned by digest
image:latest                     ✗  bare floating tag
image                            ✗  no tag and no digest
```

**Start from an official image** unless the user names their own. Both are Ubuntu
24.04 and **boot with systemd** (image `0.4.3`+):

```text
ghcr.io/tektona-ai/sandbox-base:<tag>   # headless: agent, CI, and server work
ghcr.io/tektona-ai/desktop-x11:<tag>    # sandbox-base + X11 desktop, Chrome — for VNC
```

`sandbox-base` ships Claude Code, Codex and opencode on the `PATH`, Node 22 LTS,
code-server, git, Python 3, and a build toolchain. Resolve `<tag>` against the
registry before you write it into code:
<https://github.com/tektona-ai/sandbox-images/pkgs/container/sandbox-base>

A **private** image needs a registry credential — `tek.registry.create(body)`,
with `{ dryRun: true }` to test the connection without saving. A sandbox that
errors right after create usually has a registry endpoint or namespace mismatch.

## Common workflows

**Create a sandbox and be sure it is running.** `create` sends `wait=true`, so it
blocks server-side for up to 30 seconds and normally returns a `running`
sandbox. It is **not guaranteed**: a slow image build returns earlier in the
`scheduling` → `building_image` → `running` sequence. There is no `wait()`
helper — poll `get`:

```ts
import { SandboxState } from '@tektona/sdk'

let sandbox = await tek.sandbox.create({ image: 'node:22' }, { timeoutMs: 120_000 })
while (sandbox.state !== SandboxState.Running) {
  if (sandbox.state === SandboxState.Error || sandbox.state === SandboxState.Deleted) {
    throw new Error(`sandbox ${sandbox.id} settled in ${sandbox.state}`)
  }
  await new Promise((r) => setTimeout(r, 1000))
  sandbox = await tek.sandbox.get(sandbox.id)
}
```

**A `Sandbox` instance is a snapshot, not a live view.** `state` and the other
fields are frozen at the moment you fetched it. `pause()` returns the new state
in its response, but the instance you called it on still reports the old one.
Re-`get` whenever the current state matters.

**Run a command and read its output:**

```ts
const r = await sandbox.process.run('npm ci && npm test 2>&1', {
  cwd: '/workspace',
  env: { CI: 'true' },
  timeoutSeconds: 600,   // kill the whole process group after 10 minutes
})
if (r.exitCode !== 0) throw new Error(r.stdout + r.stderr)
```

The command is a **shell command line** — `&&`, pipes, redirection and globs work
directly. (The CLI's `process run` takes an argument vector unless given
`-s/--shell`. The SDK does not.) `run` waits by streaming, with no wait ceiling
of its own, so bound long work with `timeoutSeconds`.

**Start a server, wait for its port, publish it:**

```ts
const dev = await sandbox.process.start('npm run dev', {
  name: 'dev-server',        // [a-z0-9_-], unique among running processes
  cwd: '/workspace',
  preventAutoPause: true,    // pin the sandbox awake while it runs
})
await dev.waitForPort(3000, { timeoutMs: 30_000 })

const preview = await sandbox.preview.create(3000, { ttl: '1h' })
console.log(preview.url)     // check preview.kind before reading preview.token
```

`waitForPort` watches the process while it polls, so a crashed server rejects
immediately with `ProcessExitedError` (carrying `exitCode`, `signal`, and a tail
of `stderr`) instead of waiting out the timeout. On timeout it throws
`TimeoutError` and **leaves the process running** — it never stops anything.

Prefer `process.start` over `process.run('npm start &')`. The process is
sandbox-owned, so it survives your client disconnecting, and it is named,
tailable, and stoppable later from any client:

```ts
const again = await sandbox.process.getByName('dev-server')
for await (const ev of again.logs({ follow: true, tail: 100 })) {
  process.stdout.write(ev.data)   // ev: { seq, stream, ts, data: Uint8Array }
}
await again.stop()                // TERM → grace → KILL; { force: true } skips to KILL
```

Give a background process a speaking `name` that fits its purpose, for example
`run-frontend` or `build-backend`. A random memorable name is generated when you
omit it. `autostart: true` persists the definition and relaunches it on every
boot; it requires `name`.

**Drive an interactive shell:**

```ts
const shell = await sandbox.process.start('bash -il', { tty: true })
const t = await shell.attach({ onData: (bytes) => term.write(bytes) })
t.write('ls\n')
t.resize({ cols: 200, rows: 50 })
t.detach()                        // leave the session; the process keeps running
```

**Clone a private git repo inside a sandbox.** Clone over **HTTPS**, never SSH.
Tektona injects the stored credential at the egress boundary, so the token never
enters the sandbox and the URL carries nothing. Wiring one up is **two steps, in
order** — register the repo, then add a credential that unlocks it:

```ts
const repo = await tek.repository.create({ url: 'https://github.com/acme/api', name: 'api' })
await tek.gitCredential.create({
  name: 'acme-bot',
  display_name: 'Acme bot',
  forge: 'github',                 // 'github' | 'gitlab'
  scope: 'project',                // 'project' | 'personal'
  token: process.env.GITHUB_TOKEN!,
  repository_ids: [repo.id],       // must reference an already-registered repo
})
await sandbox.process.run('git clone https://github.com/acme/api /workspace/api')
```

A clone that fails with an auth error means no credential covers that repo.
`gitCredential.update` rotates the token live, on running sandboxes and new ones.

**Page through a long list:**

```ts
const page = await tek.sandbox.list({ limit: 50 })
page.items; page.hasMore; page.nextCursor; page.totalCount
if (page.hasMore) await tek.sandbox.list({ cursor: page.nextCursor })

for await (const sb of tek.sandbox.listAll({ state: ['running'] })) console.log(sb.id)
```

**Handle errors and back off:**

```ts
import { RateLimitError, ConflictError, isHttpStatus } from '@tektona/sdk'

try {
  await tek.sandbox.create({ image })
} catch (err) {
  if (err instanceof RateLimitError) {
    await new Promise((r) => setTimeout(r, err.retryAfterMs ?? 1000))
  } else if (isHttpStatus(err, 404)) {
    // gone
  }
  throw err
}
```

`isHttpStatus(err, status)` is the canonical way to branch on a status. Errors
form a hierarchy under `TektonaError`. HTTP errors are `ApiError` subclasses
carrying `statusCode` — `AuthenticationError` (401), `AuthorizationError` (403),
`InvalidArgumentError` (400/422), `NotFoundError` (404, with
`SandboxNotFoundError` / `SecretNotFoundError` / `ProcessNotFoundError`),
`QuotaExceededError` (402), `ConflictError` (409, with `LoggingDisabledError`),
`RateLimitError` (429). Sandbox-domain errors sit under `SandboxError` —
`TimeoutError`, `ProcessExitedError`, `CommandExitError`,
`EgressNetworkPolicyError`, `NotEnoughSpaceError`.

**The SDK never retries for you.** There is no built-in backoff. Write your own
loop for 429 and for transient 5xx, keyed on `err.retryAfterMs` where it is set.

**Delete calls are idempotent.** `sandbox.delete`, `secret.delete`,
`project.delete`, `repository.delete`, `registry.delete`, `gitCredential.delete`,
`egressNetworkPolicy.delete` and `preview.revoke` all swallow a 404 — a
second delete resolves cleanly instead of throwing.

**Control when a sandbox pauses, wakes, and is deleted.** By default a sandbox
auto-pauses (hibernates) after 15 minutes without **boundary-crossing** traffic,
wakes on the next access, and is never auto-deleted. The idle timer sees only
traffic that crosses the sandbox boundary — SSH, exec, preview HTTP, outbound
network. **Silent in-VM compute looks idle**, so a build or a training run gets
hibernated mid-job. Disable auto-pause before you launch one:

```ts
await tek.sandbox.create({ image: 'node:22', auto_pause_after: '0' })  // '0' = never
await sandbox.updateLifecycleConfig({ auto_pause_after: '15m', auto_resume: true })
```

`auto_pause_after` and `auto_delete_after` are Go duration strings. In the
**create** body, `'0'` means never and an omitted field inherits the project or
platform default. In `updateLifecycleConfig`, an **empty string** disables the
timer. `auto_delete_after` applies only to a **paused** sandbox and its clock
starts at the pause — read `'7d'` as "delete 7 days after it pauses". A resume
clears the clock. `preventAutoPause: true` on a single process is the narrower
alternative: it pins the sandbox awake for that process's lifetime only.

**Waking is automatic.** You do not need `resume()` before a process call or a
preview request — the access resumes the sandbox and then serves the request.
Expect a few seconds of extra latency on first contact with a paused sandbox.

## Gaps — what the facade does not cover yet

The SDK is alpha and the facade trails the API. These have **no ergonomic
method**:

| Missing | Use instead |
|---|---|
| Egress proxy profiles and inject rules (`tek.egressProxyProfile` is an empty stub) | The `tektona egress-proxy` CLI commands, or `generated.createOrgProjectEgressProxyProfile` / `addOrgProjectEgressProxyProfileRule` |
| Hard reset | `generated.resetSandbox` |
| Sandbox visibility (public / private) | `public: true` at create time, or `generated.setSandboxVisibility` |
| Project lifecycle defaults | `generated.getProjectLifecycleDefaults` / `updateProjectLifecycleDefaults` |
| File upload and download | No such API — use `tektona sandbox cp` from the CLI, or write small files with `process.run` and a here-doc |
| An SSH connection | `sandbox.ssh.access()` mints credentials only. Connect with your own ssh client, or run commands with `sandbox.process.run` |

Reach the uncovered operations through the generated transport layer. It is
re-exported as `generated`, is fully tree-shakeable, and takes `baseUrl` and
`auth` per call — it does **not** inherit the `Tektona` client's configuration:

```ts
import { generated } from '@tektona/sdk'

const { data, error } = await generated.resetSandbox({
  baseUrl: tek.apiUrl,
  auth: tek.apiKey,
  path: { id: sandbox.id },
})
if (error) throw error   // generated calls RETURN errors; they do not throw
```

Generated calls also skip the SDK's error mapping, so you get the raw problem
detail rather than a typed `TektonaError`.

## Rules that bite

- **Set the scope.** Pass `org`/`project` to the constructor, or on each call.
  Most "not found" errors are a wrong scope, not a missing resource — read a 404
  as a scope question first.
- **Export `TEKTONA_API_KEY`.** The SDK ignores the CLI's stored credentials and
  its `.tektona/config.json`.
- **Open the gate before you expect egress.** The default gate is restrictive.
  Pass `egress_network_policy: 'tektona/open'` at create, or list the project's
  policies to find one that allows what you need.
- **Address a sandbox by its full 26-character ULID.** A prefix is rejected.
- **A `Sandbox` is a snapshot.** Re-`get` it when the state matters.
- **`fork()` returns a plain object** (`{ id, state, cache_key, image_ref }`),
  not a `Sandbox`. Call `tek.sandbox.get(fork.id)` for the instance.
- **Check `preview.kind` before reading `preview.token`.** A `public` result has
  a URL and nothing else; only a `token` result carries `token` and `expiresAt`.
- **`maxLogBytes: 0` disables logging.** `logs()` then throws
  `LoggingDisabledError`. An omitted value and an explicit `0` are different.
- **Roles decide what a 403 means.** A project **writer** creates and operates
  sandboxes, and can *use* a secret without seeing its value. Project-level
  material — shared secrets, git credentials, egress network policies,
  registries, project settings — needs project **admin**.
- **A sandbox is private by default.** `sandbox.list()` shows your own unless you
  pass `scope: 'shared'` or `'all'`. Sharing exposes the sandbox **screen**.

## When NOT to use this skill

- Shell and one-off work — that is `tektona-cli`. Do not write a script to do
  what one command does.
- Computer use inside a sandbox — that is `tektonactl`.
- Building or modifying the Tektona platform itself, including the SDK's own
  source. That is repository code, not SDK usage.
- A language other than TypeScript or JavaScript — call the HTTP API directly.
