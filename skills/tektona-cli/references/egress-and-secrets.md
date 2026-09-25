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

## AWS: a signature, not a header

An AWS API accepts no static header. It authenticates a request with a SigV4
signature computed over that request's own method, host, path, query and body,
so the value that authenticates one request is wrong for the next. No stored
string can stand in for it, and `--header` cannot reach AWS.

A rule that names a region and a service makes the proxy compute the signature
at the egress boundary. The credential never enters the sandbox.

### Store the credential

An AWS credential has two halves, and they are one credential:

```sh
printf '%s' "$AWS_SECRET_ACCESS_KEY" | \
  tektona secret set aws-logs --scope project \
    --type aws --aws-access-key-id AKIA...
```

The access key id is not secret — it travels in cleartext in every signed
request — so Tektona checks its shape before saving. The secret access key is
the confidential half and is read from stdin.

Both halves rotate together. A rotation names the new key id **and** the new
secret access key; naming only one is refused, because a mismatched pair fails
at AWS and not here.

Use a long-lived key (`AKIA`). A temporary credential (`ASIA`) also needs a
session token, which Tektona does not carry, so it is refused at save time.

### Bind the host

```sh
tektona egress-proxy rule add aws \
  --host '*.es.amazonaws.com' \
  --aws-region eu-central-1 --aws-service es \
  --aws-secret aws-logs
```

`--aws-service` is the AWS service name in the signing scope: `es` for
OpenSearch, or `s3`, `dynamodb`, `sqs`, `sts`, `bedrock`. It is not decoration —
the service string is an input to the derived signing key, so a wrong one
produces `SignatureDoesNotMatch`, and it cannot be guessed from the hostname
(`bedrock-runtime.…` signs as `bedrock`).

**One rule per service.** The service is per-request cryptographic input, so
five AWS services are five rules even when they share a credential and a region.
The IAM policy on the credential decides what each may actually do.

### What your code still needs

Most AWS SDKs refuse to build a request with no credentials configured, so give
them AWS's published example pair. The proxy replaces the whole signature, so
that value never reaches AWS:

```sh
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

Keep the real region and endpoint in your code. The proxy corrects the
signature, not the address.

### Things that bite

- **The gate is separate.** A signing rule does not make the host reachable. The
  egress network policy must allow it too, or the request is denied even though
  a rule matches.
- **S3 has two host shapes.** Virtual-hosted is `<bucket>.s3.<region>.amazonaws.com`,
  path-style is `s3.<region>.amazonaws.com`. A rule binds one host, so cover the
  shape your SDK uses.
- **Avoid `*.amazonaws.com`.** It reaches every AWS host, including buckets other
  accounts own.
- **A body up to 10 MiB** is signed whole; a larger one is signed per chunk as it
  streams, up to the 5 GiB AWS accepts in one request. Your tool must send a
  `Content-Length`.

### Proving it works

`sts:GetCallerIdentity` needs no AWS resource and no IAM permission, and its
reply names the caller. Run it from the sandbox with the example keys above: an
ARN in the response is proof the proxy signed the request, because the sandbox
never held the real credential.

```sh
tektona ssh <id> -- curl -sS -X POST https://sts.eu-central-1.amazonaws.com/ \
  -H 'Accept: application/json' -d 'Action=GetCallerIdentity&Version=2011-06-15'
```

`InvalidClientTokenId` means the rule never fired and the placeholder reached
AWS. `SignatureDoesNotMatch` means the rule fired but the region or service is
wrong for that endpoint.

## Attaching a treatment

At create time (the project default applies automatically otherwise):

```sh
tektona sandbox create tektona/sandbox-base --egress-proxy team-defaults
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
