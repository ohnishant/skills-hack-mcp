# Project notes for agents

## Verify before done

- Typecheck: `npm run typecheck`
- Build the dist bundle: `npm run build`
- End-to-end stdio test against the built bundle: `npm test`

The build outputs `dist/index.cjs`, a self-contained CommonJS bundle. Tests and
runtime run against that artifact, so rebuild after any source change.

## Scope

`src/mcp/protocol.ts` is a minimal hand-rolled MCP stdio server. Do not pull in the
official SDK unless it adds real value; the zero-dependency bundle is a deliberate
cold-start choice. `yaml` is the only runtime dep and is bundled in.

Skills are SKILL.md folders; the parser lives in `src/skills/frontmatter.ts` and
follows the Claude Code spec. `disable_model_invocation` is honored as a
`user_approved` gate on the `skill` tool, since MCP has no sender distinction.