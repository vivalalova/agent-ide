/**
 * MCP Server 實作
 * 提供 stdio-based MCP Server，讓 Claude Code 等 AI 工具可以透過 MCP 協議連接
 */
export declare class MCPServer {
    private mcp;
    private tools;
    constructor();
    /**
     * 啟動 MCP Server (stdio mode)
     */
    start(): Promise<void>;
    /**
     * 處理收到的訊息
     */
    private handleMessage;
    /**
     * 處理 JSON-RPC 請求
     */
    private handleRequest;
    /**
     * 發送 JSON-RPC 回應
     */
    private sendResponse;
    /**
     * 發送錯誤回應
     */
    private sendError;
    /**
     * 發送通知
     */
    private sendNotification;
}
//# sourceMappingURL=mcp-server.d.ts.map