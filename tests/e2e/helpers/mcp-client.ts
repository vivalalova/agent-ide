/**
 * MCP 測試客戶端
 * 模擬 MCP 協議的通訊，提供完整的 MCP 工具測試功能
 */

import { AgentIdeMCP, MCPTool, MCPResult } from '@interfaces/mcp/mcp';
import { ParserRegistry } from '@infrastructure/parser/registry';
import { registerTestParsers } from '../../test-utils/test-parsers';
import { reportMemoryUsage, withTimeout } from '../setup';

/**
 * MCP 調用選項
 */
export interface MCPCallOptions {
  timeout?: number;
  validateInput?: boolean;
  silent?: boolean;
}

/**
 * MCP 調用結果
 */
export interface MCPCallResult extends MCPResult {
  toolName: string;
  parameters: any;
  duration: number;
  validationErrors?: string[];
}

/**
 * MCP 連接狀態
 */
export enum MCPConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * MCP 測試客戶端
 * 提供完整的 MCP 協議模擬和測試功能
 */
export class MCPClient {
  private mcp: AgentIdeMCP;
  private connectionState: MCPConnectionState = MCPConnectionState.DISCONNECTED;
  private testName: string = '';
  private callHistory: MCPCallResult[] = [];

  /**
   * 初始化 MCP 測試客戶端
   */
  constructor(testName?: string) {
    this.testName = testName || 'mcp-test';
    this.mcp = new AgentIdeMCP();
  }

  /**
   * 建立 MCP 連接（模擬）
   */
  async connect(): Promise<void> {
    if (this.connectionState === MCPConnectionState.CONNECTED) {
      return;
    }

    this.connectionState = MCPConnectionState.CONNECTING;

    try {
      // 初始化 Parser 註冊表
      ParserRegistry.resetInstance();
      registerTestParsers();

      this.connectionState = MCPConnectionState.CONNECTED;
    } catch (error) {
      this.connectionState = MCPConnectionState.ERROR;
      throw new Error(`MCP 連接失敗: ${error}`);
    }
  }

  /**
   * 中斷 MCP 連接
   */
  async disconnect(): Promise<void> {
    if (this.connectionState === MCPConnectionState.DISCONNECTED) {
      return;
    }

    try {
      // 清理 Parser 註冊表
      const registry = ParserRegistry.getInstance();
      await registry.dispose();
    } catch (error) {
      // 忽略清理錯誤
    }

    ParserRegistry.resetInstance();
    this.connectionState = MCPConnectionState.DISCONNECTED;
    this.callHistory = [];
  }

  /**
   * 檢查連接狀態
   */
  isConnected(): boolean {
    return this.connectionState === MCPConnectionState.CONNECTED;
  }

  /**
   * 獲取連接狀態
   */
  getConnectionState(): MCPConnectionState {
    return this.connectionState;
  }

  /**
   * 獲取所有可用的 MCP 工具
   */
  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();
    return this.mcp.getTools();
  }

  /**
   * 獲取特定工具的定義
   */
  async getTool(toolName: string): Promise<MCPTool | null> {
    const tools = await this.listTools();
    return tools.find(tool => tool.name === toolName) || null;
  }

  /**
   * 調用 MCP 工具
   */
  async callTool(
    toolName: string,
    parameters: any,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult> {
    this.ensureConnected();

    const startTime = Date.now();
    const timeout = options.timeout || 30000;

    // 驗證工具存在
    const tool = await this.getTool(toolName);
    if (!tool) {
      throw new Error(`工具不存在: ${toolName}`);
    }

    // 驗證參數（如果啟用）
    const validationErrors: string[] = [];
    if (options.validateInput !== false) {
      const errors = this.validateParameters(tool, parameters);
      validationErrors.push(...errors);
    }

    const executeCall = async (): Promise<MCPCallResult> => {
      let result: MCPResult;

      try {
        result = await this.mcp.executeTool(toolName, parameters);
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }

      const duration = Date.now() - startTime;
      const callResult: MCPCallResult = {
        ...result,
        toolName,
        parameters,
        duration,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined
      };

      // 記錄調用歷史
      this.callHistory.push(callResult);

      // 報告記憶體使用情況
      if (!options.silent) {
        reportMemoryUsage(`MCP ${this.testName}: ${toolName}`);
      }

      return callResult;
    };

    // 執行調用（帶超時控制）
    return await withTimeout(
      executeCall(),
      timeout,
      `MCP-${this.testName}-${toolName}`
    );
  }

  /**
   * 調用工具並驗證成功
   */
  async callToolExpectSuccess(
    toolName: string,
    parameters: any,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult> {
    const result = await this.callTool(toolName, parameters, options);

    if (!result.success) {
      throw new Error(
        `MCP 工具調用失敗:\n` +
        `工具: ${toolName}\n` +
        `參數: ${JSON.stringify(parameters, null, 2)}\n` +
        `錯誤: ${result.error}\n` +
        `驗證錯誤: ${result.validationErrors?.join(', ') || '無'}`
      );
    }

    return result;
  }

  /**
   * 調用工具並驗證失敗
   */
  async callToolExpectFailure(
    toolName: string,
    parameters: any,
    expectedError?: string,
    options: MCPCallOptions = {}
  ): Promise<MCPCallResult> {
    const result = await this.callTool(toolName, parameters, options);

    if (result.success) {
      throw new Error(
        `MCP 工具調用預期失敗但成功了:\n` +
        `工具: ${toolName}\n` +
        `參數: ${JSON.stringify(parameters, null, 2)}\n` +
        `結果: ${JSON.stringify(result.data, null, 2)}`
      );
    }

    if (expectedError && !result.error?.includes(expectedError)) {
      throw new Error(
        `MCP 工具錯誤訊息不符預期:\n` +
        `工具: ${toolName}\n` +
        `預期錯誤: ${expectedError}\n` +
        `實際錯誤: ${result.error}`
      );
    }

    return result;
  }

  /**
   * 驗證工具參數
   */
  private validateParameters(tool: MCPTool, parameters: any): string[] {
    const errors: string[] = [];
    const schema = tool.parameters;

    if (schema.type !== 'object') {
      return errors; // 只支援 object 型別驗證
    }

    // 檢查必要參數
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in parameters)) {
          errors.push(`缺少必要參數: ${requiredParam}`);
        }
      }
    }

    // 檢查參數型別
    const properties = schema.properties || {};
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) {
        errors.push(`未知參數: ${paramName}`);
        continue;
      }

      const validationError = this.validateParameterValue(
        paramName,
        paramValue,
        paramSchema
      );
      if (validationError) {
        errors.push(validationError);
      }
    }

    return errors;
  }

  /**
   * 驗證單個參數值
   */
  private validateParameterValue(
    paramName: string,
    value: any,
    schema: any
  ): string | null {
    const type = schema.type;

    if (type === 'string' && typeof value !== 'string') {
      return `參數 ${paramName} 應為字串，實際為 ${typeof value}`;
    }

    if (type === 'number' && typeof value !== 'number') {
      return `參數 ${paramName} 應為數字，實際為 ${typeof value}`;
    }

    if (type === 'boolean' && typeof value !== 'boolean') {
      return `參數 ${paramName} 應為布林值，實際為 ${typeof value}`;
    }

    if (type === 'array' && !Array.isArray(value)) {
      return `參數 ${paramName} 應為陣列，實際為 ${typeof value}`;
    }

    // 檢查 enum 限制
    if (schema.enum && !schema.enum.includes(value)) {
      return `參數 ${paramName} 的值 "${value}" 不在允許的選項中: ${schema.enum.join(', ')}`;
    }

    return null;
  }

  /**
   * 確保已連接
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error('MCP 客戶端未連接，請先調用 connect()');
    }
  }

  /**
   * 獲取調用歷史
   */
  getCallHistory(): MCPCallResult[] {
    return [...this.callHistory];
  }

  /**
   * 清除調用歷史
   */
  clearCallHistory(): void {
    this.callHistory = [];
  }

  /**
   * 獲取最後一次調用結果
   */
  getLastCall(): MCPCallResult | null {
    return this.callHistory.length > 0
      ? this.callHistory[this.callHistory.length - 1]
      : null;
  }

  /**
   * 統計調用結果
   */
  getCallStatistics(): {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
    toolUsage: Record<string, number>;
  } {
    const total = this.callHistory.length;
    const successful = this.callHistory.filter(call => call.success).length;
    const failed = total - successful;
    const averageDuration = total > 0
      ? Math.round(this.callHistory.reduce((sum, call) => sum + call.duration, 0) / total)
      : 0;

    const toolUsage: Record<string, number> = {};
    for (const call of this.callHistory) {
      toolUsage[call.toolName] = (toolUsage[call.toolName] || 0) + 1;
    }

    return {
      total,
      successful,
      failed,
      averageDuration,
      toolUsage
    };
  }

  /**
   * 驗證工具響應資料結構
   */
  validateResponseData(result: MCPCallResult, expectedFields: string[]): void {
    if (!result.success) {
      throw new Error(`調用失敗，無法驗證響應資料: ${result.error}`);
    }

    if (!result.data) {
      throw new Error('響應資料為空');
    }

    for (const field of expectedFields) {
      if (!(field in result.data)) {
        throw new Error(`響應資料缺少預期欄位: ${field}`);
      }
    }
  }

  /**
   * 取得測試名稱
   */
  getTestName(): string {
    return this.testName;
  }
}