# Egress: the gate and the treatment

Two independent controls shape a sandbox's outbound traffic.

- **Egress network policy** — the **gate**: which hosts a sandbox may reach at
  all (`egress-network-policy`, alias `np`).
- **Egress proxy profile** — the **treatment**: a bundle of **rules**, each
  matching a host and injecting a header built from a secret (`egress-proxy`,
  aliases `egress` / `egress-proxy-profile`).

The treatment never widens the gate. If the policy does not already allow the
host, the rule is inert. Pair them: a gate that reaches `api.anthropic.com`, and
a treatment that injects your key there.

## Reference grammar

Both `--egress-network-policy` and `--egress-proxy-profile` take a **scope
keyword** prefix, not an org or project name:

- `tektona/<name>` — system (Tektona-provided). Gates have these (`tektona/dev`,
  `tektona/open`); treatments have none, so `tektona/<name>` is reported as "no
  system proxy profile".
- `org/<name>` — the sandbox's org.
- `project/<name>` — the sandbox's project.
- `<name>` (bare) — **strict alias for `project/<name>`**. A bare name is always
  the project scope; use `org/<name>` for an org resource. There is no hidden org
  fallback.

## Secrets

Stored material referenced by key, never echoed back:

```sh
tektona secret set anthropic <<<"$KEY"   # upsert from STDIN; default --scope project
tektona secret set my-tok --scope personal <<<"$TOK"   # only your sandboxes
tektona secret set org-key --scope org   <<<"$KEY"     # shared across the org
tektona secret ls                        # KEY / SCOPE / TYPE — values are NEVER shown
tektona secret ls --scope personal       # filter: all|project|personal|org
tektona secret rm anthropic              # default --scope project
```

`set` is an upsert: a new key is created, an existing one has its value rotated
in place, live on running sandboxes within seconds and with no recreate.

Scopes run `personal` (only sandboxes you own) → `project` (everyone on the
project) → `org` (every project in the org). A `${secret:KEY}` reference resolves
most-specific-first, so a personal value shadows a shared one with no rule change.

## Treatments and their inject rules

```sh
tektona egress-proxy apply team-defaults --scope project --default  # create (project default)
tektona egress-proxy rule add team-defaults \
  --host api.anthropic.com --header 'x-api-key=${secret:anthropic}'  # inject a header
tektona egress-proxy rule add team-defaults \
  --host api.example.com   --header 'Authorization=Bearer ${secret:my-tok}'
tektona egress-proxy ls                  # NAME / SCOPE / DEFAULT / RULES
tektona egress-proxy show team-defaults  # the profile and its rules (with rule ids)
tektona egress-proxy rule rm team-defaults <rule-id>  # remove one rule (id from show)
tektona egress-proxy rm team-defaults
```

`rule add` requires `--host <domain>` and at least one repeatable
`--header 'NAME=TEMPLATE'`; a template references a secret as `${secret:KEY}`.
The value is resolved just-in-time at the proxy and **never enters the sandbox**.
Optional `--path <prefix>` scopes a rule to a path prefix.

A rule **overwrites** a header the sandbox already set. Put a placeholder in the
sandbox's own config and keep the real value in the secret.

## Attaching a treatment

At create time (the project default applies automatically otherwise):

```sh
tektona sandbox create -i node:22 --egress-proxy team-defaults
#   --egress-proxy-profile is the long-form alias of --egress-proxy
```

On an **existing** sandbox — no recreate needed. The change is confirmed active on
the sandbox's node before the command returns. The sandbox must be running, so
resume a paused one first:

```sh
tektona sandbox egress-proxy set <sandbox_id> team-defaults   # attach, or switch
tektona sandbox egress-proxy unset <sandbox_id>               # detach — injection stops; the gate stays
#   `sandbox egress-proxy-profile` is the long-form alias
```

**Runtime mutability.** Editing a gate or a treatment takes effect on
already-running sandboxes within a few seconds, because the proxy re-resolves
rules and secrets on a short cache TTL. A changed policy, a swapped profile, or a
rotated secret all land with no recreate and no pause/resume.

## TLS trust

A rule rewrites a header inside an HTTPS request, so the proxy terminates TLS for
that host. The sandbox trusts the proxy CA at boot: the CA lands at
`/etc/tektona/ca.pem`, goes into the distro trust store, and is exported as
`SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `GIT_SSL_CAINFO`
and `CURL_CA_BUNDLE`. curl, git, Python `requests`, Go and Node (including
`fetch`) work with no image change.

A runtime with its own trust store ignores those variables and fails the
handshake. The JVM, a certifi bundle used without `SSL_CERT_FILE`, and any
certificate-pinning client are the common cases. Import the CA explicitly:

```sh
tektona ssh <id> -- tektonactl ca cert            # print the live CA, then import it
```

## Proving a rule works

Call an endpoint that **requires** auth, and send a deliberately wrong key. It
succeeds through the gate and fails from your laptop. An unauthenticated endpoint
answers 200 either way, so it proves nothing.
