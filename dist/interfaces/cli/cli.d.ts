/**
 * CLI 介面實作
 * 提供命令列介面來操作 Agent IDE 功能
 */
export declare class AgentIdeCLI {
    private program;
    private indexEngine?;
    private dependencyAnalyzer?;
    private renameEngine?;
    private importResolver?;
    private moveService?;
    private searchService?;
    constructor();
    /**
     * 執行 CLI 程式
     */
    run(argv: string[]): Promise<void>;
    private initializeParsers;
    private setupCommands;
    private setupIndexCommand;
    private setupRenameCommand;
    private setupRefactorCommand;
    private setupMoveCommand;
    private setupSearchCommand;
    private setupAnalyzeCommand;
    private setupDepsCommand;
    private setupPluginsCommand;
    private handleIndexCommand;
    private handleRenameCommand;
    private handleRefactorCommand;
    private handleMoveCommand;
    private handleSearchCommand;
    /**
     * 建構搜尋選項
     */
    private buildSearchOptions;
    /**
     * 格式化搜尋結果輸出
     */
    private formatSearchResults;
    /**
     * 格式化檔案路徑（顯示相對路徑）
     */
    private formatFilePath;
    /**
     * 高亮匹配內容
     */
    private highlightMatch;
    private handleAnalyzeCommand;
    private handleDepsCommand;
    /**
     * 從專案依賴資訊建立依賴圖
     */
    private buildGraphFromProjectDeps;
    private handlePluginsListCommand;
    private handlePluginInfoCommand;
    /**
     * 檢查檔案是否存在
     */
    private fileExists;
    /**
     * 套用程式碼編輯
     */
    private applyCodeEdit;
    /**
     * 獲取專案中的所有檔案
     */
    private getAllProjectFiles;
}
//# sourceMappingURL=cli.d.ts.map