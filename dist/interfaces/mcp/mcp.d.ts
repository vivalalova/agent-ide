/**
 * MCP (Model Context Protocol) 介面實作
 * 提供給 Claude Code 等 AI 工具使用的 MCP 工具
 */
export interface MCPTool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}
export interface MCPResult {
    success: boolean;
    data?: any;
    error?: string;
}
export declare class AgentIdeMCP {
    private indexEngine?;
    private dependencyAnalyzer?;
    private renameEngine?;
    private importResolver?;
    private parsersInitialized;
    constructor();
    /**
     * 初始化 Parser
     */
    private initializeParsers;
    /**
     * 獲取所有可用的 MCP 工具定義
     */
    getTools(): MCPTool[];
    /**
     * 執行 MCP 工具
     */
    executeTool(toolName: string, parameters: any): Promise<MCPResult>;
    private handleCodeIndex;
    private handleCodeRename;
    private handleCodeMove;
    private handleCodeSearch;
    private handleCodeAnalyze;
    private formatAnalysisSummary;
    private handleCodeDeps;
    private formatDependencySummary;
    /**
     * 格式化相對路徑
     */
    private formatRelativePath;
    private handleParserPlugins;
}
//# sourceMappingURL=mcp.d.ts.map