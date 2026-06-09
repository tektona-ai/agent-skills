# Tektona agent skills

Two skills that teach Claude Code (and other [Agent
Skills](https://agentskills.io)–compatible agents) how to drive the
[Tektona](https://tektona.ai) CLI:

- **`tektona-cli`** — install, auth, sandbox lifecycle, SSH/VNC/preview,
  egress network policy.
- **`tektonactl`** — the in-sandbox control tool: computer use (mouse,
  keyboard, screenshots, clipboard) and named PTY sessions.

## Install the CLI itself

The skills assume one of these is on `PATH`:

```sh
npm install -g @tektona/cli
# or
brew install tektona-ai/tap/tektona
```

## Install the skills

Both skills are published via GitHub. Use the [Vercel `skills`
CLI](https://github.com/vercel-labs/skills):

### Canonical (short URL via mirror repo)

```sh
# Both skills
npx skills add tektona-ai/agent-skills

# Just one of them
npx skills add tektona-ai/agent-skills --skill tektona-cli
npx skills add tektona-ai/agent-skills --skill tektonactl
```

The mirror tracks `main` only — `npx skills update` will pull in new
releases automatically. To pin to a specific release, install from this
monorepo's tag instead:

```sh
npx skills add https://github.com/tektona-ai/tektona/tree/skill-v0.1.0/internal/tektona-cli/skill
```

The CLI clones the repo (shallow), discovers `skills/<name>/SKILL.md`
files, and symlinks them into your active agent's skill directory
(`~/.claude/skills/` for Claude Code).

## Layout

```
skills/
├── tektona-cli/SKILL.md   # outside-the-sandbox CLI surface
└── tektonactl/SKILL.md    # in-sandbox tool surface
```

Each `SKILL.md` declares its trigger conditions in YAML frontmatter; the
two skills cross-reference each other so an agent only loads what's
relevant to the task at hand.

