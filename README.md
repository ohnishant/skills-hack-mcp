# skills-mcp

MCP server that exposes Claude Code style skills (SKILL.md folders) in any harness
that supports MCP but not skills. Load the skill catalog, invoke a skill by id, and
read its files, all through four small tools.

## What it does

- `load-skills` must be called once at the start of a session. It returns the catalog
  of every registered skill (name, description, model-invokable flag, when_to_use)
  and the exact rules for invoking them.
- `skill` loads one skill's full instructions by id. Skills marked
  `disable_model_invocation: true` require `user_approved: true`, the MCP analogue of
  user-only invocation.
- `list-skill-files` lists the files a skill directory ships.
- `read-skill-file` reads one file inside a skill directory (references/, scripts/,
  templates/), rejecting paths that escape the skill root.

The server parses SKILL.md exactly as Claude Code does: YAML frontmatter between
`---` markers, with the full community field set passing through untouched
(`name`, `description`, `when_to_use`, `version`, `license`, `author`,
`allowed_tools`, `argument_hint`, `arguments`, `disable_model_invocation`,
`user_invocable`, `model`, `effort`, `context`, `agent`, `shell`, `paths`,
`compatibility`, `metadata`).

Only the four tools are registered, so the model sees a small, stable tool surface.
The catalog loads skill frontmatter at session start; skill bodies load on demand
when a skill is invoked.

## Build

```
npm install
npm run build
```

`dist/index.cjs` is a single self-contained CommonJS bundle (esbuild), startable with
`node dist/index.cjs` or directly via its shebang. It has no runtime dependencies, so
the file alone is the whole server. Pass it to any MCP-capable harness.

## Run

The server reads skills from a directory resolved in this order:

1. `--skills <dir>` argument
2. `SKILLS_MCP_DIR` environment variable
3. `<cwd>/skills`

```
node dist/index.cjs --skills /central/path/to/skills
```

Claude Desktop example:

```json
{
  "mcpServers": {
    "skills": {
      "command": "node",
      "args": ["/home/you/skills-mcp/dist/index.cjs", "--skills", "/central/path/to/skills"]
    }
  }
}
```

### Skills directory layout

Any of:

- `~/.claude/skills/<skill-name>/SKILL.md` (personal)
- `<project>/.claude/skills/<skill-name>/SKILL.md` (shared)
- any folder you point `--skills` at, as long as each skill lives in its own
  subdirectory with a `SKILL.md` entry file.

A skill without a `SKILL.md` falls back to the first `*.md` in its directory.

## Invoking skills

MCP has no user/model sender distinction, so `disable_model_invocation` maps to a
gate on the `skill` tool: a matching skill returns an error unless the model passes
`user_approved: true`. That flag must come from an explicit user request, per the
instructions returned by `load-skills`.

## Development

- `npm run typecheck` (tsc --noEmit)
- `npm run build` (esbuild -> dist/index.cjs)
- `npm test` (test/client.mjs, an end-to-end stdio session against the built bundle)

## Releases

`.github/workflows/release.yml` builds on a `v*` tag push, runs typecheck, build,
and test, then packages `dist/index.cjs` as `skills-mcp-<tag>.cjs` plus a `.cjs.gz`
and `SHA256SUMS.txt`, and attaches them to a release.

Push a tag to release:

```
git tag v1.0.0 && git push origin v1.0.0
```

It can also run manually (Actions -> release -> Run workflow), optionally passing a
tag name; otherwise it derives one from `package.json` and creates the release at
the current commit.

Tag pushes skip packaging and release steps when nothing meaningful changed since
the previous release. GitHub ignores `paths` filters for tag pushes, so this is a
diff inside the job against the prior tag. Meaningful paths: `src/`, `skills/`,
`package.json`, `package-lock.json`, `tsconfig.json`, and the workflow itself.
Manual runs always release.

Source lives in `src/`:

- `src/mcp/protocol.ts` minimal spec-correct MCP stdio server (JSON-RPC framing,
  initialize, ping, tools/list, tools/call)
- `src/skills/frontmatter.ts` SKILL.md frontmatter + body splitting, YAML via the
  `yaml` package
- `src/skills/registry.ts` directory discovery with mtime-based cache
- `src/skills/types.ts` Skill/SkillMeta model
- `src/tools/index.ts` the four tool definitions and handlers
- `src/index.ts` entry point and skills-dir resolution