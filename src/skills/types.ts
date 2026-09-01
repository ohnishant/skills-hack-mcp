export interface SkillMeta {
  name: string;
  description: string;
  when_to_use?: string;
  version?: string;
  license?: string;
  author?: string;
  compatibility?: string | string[];
  metadata?: Record<string, unknown>;
  allowed_tools?: string | string[];
  argument_hint?: string;
  arguments?: string;
  disable_model_invocation?: boolean;
  user_invocable?: boolean;
  model?: string;
  effort?: string;
  context?: string;
  agent?: string;
  shell?: string;
  paths?: string | string[];
  [key: string]: unknown;
}

export interface Skill {
  /** Kebab-case id: derived from the directory name, falling back to frontmatter name. */
  id: string;
  /** Absolute path to the skill directory. */
  dir: string;
  /** Absolute path to this skill's SKILL.md (or other entry markdown file). */
  entryFile: string;
  /** Parsed frontmatter, normalized. */
  meta: SkillMeta;
  /** Raw frontmatter text (unused at runtime; kept for tooling). */
  frontmatter: string;
  /** Full body markdown (instructions) from the entry file, without frontmatter. */
  body: string;
  /** Whether the model is allowed to auto-invoke this skill. */
  modelInvokable: boolean;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  when_to_use?: string;
  argument_hint?: string;
  model_invokable: boolean;
  version?: string;
}
