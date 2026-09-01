import * as fs from "node:fs";
import * as path from "node:path";
import type { Handler, Json, McpToolInputSchema, ToolResult } from "../mcp/protocol.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { SkillSummary } from "../skills/types.js";

type ToolDef = { name: string; description: string; inputSchema: McpToolInputSchema };

const MAX_BODY_CHARS = 6000;

/** Wrapping library so tool bodies stay single-line and readable to models. */
function block(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const LOAD_SKILLS_DESCRIPTION = [
  "MANDATORY first action in every chat session. Call load-skills once at session",
  "start, before any other tool, to load the full catalog of registered skills with",
  "their descriptions plus the exact instructions for invoking them via the 'skill'",
  "tool. Do not guess skill names.",
].join(" ");

function catalogMarkdown(summaries: SkillSummary[]): string {
  const lines: string[] = [];
  lines.push("# Skill catalog");
  lines.push("");
  lines.push(
    "Each line is a registered skill. Match the description to the task, then invoke it"
  );
  lines.push("with the 'skill' tool using its exact id.");
  lines.push("");
  lines.push("| id | model-invokable | description | when_to_use | argument-hint |");
  lines.push("|---|---|---|---|---|");
  for (const s of summaries) {
    const when = s.when_to_use ? s.when_to_use.replace(/\n/g, " ") : "";
    lines.push(
      `| ${s.id} | ${s.model_invokable ? "yes" : "no"} | ${esc(s.description)} | ${esc(when)} | ${esc(s.argument_hint ?? "")} |`
    );
  }
  return lines.join("\n");
}

function esc(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export function loadSkillsTool(registry: SkillRegistry): {
  def: ToolDef;
  handler: Handler;
} {
  return {
    def: {
      name: "load-skills",
      description: LOAD_SKILLS_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          why: {
            type: "string",
            description: "What the current user session needs, to help match skills.",
          },
        },
      },
    },
    handler: async (args: Record<string, Json>) => {
      const why = typeof args.why === "string" ? args.why.trim() : "";
      const summaries = registry.summarize();
      const text = [
        "# skills-mcp: load completed",
        "",
        "This server maps MCP tools onto Claude Code style skills (SKILL.md).",
        "Call load-skills once at the start of the session, then use the tools below.",
        "",
        "## Tools",
        "",
        "- `skill` — invoke a skill by id. Pass the id and any arguments from the user prompt.",
        "- `read-skill-file` — read one file inside a skill directory (references/, scripts/, etc.).",
        "- `list-skill-files` — list the files a skill ships, to find what is available.",
        "",
        "## Invocation rules",
        "",
        "- A skill whose model-invokable is 'yes' may be auto-triggered by matching its",
        "  description. Always load its body with `skill` before following it.",
        "- A skill whose model-invokable is 'no' requires user approval: pass",
        "  `user_approved: true` to `skill` only when the user explicitly asked for it.",
        "- After loading a skill body, if it names files (references/, scripts/, templates/),",
        "  list them and read what you need before proceeding.",
        "",
        why ? `## Session note\n\n${why}\n` : "",
        summaries.length
          ? catalogMarkdown(summaries)
          : "## No skills\n\nNo skills are registered in the configured skills directory.",
      ]
        .filter((s) => s !== "")
        .join("\n");
      return block(text);
    },
  };
}

export function useSkillTool(registry: SkillRegistry): {
  def: ToolDef;
  handler: Handler;
} {
  return {
    def: {
      name: "skill",
      description: [
        "Invoke a registered skill by its exact id. Returns the skill's full instructions.",
        "Chain: after loading, call read-skill-file for any references or scripts it names.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The exact skill id from the catalog returned by load-skills.",
          },
          arguments: {
            type: "string",
            description: "Raw argument string from the user's request, passed through unmodified.",
          },
          user_approved: {
            type: "boolean",
            description:
              "Must be true to invoke a skill marked model-invokable: no, only set when the user explicitly requested it.",
          },
        },
        required: ["id"],
      },
    },
    handler: async (args: Record<string, Json>) => {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      const userApproved = args.user_approved === true;
      const raw = typeof args.arguments === "string" ? args.arguments : "";

      if (!id) return err("skill: missing required 'id'.");
      const skill = registry.getSkill(id);
      if (!skill) {
        return err(
          `Unknown skill '${id}'. Run load-skills to see the catalog. Available: ${registry
            .list()
            .map((s) => s.id)
            .join(", ") || "none"}.`
        );
      }
      if (!skill.modelInvokable && !userApproved) {
        return err(
          `Skill '${id}' requires an approved user request and cannot be invoked on its own. ` +
            "Call with user_approved: true only when the user explicitly asked for it."
        );
      }

      const header = [
        `# Skill: ${skill.meta.name ?? skill.id}`,
        `id: ${skill.id}`,
        skill.meta.version ? `version: ${skill.meta.version}` : null,
        skill.meta.license ? `license: ${skill.meta.license}` : null,
        `model-invokable: ${skill.modelInvokable ? "yes" : "no"}`,
        `entry: ${path.basename(skill.entryFile)}`,
        "",
        "## Instructions",
        "",
      ]
        .filter((s) => s !== null)
        .join("\n");
      const body = skill.body.length > MAX_BODY_CHARS ? skill.body.slice(0, MAX_BODY_CHARS) + "\n...[truncated]..." : skill.body;
      const trailer = [
        "",
        "## In this skill directory",
        "",
        "Use list-skill-files to see supporting files, and read-skill-file for any referenced in the instructions.",
      ].join("\n");
      return block(raw ? `${header}${body}\n\nUser request arguments: ${raw}\n${trailer}` : `${header}${body}\n${trailer}`);
    },
  };
}

export function listSkillFilesTool(registry: SkillRegistry): {
  def: ToolDef;
  handler: Handler;
} {
  return {
    def: {
      name: "list-skill-files",
      description: [
        "List every file inside a skill's directory (references, scripts, templates,",
        "assets). Returns paths relative to the skill root so read-skill-file can fetch them.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Skill id." } },
        required: ["id"],
      },
    },
    handler: async (args: Record<string, Json>) => {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) return err("list-skill-files: missing required 'id'.");
      const res = registry.listFiles(id);
      if (!res.ok) return err(res.error ?? "Unknown skill.");
      return block(`Files for skill '${id}':\n\n${res.files?.join("\n") ?? ""}`);
    },
  };
}

export function readSkillFileTool(registry: SkillRegistry): {
  def: ToolDef;
  handler: Handler;
} {
  return {
    def: {
      name: "read-skill-file",
      description: [
        "Read one file from a skill directory. Path is relative to that skill's root,",
        "e.g. references/api.md or scripts/run.sh. Rejects writes and traversal outside",
        "the skill directory. Returns the file contents or a path listing for directories.",
      ].join(" "),
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Skill id." },
          path: { type: "string", description: "Relative path within the skill directory." },
        },
        required: ["id", "path"],
      },
    },
    handler: async (args: Record<string, Json>) => {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      const rel = typeof args.path === "string" ? args.path.trim() : "";
      if (!id || !rel) return err("read-skill-file: required 'id' and 'path'.");
      const skill = registry.getSkill(id);
      if (!skill) return err(`Unknown skill '${id}'.`);

      const target = path.resolve(skill.dir, rel);
      if (target !== skill.dir && !target.startsWith(skill.dir + path.sep)) {
        return err("read-skill-file: path escapes the skill directory.");
      }
      if (!fs.existsSync(target)) {
        return err(`No such path in skill '${id}': ${rel}`);
      }
      const st = fs.statSync(target);
      if (st.isDirectory()) {
        const files = fs
          .readdirSync(target, { withFileTypes: true })
          .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
          .sort();
        return block(`Directory '${rel}' in skill '${id}':\n\n${files.join("\n") || "(empty)"}`);
      }
      if (st.size > 200_000) {
        return block(`File '${rel}' is ${st.size} bytes; too large to read in full. Read a section instead.`);
      }
      let content: string;
      try {
        content = fs.readFileSync(target, "utf8");
      } catch {
        return err(`Could not read '${rel}' (binary or unreadable).`);
      }
      return block(`File: ${rel} (${skill.id})\n\n${content}`);
    },
  };
}