export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface McpToolInputSchema {
  type: "object";
  properties: Record<string, Json>;
  required?: string[];
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type Handler = (args: Record<string, Json>) => Promise<ToolResult> | ToolResult;

const PROTOCOL_VERSION = "2024-11-05";

export class McpServer {
  private tools: Map<string, { def: McpTool; handler: Handler }> = new Map();
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  registerTool(def: McpTool, handler: Handler): void {
    this.tools.set(def.name, { def, handler });
  }

  async connect(): Promise<void> {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let buffer: Buffer = Buffer.alloc(0);

    stdin.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = this.processFrames(stdout, buffer);
    });

    stdin.on("end", () => {
      process.exit(0);
    });
  }

  private processFrames(stdout: NodeJS.WriteStream, buffer: Buffer): Buffer {
    let rest: Buffer = buffer;
    let parsed: boolean;
    do {
      parsed = false;
      const idx = rest.indexOf("\n");
      if (idx === -1) break;
      const line = rest.subarray(0, idx).toString().trim();
      rest = rest.subarray(idx + 1);
      if (line === "") continue;
      if (!line.startsWith("{")) continue;
      try {
        const msg = JSON.parse(line);
        this.handleMessage(stdout, msg);
        parsed = true;
      } catch {
        // Malformed frame; drop it and keep going.
      }
    } while (parsed);
    return rest;
  }

  private async handleMessage(stdout: NodeJS.WriteStream, msg: any): Promise<void> {
    const { id, method, params } = msg || {};

    if (msg && msg.method && !("id" in msg)) {
      // Notification; nothing to reply.
      if (method === "notifications/initialized") {
        // No-op: we are stateless.
      }
      return;
    }

    if (id !== undefined && method === undefined) {
      this.respond(stdout, id, null, {
        code: -32600,
        message: "Invalid Request",
      });
      return;
    }

    try {
      switch (method) {
        case "initialize":
          this.respond(stdout, id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "skills-mcp", version: "1.0.0" },
          });
          break;
        case "ping":
          this.respond(stdout, id, {});
          break;
        case "tools/list":
          this.respond(stdout, id, {
            tools: [...this.tools.values()].map((t) => t.def),
          } as unknown as Json);
          break;
        case "tools/call": {
          const name = params?.name;
          const args = params?.arguments ?? {};
          const tool = this.tools.get(name);
          if (!tool) {
            throw new McpError(-32602, `Unknown tool: ${name}`);
          }
          const result = await tool.handler(normalizeArgs(args));
          this.respond(stdout, id, result);
          break;
        }
        default:
          throw new McpError(-32601, `Method not found: ${method}`);
      }
    } catch (err) {
      if (err instanceof McpError) {
        this.respond(stdout, id, null, { code: err.code, message: err.message });
      } else {
        this.respond(stdout, id, null, {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private respond(
    stdout: NodeJS.WriteStream,
    id: any,
    result: Json | null,
    error?: { code: number; message: string }
  ): void {
    const body: Json = { jsonrpc: "2.0", id };
    if (error) body.error = error;
    else body.result = result;
    stdout.write(this.encoder.encode(JSON.stringify(body) + "\n"));
  }
}

class McpError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function normalizeArgs(args: any): Record<string, Json> {
  if (args && typeof args === "object" && !Array.isArray(args)) return args;
  return {};
}
