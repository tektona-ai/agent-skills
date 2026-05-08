#!/usr/bin/env node
// Validate every SKILL.md under skills/* has well-formed frontmatter.
//
//   node scripts/validate.mjs
//
// Checks (matching what the Vercel `skills` CLI requires):
//   - YAML frontmatter block exists
//   - `name` and `description` are non-empty strings
//   - `name` matches /^[a-z0-9][a-z0-9-]*$/ (Agent Skills spec)
//   - description starts with "Use when" (CSO convention)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = join(here, "..", "skills");

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function listSkillFiles(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    const path = join(dir, "SKILL.md");
    try {
      statSync(path);
      out.push(path);
    } catch {
      throw new Error(`expected SKILL.md at ${path}`);
    }
  }
  return out;
}

function parseFrontmatter(src, path) {
  if (!src.startsWith("---\n")) {
    throw new Error(`${path}: missing YAML frontmatter (file must start with '---')`);
  }
  const end = src.indexOf("\n---", 4);
  if (end === -1) throw new Error(`${path}: unterminated frontmatter`);
  const block = src.slice(4, end);
  const fm = {};
  for (const raw of block.split("\n")) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    fm[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return fm;
}

function validate(path) {
  const src = readFileSync(path, "utf8");
  const fm = parseFrontmatter(src, path);
  const errs = [];
  if (!fm.name) errs.push("missing `name`");
  else if (!NAME_RE.test(fm.name))
    errs.push(`name '${fm.name}' must match ${NAME_RE}`);
  if (!fm.description) errs.push("missing `description`");
  else {
    if (fm.description.length < 30)
      errs.push(`description too short (<30 chars): '${fm.description}'`);
    if (fm.description.length > 1024)
      errs.push(`description too long (>1024 chars)`);
    if (!/^use when/i.test(fm.description))
      errs.push(`description should start with 'Use when' (CSO convention)`);
  }
  return { path, name: fm.name, errs };
}

const files = listSkillFiles(skillsRoot);
if (files.length === 0) {
  console.error("no skills found under", skillsRoot);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const r = validate(file);
  if (r.errs.length) {
    failed++;
    console.error(`✗ ${r.path}`);
    for (const e of r.errs) console.error(`    ${e}`);
  } else {
    console.log(`✓ ${r.path} (name=${r.name})`);
  }
}

if (failed) {
  console.error(`\n${failed} skill(s) failed validation`);
  process.exit(1);
}
console.log(`\n${files.length} skill(s) ok`);
