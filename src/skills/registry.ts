import * as fs from "node:fs";
import * as path from "node:path";
import { loadSkill } from "./frontmatter.js";
import type { Skill, SkillSummary } from "./types.js";

/**
 * Discovers and caches skills found in the configured root directory.
 * A skill is a subdirectory containing an entry markdown file with frontmatter.
 */
export class SkillRegistry {
  private skills: Map<string, Skill> | null = null;
  private lastMtimeMs = 0;

  constructor(private root: string) {}

  /** Scan the root once, unless files changed since. Returns all skills keyed by id. */
  getSkills(): Map<string, Skill> {
    if (!fs.existsSync(this.root)) return new Map();
    const stat = fs.statSync(this.root);
    if (this.skills && stat.mtimeMs === this.lastMtimeMs) return this.skills;

    const out = new Map<string, Skill>();
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(this.root, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const skill = loadSkill(path.join(this.root, ent.name));
      if (skill) out.set(skill.id, skill);
    }
    this.skills = out;
    this.lastMtimeMs = stat.mtimeMs;
    return out;
  }

  getSkill(id: string): Skill | undefined {
    return this.getSkills().get(id);
  }

  list(): Skill[] {
    return [...this.getSkills().values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Compact catalog entries for load-skills: frontmatter, not full bodies. */
  summarize(): SkillSummary[] {
    return this.list().map((s) => ({
      id: s.id,
      name: s.meta.name ?? s.id,
      description: s.meta.description ?? "",
      when_to_use: s.meta.when_to_use,
      argument_hint: s.meta.argument_hint,
      model_invokable: s.modelInvokable,
      version: s.meta.version,
    }));
  }

  /**
   * List files inside a skill directory, relative to the skill root and capped
   * in depth to avoid walking huge trees.
   */
  listFiles(id: string): { ok: boolean; error?: string; files?: string[] } {
    const skill = this.getSkill(id);
    if (!skill) return { ok: false, error: `Unknown skill: ${id}` };
    const files: string[] = [];
    const walk = (dir: string, prefix: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          walk(path.join(dir, e.name), rel);
        } else {
          files.push(rel);
        }
      }
    };
    walk(skill.dir, "");
    files.sort();
    return { ok: true, files };
  }
}
