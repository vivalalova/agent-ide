/**
 * MCP Server 實作
 * 提供 stdio-based MCP Server，讓 Claude Code 等 AI 工具可以透過 MCP 協議連接
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AgentIdeMCP, MCPTool } from './mcp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export class MCPServer {
  private mcp: AgentIdeMCP;
  private tools: MCPTool[];

  constructor() {
    this.mcp = new AgentIdeMCP();
    this.tools = this.mcp.getTools();
  }

  /**
   * 啟動 MCP Server (stdio mode)
   */
  async start(): Promise<void> {
    // 監聽 stdin
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data: string) => {
      await this.handleMessage(data);
    });

    // 處理錯誤
    process.on('uncaughtException', (error) => {
      this.sendError(null, -32603, `Internal error: ${error.message}`);
    });

    // 啟動訊息
    this.sendNotification('server/started', {
      name: 'agent-ide',
      version: VERSION
    });
  }

  /**
   * 處理收到的訊息
   */
  private async handleMessage(data: string): Promise<void> {
    try {
      const lines = data.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        const request: MCPRequest = JSON.parse(line);
        await this.handleRequest(request);
      }
    } catch (error) {
      this.sendError(null, -32700, 'Parse error');
    }
  }

  /**
   * 處理 JSON-RPC 請求
   */
  private async handleRequest(request: MCPRequest): Promise<void> {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'initialize':
          this.sendResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'agent-ide',
              version: VERSION
            }
          });
          break;

        case 'tools/list':
          this.sendResponse(id, {
            tools: this.tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.parameters
            }))
          });
          break;

        case 'tools/call':
          if (!params || !params.name) {
            this.sendError(id, -32602, 'Invalid params: missing tool name');
            return;
          }

          const result = await this.mcp.executeTool(params.name, params.arguments || {});

          if (result.success) {
            this.sendResponse(id, {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result.data, null, 2)
                }
              ]
            });
          } else {
            this.sendResponse(id, {
              content: [
                {
                  type: 'text',
                  text: `Error: ${result.error}`
                }
              ],
              isError: true
            });
          }
          break;

        case 'ping':
          this.sendResponse(id, {});
          break;

        default:
          this.sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      this.sendError(id, -32603, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 發送 JSON-RPC 回應
   */
  private sendResponse(id: string | number | null | undefined, result: any): void {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      result
    };

    process.stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * 發送錯誤回應
   */
  private sendError(id: string | number | null | undefined, code: number, message: string, data?: any): void {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code,
        message,
        data
      }
    };

    process.stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * 發送通知
   */
  private sendNotification(method: string, params?: any): void {
    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params
    };

    process.stdout.write(JSON.stringify(notification) + '\n');
  }
}
