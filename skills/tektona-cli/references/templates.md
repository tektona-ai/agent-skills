# Templates

Read this to choose a template, build one from an image or a manifest, share it with the org, move tags, pin versions, or debug a failed build.

## Contents

- Commands
- Concepts, scopes and the default template
- From your own image to a sandbox
- Share with the organization
- Build steps (manifest)
- Tags and versions
- A build failed
- List and inspect

## Commands

| Task | Command |
|---|---|
| List / show templates | `tektona template ls [--scope project\|org\|system]` / `tektona template get <ref>` |
| Template from an image | `tektona template create <name> --image <ref>` (`org/<name>` for the whole org) |
| Build with steps | `tektona template build run -f <name>.template.tektona.yaml [--tag <tag>]` (`template init <name>` writes the file) |
| List / move template tags | `tektona template tag ls <ref>` / `tektona template tag set <ref> <tag> <version-id>` |
| Build status and log | `tektona template build ls [<ref>]` / `tektona template build logs <build-id> [-f]` |

## Concepts

A **template** is what a sandbox starts from: an OCI image, optional build
steps, and the defaults a sandbox gets (CPU, memory, disk, env, user, workdir).
`sandbox create` takes a template reference, and never an image.

A **build** turns a template's image and steps into a **version**. A version
never changes. A **tag** is a name that points at one version, and you move
it. A reference with no tag resolves the `default` tag.

| Reference | Scope | Who can create from it |
|---|---|---|
| `tektona/desktop`, `tektona/sandbox-base` | system | everyone; Tektona publishes them |
| `go-dev` (same as `project/go-dev`) | project | the current project |
| `org/go-dev` | org | every project in the organization |
| `go-dev:stable` | — | the version that the `stable` tag points at |

**Use `tektona/desktop` unless the user names another template.** Use
`tektona/sandbox-base` only for headless work (CI, servers, batch jobs): it is
smaller and has no desktop to start. Both are Ubuntu 26.04 and **boot with
systemd**, so `systemctl` works and a daemon installed with `apt` keeps running:

```text
tektona/desktop         tektona/sandbox-base plus an X11 desktop and Chrome — for VNC and `tektonactl desktop`
tektona/sandbox-base    headless: agent, CI, and server work
```

Both ship Claude Code, Codex and opencode on the `PATH`, Node 22 LTS, git,
Python 3 with pipx, and a build toolchain, plus a `tektona` user with
passwordless sudo. `/home/tektona/.local/bin` is on the `PATH`. A template built
from a bare library image such as `node:24` has none of that **and no
systemd**, so a long-running service then needs `sandbox process run
--autostart`.

**From your own image to a sandbox.** `--image` exists only on the template
commands. `sandbox create --image <ref>` fails with
`Error: templates replace --image; use tektona sandbox create tektona/sandbox-base`:

```sh
tektona template create app --image ghcr.io/acme/app:1.0   # builds version 1, tags it `default`, waits
tektona sandbox create app                                  # starts from the `default` tag
```

**Share a template with the organization.** Create it with the `org/` prefix.
Every project in the org can then create from `org/app`. A project template
cannot move to the org; build it again under `org/<name>`. Only the flags build
an org template: a manifest (`-f`) always builds into the project, so an org
template has no build steps. Put the packages in the image itself instead.

```sh
tektona template create org/app --image ghcr.io/acme/app:1.0
```

**Add build steps** (packages, config) with a manifest. Steps need a manifest;
the flags build a version with no steps:

```sh
tektona template init app -i ghcr.io/acme/app:1.0   # writes ./app.template.tektona.yaml
tektona template build run -f app.template.tektona.yaml --tag default
```

```yaml
spec:
  build:
    image: ghcr.io/acme/app:1.0
    steps:
      - name: install tools
        run: |
          apt-get update
          apt-get install -y ripgrep
```

`metadata.name` in the file names the template. Do not also pass a name on the
command line. The org and the project come from your CLI context.

**Tags and versions.** `template create` tags its first version `default`.
`template build run` moves **no tag** unless you pass `--tag`. A build without
`--tag` is reached only by `--template-version <id>`, and a new template built
that way has no `default` tag, so `sandbox create <name>` fails with
`template tag "project/<name>:default" not found`.

```sh
tektona template build run app --image ghcr.io/acme/app:1.1 --tag default   # rebuild and promote
tektona template version ls app                                            # version ids, newest first, with their tags
tektona template tag ls app                                                # each tag and the version it points at
tektona template tag set app stable <version-id>                           # move a tag, no build (also a rollback)
tektona sandbox create app:stable                                          # a tag you control
tektona sandbox create app --template-version <version-id>                 # one exact version
```

`<version-id>` is the 26-character id that `template version ls` prints.

**A build failed.** `template create` and `template build run` print each step
and its log, and exit non-zero on failure. The last lines name the failed step
and its exit code. To read a build later:

```sh
tektona template build ls app            # build ids and status
tektona template build logs <build-id>   # steps and log; -f follows a running build, --tail N
tektona template build get <build-id>    # status and the error line
```

A build accepts any image reference, a floating tag included. It resolves the
reference to a digest and records that digest on the version. Name the tag the
user asked for. For "the latest X" with no tag, find the highest version tag on
the registry (`crane ls <repo>`).

A **private** image needs a registry credential, stored per project in the
console (Project settings → Registries) or through the API. There is no
`tektona registry` command. A build that fails on the pull usually has a
registry endpoint or namespace mismatch.

**List and inspect:** `tektona template ls [--scope project|org|system]` lists
every template you can create from, the `tektona/` ones included.
`tektona template get <ref>` shows one.
