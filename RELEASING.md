# Releasing the Tektona agent skills

Skills follow the same tag-driven release pattern as the CLI, but with a
`skill-v*` tag prefix so the two release flows don't collide.

## Cut a release

```sh
# 1. Make sure the change is merged to main
git checkout main && git pull

# 2. Tag with the new version (no leading 'v' on the variable; the tag itself uses skill-vX.Y.Z)
VERSION=0.1.0
git tag "skill-v${VERSION}" -m "skill-v${VERSION}"
git push origin "skill-v${VERSION}"
```

Pushing the tag triggers `.github/workflows/skill-release.yml`, which:

1. Validates frontmatter on every `SKILL.md` under `internal/tektona-cli/skill/`.
2. Smoke-installs the skill into a tempdir using the Vercel `skills` CLI.
3. Splits the `internal/tektona-cli/skill/` subtree and force-pushes it to
   the `main` branch of the public mirror repo `tektona-ai/agent-skills`.
   The mirror is intentionally untagged — skills are meant to evolve,
   `npx skills update` reconciles against `main`, and pinning, when
   needed, is done against this monorepo's `skill-v*` tag.
4. Creates a GitHub Release on this monorepo, with a changelog scoped to
   commits touching `internal/tektona-cli/skill/**`.

You can also dry-run via the **workflow_dispatch** entry point in the
Actions UI.

## What consumers see

After the workflow finishes:

```sh
npx skills add tektona-ai/agent-skills                                                            # tracks main
npx skills add https://github.com/tektona-ai/tektona/tree/skill-v0.1.0/internal/tektona-cli/skill # pinned
```

`npx skills update` reconciles installed skills against the mirror's
`main` using the GitHub Trees API.

## Required repo setup (one-time)

- Create the empty public repo `tektona-ai/agent-skills`.
- Add a repo secret `SKILL_MIRROR_TOKEN`: a fine-grained PAT (or GitHub
  App token) with `contents: write` on `tektona-ai/agent-skills`. The
  default `GITHUB_TOKEN` only has access to the current repo.

## Versioning policy

- Skills version independently from the CLI (`skill-v*` vs `cli-v*`).
- Bump **patch** for wording fixes, typo fixes, command-table corrections.
- Bump **minor** when adding/removing covered commands or adding a new
  skill to the package.
- Bump **major** when changing a skill's trigger conditions (frontmatter
  `description`) in a way that meaningfully shifts when agents will load
  it — consumers may need to re-evaluate whether they want the skill
  installed at all.
