---
name: tektona-typescript-sdk
description: Use when Tektona is driven from TypeScript or JavaScript code with the `@tektona/sdk` package, rather than from a shell. Covers the `Tektona` client and its scope, sandboxes created from code, processes and their streamed output, preview URLs, SSH and VNC access tokens, secrets, egress network policies, pagination, and typed errors. For the `tektona` command line, use the `tektona-cli` skill instead.
---

# Tektona TypeScript SDK

## Overview

`@tektona/sdk` is the official TypeScript client for the Tektona API. It runs on
Node.js (>= 22), Bun and Deno. Use it to drive sandboxes from your own code — a
service, a worker, an agent harness, a test suite — instead of the CLI.

The client constructor reads `process.env` unconditionally, so an edge runtime
needs a `process` shim as well as `fetch`.

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

// The PROFILE that carries the injection rule is NOT in the SDK facade yet.
// Create it once with the CLI — see "Gaps" below.
// tektona egress-proxy apply team-defaults --scope project
// tektona egress-proxy rule add team-defaults \
//   --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'

const sandbox = await tek.sandbox.create({
  image: 'node:22',
  egress_proxy_profile: 'team-defaults',   // ← without this, nothing is injected
  // ENV — non-secret config, visible in-box (the right place for these)
  env: { ANTHROPIC_MODEL: 'claude-sonnet-4-5' },
  // NOT: env: { ANTHROPIC_API_KEY: '…' }  ← that would expose the key in the box
})
```

**A secret alone injects nothing.** The rule lives on a *profile*, and a sandbox
only gets a profile's rules when it names one in `egress_proxy_profile` at create
time, or when that profile is the project default (`--default` on
`egress-proxy apply`). Skip both and the request leaves unauthenticated, with the
key neither in the box nor on the wire.

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

Only `apiKey`, `apiUrl`, `org` and `project` fall back to an environment
variable. `timeoutMs` and `headers` do not — they default to 60 seconds and no
extra headers. The client is cheap and stateless: construct one per process and
reuse it.

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

`tek.sandbox.create` and `.get` return a `Sandbox` instance; `.list` returns a
`Page<Sandbox>`. Lifecycle, sharing and observability actions exist twice —
`sandbox.pause(…)` and `tek.sandbox.pause(id, …)` are the same call.

Three asymmetries bite:

- **`delete` is service-only.** There is no `sandbox.delete()`. Call
  `tek.sandbox.delete(id)`.
- **The sub-namespaces are instance-only.** `sandbox.process`, `sandbox.ssh`,
  `sandbox.vnc`, `sandbox.desktop` and `sandbox.preview` have no `tek.sandbox.*`
  equivalent. Get an instance first with `tek.sandbox.get(id)`.
- **Where the service does mirror them, the names differ** —
  `sandbox.ssh.access()` is `tek.sandbox.createSshAccess(id)`,
  `sandbox.desktop.start()` is `tek.sandbox.startDesktop(id)`,
  `sandbox.preview.create(port)` is `tek.sandbox.preview(id, port)`. There is no
  flat process surface at all.

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
| Toggle autostart | `handle.setAutostart(false)` / `sandbox.process.setAutostart(ref, false)` |
| Secrets | `tek.secret.list()` / `.create(body)` / `.update(id, body)` / `.delete(id)` |
| Egress network policies | `tek.egressNetworkPolicy.list()` / `.create()` / `.get(name)` / `.update()` / `.delete()` |
| Org-scoped policies | `tek.egressNetworkPolicy.listOrgScoped()` and the other `*OrgScoped` methods |
| System policies (read-only) | `tek.egressNetworkPolicy.listSystem()` — see the `getSystem` warning below |
| Orgs | `tek.org.list()` / `.get(org)` / `.create()` / `.update()` / `.listMembers(org)` |
| Projects | `tek.project.list()` / `.get(name)` / `.create()` / `.update()` / `.delete()` |
| Projects across every org | `tek.project.listForUser()` / `.listAllForUser()` |
| Sandbox settings | `tek.project.getSandboxSettings()` / `tek.org.getSandboxSettings()` (+ `update…`) |
| Repositories | `tek.repository.list()` / `.create({ url, name })` / `.update()` / `.delete()` |
| Git credentials | `tek.gitCredential.list()` / `.create(body)` / `.update(id, body, { scope })` / `.delete(id, { scope })` |
| Registries | `tek.registry.list()` / `.get(name)` / `.create(body, { dryRun: true })` / `.update()` / `.delete()` |
| Locations | `tek.location.list()` |

**Most `list()` calls return one `Page<T>`** — `{ items, hasMore, nextCursor,
totalCount }` — and pair with a `listAll()` async iterator that walks the pages.
Four return a **plain array** and have no `listAll`: `tek.location.list()`,
`sandbox.process.list()`, `sandbox.listPorts()` and
`sandbox.listEgressInjectionRules()`. `tek.egressNetworkPolicy.listSystem()`
returns `{ items, system_denies }`, which is not a `Page` either. Reading
`.items` off the array-returning ones gives `undefined`.

`sandbox.list` needs an org and narrows to a project when one is set. A per-call
`project` **overrides** the client default, but it cannot clear it — passing
`project: undefined` falls back to the client's project. For an org-wide list,
construct a client with `org` only.

## snake_case bodies, camelCase options

The rule is mechanical:

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

Getting it wrong fails loudly, in one of two places. A body written **inline** as
an object literal gets TypeScript's excess-property check, so
`egressNetworkPolicy` does not compile and the error names the correct field.
That check does not fire when the body arrives as a **variable**, and there is no
compiler at all in plain JavaScript — but the API schema sets
`additionalProperties: false`, so the request is rejected with **422** and the
SDK raises `InvalidArgumentError` naming the offending field.

Nothing is silently dropped. Read a 422 on create as a field-name question.

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

// Only these three lead to running. Anything else is terminal or needs a resume.
const PENDING: string[] = [SandboxState.Scheduling, SandboxState.BuildingImage, SandboxState.Resuming]

let sandbox = await tek.sandbox.create({ image: 'node:22' }, { timeoutMs: 120_000 })
const deadline = Date.now() + 300_000
while (sandbox.state !== SandboxState.Running) {
  if (!PENDING.includes(sandbox.state)) {
    throw new Error(`sandbox ${sandbox.id} settled in ${sandbox.state}`)
  }
  if (Date.now() > deadline) throw new Error(`sandbox ${sandbox.id} never reached running`)
  await new Promise((r) => setTimeout(r, 1000))
  sandbox = await tek.sandbox.get(sandbox.id)
}
```

Wait on an **allow-list** of pending states, not a deny-list of failures.
`SandboxState` has nine members: a deny-list that names only `error` and
`deleted` spins forever on `hibernated` or `suspended`, which a sandbox reaches
on its own through auto-pause. Bound the loop with a deadline as well.

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
immediately with `ProcessExitedError` instead of waiting out the timeout. It
carries `exitCode`, `signal`, and a tail of the error output — that tail is
stderr in pipe mode, and the merged terminal output for a `tty` process, which
has no separate stderr. On timeout it throws `TimeoutError` and **leaves the
process running** — it never stops anything.

Prefer `process.start` over `process.run('npm start &')`. The process is
sandbox-owned, so it survives your client disconnecting, and it is named,
tailable, and stoppable later from any client:

```ts
const again = await sandbox.process.getByName('dev-server')   // needs a running sandbox
for await (const ev of again.logs({ follow: true, tail: 100 })) {
  process.stdout.write(ev.data)   // ev: { seq, stream, ts, data: Uint8Array }
}
await again.stop()                // TERM → grace → KILL; { force: true } skips to KILL
```

Give a background process a speaking `name` that fits its purpose, for example
`run-frontend` or `build-backend`. A random memorable name is generated when you
omit it. `autostart: true` persists the definition and relaunches it on every
boot; it requires `name`. Toggle it later with `handle.setAutostart(enabled)` or
`sandbox.process.setAutostart(ref, enabled)`.

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
import { RateLimitError } from '@tektona/sdk'

async function createWithRetry(body: CreateSandboxBody, attempts = 3) {
  for (let i = 0; ; i++) {
    try {
      return await tek.sandbox.create(body)
    } catch (err) {
      if (!(err instanceof RateLimitError) || i >= attempts - 1) throw err
      await new Promise((r) => setTimeout(r, err.retryAfterMs ?? 1000 * 2 ** i))
    }
  }
}
```

`isHttpStatus(err, status)` is the canonical way to branch on a status. Errors
form a hierarchy under `TektonaError`. HTTP errors are `ApiError` subclasses
carrying `statusCode` — `AuthenticationError` (401), `AuthorizationError` (403),
`InvalidArgumentError` (400/422), `NotFoundError` (404), `QuotaExceededError`
(402), `ConflictError` (409), `RateLimitError` (429).

**Catch the base classes, not the specific ones.** The SDK exports several
subclasses it never constructs — `SandboxNotFoundError`, `SecretNotFoundError`,
`FileNotFoundError`, `CommandExitError`, `NotEnoughSpaceError` and
`EgressNetworkPolicyError` are types only, so `instanceof` against them never
fires. Every 404 arrives as a plain `NotFoundError`. The subclasses that are
really thrown are `ProcessNotFoundError` (404 on an unknown process ref),
`LoggingDisabledError` (409 from `logs()` on a process with `maxLogBytes: 0`),
`TimeoutError` and `ProcessExitedError` (both from `waitForPort`), and
`ProcessStreamClosedError` when a stream drops.

`InvalidArgumentError` is also raised **client-side**, before any request, for a
missing scope or an out-of-range preview TTL. Those instances carry no
`statusCode`, so branch with `isHttpStatus` or `instanceof`, never
`err.statusCode === 400`.

**The SDK never retries for you.** There is no built-in backoff. Write your own
loop for 429 and for transient 5xx, keyed on `err.retryAfterMs` where it is set.

**`getSystem` cannot fetch a system policy — use `listSystem`.** Both system
policy names contain a slash (`tektona/dev`, `tektona/open`), and
`getSystem(name)` puts the name straight into the path. The extra segment misses
the route, so every realistic call 404s. List and filter instead:

```ts
const { items } = await tek.egressNetworkPolicy.listSystem()
const dev = items?.find((p) => p.name === 'tektona/dev')
```

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

**Waking is only partly automatic — this catches people.** Starting a process
(`process.run` and `process.start`) resumes a paused sandbox and then serves the
request. **Every other process call fails instead**: `getByName`, `getById`,
`list`, `logs`, `wait`, `attach`, `stop`, `signal`, `setAutostart` and
`waitForPort` throw `ConflictError` (409) against a paused sandbox, because the
SDK does not ask the API to resume for them. Reconnecting to a long-lived
process is exactly the case that hits this:

```ts
const sandbox = await tek.sandbox.get(id)
if (sandbox.state !== SandboxState.Running) await sandbox.resume()
const dev = await sandbox.process.getByName('dev-server')   // 409 without the resume
```

Call `resume()` first when you re-attach to a sandbox that may have auto-paused.
Expect a few seconds of extra latency on first contact.

## Gaps — what the facade does not cover yet

The SDK is alpha and the facade trails the API. These have **no ergonomic
method**:

| Missing | Use instead |
|---|---|
| Egress proxy profiles and inject rules (`tek.egressProxyProfile` is an empty stub) | The `tektona egress-proxy` CLI commands, or `generated.createOrgProjectEgressProxyProfile` / `addOrgProjectEgressProxyProfileRule` |
| Attaching or detaching a profile on a **running** sandbox | CLI only — `tektona sandbox egress-proxy set/unset`. Not in `generated` either. Name the profile at create time instead |
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
- **Resume before you re-attach.** Only `process.run` / `process.start` wake a
  paused sandbox. Every other process call throws `ConflictError` (409).
- **`SandboxState` does not cover every state the API returns.** It omits
  `failed`, among others. Wait on an allow-list of pending states and treat
  anything else as terminal, or a poll loop hangs.
- **There is no `sandbox.delete()`.** Delete is `tek.sandbox.delete(id)`.
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
