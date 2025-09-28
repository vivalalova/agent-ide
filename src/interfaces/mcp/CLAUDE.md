# MCP 介面模組開發規範

## 實作狀態 ✅

### 實際檔案結構
```
mcp/
├── index.ts                    ✅ MCP 入口
├── mcp.ts                      ✅ MCP 伺服器實作
└── 其他協定模組              ⏳ 待實作
```

### 實作功能狀態
- ✅ MCP 協定基礎架構
- ✅ 基本 MCP 伺服器
- ⏳ 各功能模組工具
- ⏳ 資源處理器
- ⏳ 提示機制
- ⏳ 安全性功能
- ⏳ 進階協定支援

## 模組職責
實作 Model Context Protocol (MCP) 介面，讓 AI Agent 能夠透過標準化協定與系統互動，提供工具呼叫、資源存取和提示機制。

## 核心開發原則

### 1. 協定符合性
- **完全遵循 MCP 規範**：嚴格實作協定要求
- **版本相容**：支援協定版本協商
- **標準錯誤處理**：使用 JSON-RPC 錯誤碼
- **完整文檔**：所有工具和資源的詳細說明

### 2. 效能優化
- 非同步處理
- 連線池管理
- 請求批次處理
- 結果快取

### 3. 安全性
- 認證授權
- 輸入驗證
- 速率限制
- 資源隔離

### 4. 可擴展性
- 插件式工具架構
- 動態工具註冊
- 資源提供者抽象
- 中介軟體支援

### 5. 開發體驗
- 完整的型別定義
- 詳細的錯誤訊息
- 開發工具支援
- 測試友好設計

## 實作檔案

### 核心架構
```
mcp/
├── index.ts                 # MCP 入口
├── server/
│   ├── mcp-server.ts           # MCP 伺服器實作
│   ├── protocol-handler.ts     # 協定處理器
│   ├── connection-manager.ts   # 連線管理器
│   └── middleware.ts           # 中介軟體
├── tools/
│   ├── tool-registry.ts        # 工具註冊器
│   ├── code-tools.ts           # 程式碼工具
│   ├── index-tools.ts          # 索引工具
│   ├── search-tools.ts         # 搜尋工具
│   ├── rename-tools.ts         # 重新命名工具
│   └── move-tools.ts           # 移動工具
├── resources/
│   ├── resource-provider.ts    # 資源提供者
│   ├── file-resources.ts       # 檔案資源
│   └── index-resources.ts      # 索引資源
├── prompts/
│   ├── prompt-provider.ts      # 提示提供者
│   └── code-prompts.ts         # 程式碼提示
├── security/
│   ├── auth-handler.ts         # 認證處理器
│   ├── rate-limiter.ts         # 速率限制器
│   └── validator.ts            # 輸入驗證器
└── types.ts                 # 型別定義
```

## 主要功能介面

### MCP 伺服器介面
```typescript
interface MCPServer {
  // 生命週期
  start(config: MCPConfig): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;

  // 工具管理
  registerTool(tool: MCPTool): void;
  unregisterTool(name: string): void;
  listTools(): MCPTool[];

  // 資源管理
  registerResourceProvider(provider: ResourceProvider): void;
  unregisterResourceProvider(name: string): void;
  listResources(): ResourceInfo[];

  // 提示管理
  registerPromptProvider(provider: PromptProvider): void;
  unregisterPromptProvider(name: string): void;
  listPrompts(): PromptInfo[];

  // 事件處理
  on(event: 'request', handler: RequestHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
}
```

### 工具註冊器介面
```typescript
interface ToolRegistry {
  // 工具註冊
  register(tool: MCPTool): void;
  unregister(name: string): void;
  get(name: string): MCPTool | null;
  list(): MCPTool[];

  // 工具執行
  execute(name: string, params: any): Promise<ToolResult>;
  validate(name: string, params: any): ValidationResult;

  // 工具分組
  getByCategory(category: string): MCPTool[];
  getCategories(): string[];
}
```

### 程式碼工具介面
```typescript
interface CodeTools {
  // 索引工具
  'code_index': {
    name: 'code_index';
    description: '建立和查詢程式碼索引';
    parameters: {
      action: 'build' | 'query' | 'update';
      path?: string;
      pattern?: string;
      options?: IndexOptions;
    };
  };

  // 搜尋工具
  'code_search': {
    name: 'code_search';
    description: '搜尋程式碼內容和符號';
    parameters: {
      query: string;
      type: 'content' | 'symbol' | 'reference';
      scope?: string;
      options?: SearchOptions;
    };
  };

  // 重新命名工具
  'code_rename': {
    name: 'code_rename';
    description: '重新命名程式碼元素';
    parameters: {
      target: string;
      newName: string;
      type: 'symbol' | 'file' | 'directory';
      scope?: string;
    };
  };

  // 移動工具
  'code_move': {
    name: 'code_move';
    description: '移動檔案或程式碼元素';
    parameters: {
      source: string;
      destination: string;
      type: 'file' | 'directory' | 'symbol';
      updateReferences?: boolean;
    };
  };
}
```

### 資源提供者介面
```typescript
interface ResourceProvider {
  readonly name: string;
  readonly description: string;

  // 資源列舉
  listResources(): Promise<ResourceInfo[]>;
  getResource(uri: string): Promise<Resource | null>;

  // 資源訂閱
  subscribe(uri: string, callback: ResourceChangeCallback): Promise<void>;
  unsubscribe(uri: string): Promise<void>;

  // 資源驗證
  validateUri(uri: string): boolean;
  getSchema(uri: string): ResourceSchema | null;
}
```

### 提示提供者介面
```typescript
interface PromptProvider {
  readonly name: string;
  readonly description: string;

  // 提示列舉
  listPrompts(): Promise<PromptInfo[]>;
  getPrompt(name: string, params?: any): Promise<Prompt | null>;

  // 提示驗證
  validateParams(name: string, params: any): ValidationResult;
  getParamSchema(name: string): ParameterSchema | null;
}
```

### 認證處理器介面
```typescript
interface AuthHandler {
  // 認證檢查
  authenticate(credentials: Credentials): Promise<AuthResult>;
  authorize(user: User, resource: string, action: string): Promise<boolean>;

  // Token 管理
  generateToken(user: User): Promise<string>;
  validateToken(token: string): Promise<User | null>;
  revokeToken(token: string): Promise<void>;

  // 會話管理
  createSession(user: User): Promise<Session>;
  validateSession(sessionId: string): Promise<Session | null>;
  destroySession(sessionId: string): Promise<void>;
}
```

### 速率限制器介面
```typescript
interface RateLimiter {
  // 限制檢查
  checkLimit(key: string, limit: RateLimit): Promise<boolean>;
  getRemainingRequests(key: string): Promise<number>;
  getResetTime(key: string): Promise<Date>;

  // 限制設定
  setLimit(key: string, limit: RateLimit): Promise<void>;
  removeLimit(key: string): Promise<void>;

  // 統計資訊
  getStats(key: string): Promise<RateLimitStats>;
  getGlobalStats(): Promise<GlobalRateLimitStats>;
}
```

## 核心型別定義

### MCP 基本型別
```typescript
interface MCPConfig {
  port?: number;
  host?: string;
  transport: 'stdio' | 'http' | 'websocket';
  security?: SecurityConfig;
  logging?: LoggingConfig;
}

interface MCPTool {
  name: string;
  description: string;
  parameters: ParameterSchema;
  handler: ToolHandler;
  category?: string;
  tags?: string[];
}

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

type ToolHandler = (params: any) => Promise<ToolResult>;
```

### 資源型別
```typescript
interface ResourceInfo {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
  lastModified?: Date;
}

interface Resource {
  uri: string;
  content: string | Buffer;
  metadata: ResourceMetadata;
}

interface ResourceMetadata {
  mimeType: string;
  size: number;
  lastModified: Date;
  checksum?: string;
  encoding?: string;
}
```

### 提示型別
```typescript
interface PromptInfo {
  name: string;
  description: string;
  parameters?: ParameterSchema;
  examples?: PromptExample[];
}

interface Prompt {
  messages: PromptMessage[];
  metadata?: PromptMetadata;
}

interface PromptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  context?: any;
}
```

### 安全型別
```typescript
interface SecurityConfig {
  auth?: AuthConfig;
  rateLimit?: RateLimitConfig;
  cors?: CorsConfig;
  encryption?: EncryptionConfig;
}

interface AuthConfig {
  enabled: boolean;
  type: 'token' | 'session' | 'oauth';
  secret: string;
  expiration?: number;
}

interface RateLimit {
  requests: number;
  windowMs: number;
  keyGenerator?: (req: Request) => string;
}
```

### 錯誤型別
```typescript
interface MCPError extends Error {
  code: number;
  data?: any;
}

enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  TOOL_NOT_FOUND = -32001,
  TOOL_EXECUTION_ERROR = -32002,
  RESOURCE_NOT_FOUND = -32003,
  UNAUTHORIZED = -32004,
  RATE_LIMITED = -32005
}
```