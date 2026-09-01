import * as path from "node:path";
import { McpServer } from "./mcp/protocol.js";
import { SkillRegistry } from "./skills/registry.js";
import { loadSkillsTool, useSkillTool, listSkillFilesTool, readSkillFileTool } from "./tools/index.js";

function resolveSkillsDir(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skills") {
      const v = argv[i + 1];
      if (v) return path.resolve(v);
    }
    if (a?.startsWith("--skills=")) return path.resolve(a.slice("--skills=".length));
  }
  const env = process.env.SKILLS_MCP_DIR;
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), "skills");
}

async function main(): Promise<void> {
  const skillsDir = resolveSkillsDir(process.argv.slice(2));
  const registry = new SkillRegistry(skillsDir);

  const server = new McpServer();

  const loadSkills = loadSkillsTool(registry);
  const useSkill = useSkillTool(registry);
  const listFiles = listSkillFilesTool(registry);
  const readFile = readSkillFileTool(registry);

  server.registerTool(loadSkills.def, loadSkills.handler);
  server.registerTool(useSkill.def, useSkill.handler);
  server.registerTool(listFiles.def, listFiles.handler);
  server.registerTool(readFile.def, readFile.handler);

  await server.connect();
}

main().catch((err) => {
  process.stderr.write(`[skills-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});