import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Skill, SkillMeta } from "./types.js";

const DASHES = /^---\s*$/;

const VALID_NAME = /^[a-z][a-z0-9-]*[a-z0-9]$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Split a markdown file's YAML frontmatter from its body. Returns null when none is present. */
function splitFrontmatter(source: string): { frontmatter: string; body: string } | null {
  const lines = source.split(/\r?\n/);
  const first = lines[0];
  if (!first || !DASHES.test(first)) return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && DASHES.test(line)) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""),
  };
}

function parseMeta(raw: string): SkillMeta {
  const parsed = parseYaml(raw) ?? {};
  if (isPlainObject(parsed)) return { name: "", description: "", ...parsed } as SkillMeta;
  return { name: "", description: "" } as SkillMeta;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

/** Resolve the entry markdown file for a skill directory. */
function resolveEntryFile(dir: string): string | null {
  const candidate = path.join(dir, "SKILL.md");
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  let found: string | null = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith(".md") && !f.startsWith(".")) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isFile()) {
          found = full;
          break;
        }
      }
    }
  } catch {
    return null;
  }
  return found;
}

/**
 * Load a single skill directory. Returns null when the directory holds no entry
 * markdown file or it cannot be read/parsed.
 */
export function loadSkill(dir: string): Skill | null {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;

  const entryFile = resolveEntryFile(abs);
  if (!entryFile) return null;

  let source: string;
  try {
    source = fs.readFileSync(entryFile, "utf8");
  } catch {
    return null;
  }

  const split = splitFrontmatter(source);
  const meta = split ? parseMeta(split.frontmatter) : ({} as SkillMeta);
  const body = split ? split.body : source.trim();

  const dirName = path.basename(abs);
  let name = typeof meta.name === "string" && meta.name.trim() !== "" ? meta.name.trim() : dirName;
  const id = VALID_NAME.test(name) ? name : dirName;

  const description = typeof meta.description === "string" ? meta.description : "";
  const modelInvokable = !bool(meta.disable_model_invocation);

  return {
    id,
    dir: abs,
    entryFile,
    meta: { ...meta, name, description },
    frontmatter: split?.frontmatter ?? "",
    body,
    modelInvokable,
  };
}
