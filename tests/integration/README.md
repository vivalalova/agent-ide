# 整合测试 (Integration Tests)

本目录包含 Agent IDE 项目的整合测试，用于测试多个模块之间的协作。

## 测试文件

### 1. IndexEngine + ParserRegistry 整合测试
**文件**: `indexing-parser.integration.test.ts`
**测试用例数**: 7 个（1 个跳过）
**测试内容**:
- 成功註冊多個解析器並索引不同類型的檔案
- 正確解析 TypeScript 檔案並提取符號
- 正確解析 JavaScript 檔案並提取符號
- 正確處理混合語言專案的索引
- 正確處理解析器的錯誤情況
- 支援動態更新檔案索引

### 2. RenameEngine + IndexEngine 整合测试
**文件**: `rename-indexing.integration.test.ts`
**测试用例数**: 7 个
**测试内容**:
- 在重命名後正確更新索引
- 支援跨檔案重命名並更新索引
- 正確處理類別成員的重命名
- 支援重命名預覽並驗證索引中的符號
- 檢測和報告重命名衝突
- 支援批次重命名並更新多個檔案的索引
- 在重命名後保持索引的一致性

### 3. 完整工作流整合测试
**文件**: `full-workflow.integration.test.ts`
**测试用例数**: 6 个
**测试内容**:
- 完整的索引 → 搜尋 → 重命名工作流
- 索引 → 依賴分析 → 影響範圍評估工作流
- 索引 → 品質分析 → 重構建議工作流
- 多模組協作的端到端場景
- 處理大規模專案的完整工作流（20 個檔案）
- 錯誤恢復和一致性維護

## 运行测试

### 运行所有整合测试
```bash
pnpm test:integration
```

或使用 vitest 直接运行：
```bash
NODE_OPTIONS='--expose-gc --max-old-space-size=4096' npx vitest run --config vitest.integration.config.ts
```

### 运行特定测试文件
```bash
NODE_OPTIONS='--expose-gc --max-old-space-size=4096' npx vitest run --config vitest.integration.config.ts tests/integration/indexing-parser.integration.test.ts
```

### 运行测试并查看覆盖率
```bash
NODE_OPTIONS='--expose-gc --max-old-space-size=4096' npx vitest run --config vitest.integration.config.ts --coverage
```

## 测试配置

整合测试使用独立的配置文件 `vitest.integration.config.ts`，配置特点：
- **超时设置**: 60 秒（比单元测试更长）
- **并发数**: 2-3（整合测试较重）
- **真实文件系统**: 使用临时目录进行真实的文件操作
- **环境隔离**: 每个测试都有独立的 beforeEach/afterEach 清理

## 测试统计

- **总测试文件**: 3 个
- **总测试用例**: 20 个（19 个通过，1 个跳过）
- **测试覆盖模块**:
  - IndexEngine（索引引擎）
  - ParserRegistry（解析器注册表）
  - RenameEngine（重命名引擎）
  - DependencyGraph（依赖图）
  - MaintainabilityIndex（可维护性指数）

## 注意事项

1. **Swift 测试跳过**: Swift parser 在测试环境中不可用，相关测试已跳过
2. **临时目录清理**: 所有测试使用临时目录，测试结束后自动清理
3. **内存管理**: 使用 `vi.clearAllMocks()` 和 `ParserRegistry.resetInstance()` 确保测试隔离
4. **真实操作**: 这些测试使用真实的文件系统操作，不使用 mock

## 添加新的整合测试

1. 创建新的测试文件：`tests/integration/your-test.integration.test.ts`
2. 使用以下模板：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Your Integration Test', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'agent-ide-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should test something', async () => {
    // Your test here
  });
});
```

3. 确保测试文件名以 `.integration.test.ts` 结尾
4. 运行测试验证
