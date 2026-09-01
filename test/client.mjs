import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.cjs"], {
  cwd: "/home/nish/Projects/skills-mcp",
  stdio: ["pipe", "pipe", "pipe"],
});

child.stderr.on("data", (d) => {
  process.stderr.write("[stderr] " + d.toString());
});

const lines = [];
let onLine = null;
child.stdout.on("data", (d) => {
  const text = d.toString();
  for (const line of text.split("\n")) {
    if (line.trim()) {
      lines.push(line.trim());
    }
  }
  if (onLine) {
    const f = onLine;
    onLine = null;
    f();
  }
});

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

function recv() {
  return new Promise((resolve) => {
    if (lines.length > 0) {
      resolve(lines.shift());
      return;
    }
    onLine = () => resolve(lines.shift());
  });
}

async function main() {
  console.log("sending initialize...");
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const initResp = JSON.parse(await recv());
  console.log("initialize:", JSON.stringify(initResp).slice(0, 200));

  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  await new Promise((r) => setTimeout(r, 50));

  console.log("listing tools...");
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const toolsResp = JSON.parse(await recv());
  console.log("tools:", JSON.stringify(toolsResp).slice(0, 600));

  console.log("calling load-skills...");
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "load-skills", arguments: { why: "demo" } } });
  const loadResp = JSON.parse(await recv());
  console.log("load-skills result:\n", JSON.stringify(loadResp.result?.content?.[0]?.text ?? loadResp.error));

  console.log("calling skill (example-skill)...");
  send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "skill", arguments: { id: "example-skill", user_approved: true } } });
  const skillResp = JSON.parse(await recv());
  console.log("skill result:\n", JSON.stringify(skillResp.result?.content?.[0]?.text ?? skillResp.error));

  console.log("listing skill files...");
  send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "list-skill-files", arguments: { id: "example-skill" } } });
  const filesResp = JSON.parse(await recv());
  console.log("list-skill-files result:\n", JSON.stringify(filesResp.result?.content?.[0]?.text));

  console.log("reading sample reference...");
  send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "read-skill-file", arguments: { id: "example-skill", path: "references/sample.md" } } });
  const fileResp = JSON.parse(await recv());
  console.log("read-skill-file result:\n", JSON.stringify(fileResp.result?.content?.[0]?.text));

  console.log("testing escape (traversal)...");
  send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read-skill-file", arguments: { id: "example-skill", path: "../secret.txt" } } });
  const escResp = JSON.parse(await recv());
  console.log("escape result:\n", JSON.stringify(escResp.result?.content?.[0]?.text));

  child.kill("SIGTERM");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
