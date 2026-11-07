/**
 * Type declarations for the dependency-free MandateGate MCP server
 * (mcp/mandategate-mcp.mjs). Kept loose on purpose: the server speaks raw
 * JSON-RPC 2.0 messages, so callers receive plain objects.
 */

export declare const PROTOCOL_VERSION: string;
export declare const SERVER_INFO: { name: string; version: string };

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export declare const TOOLS: McpToolDefinition[];

export interface MandategateServer {
  handleMessage(message: unknown): Promise<any>;
}

export declare function createMandategateServer(options?: {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): MandategateServer;

export declare function attachStdio(
  server: MandategateServer,
  streams?: {
    input?: import("node:stream").Readable;
    output?: import("node:stream").Writable;
  },
): unknown;
