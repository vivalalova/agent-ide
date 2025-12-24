# TypeScript CLI E2E Tests

此目錄包含所有 TypeScript/JavaScript 專案的 CLI 命令端對端測試。

## 測試分類邏輯

### 命名規範

```
cli-<command>[-<category>].e2e.test.ts
```

- `<command>`: CLI 命令名稱（rename、move、deadcode 等）
- `<category>`: 可選的測試分類（basic、bugs、coverage 等）

### 測試檔案組織

| 命令 | 測試檔案 | 說明 |
|-----|---------|------|
| **rename** | `cli-rename.e2e.test.ts` | 基本重命名功能 |
| | `cli-rename-at-param.e2e.test.ts` | `--at` 參數消歧義功能 |
| | `cli-rename-conflict-detection.e2e.test.ts` | 衝突檢測（保留字、無效識別符） |
| | `cli-rename-cross-file.e2e.test.ts` | 跨檔案引用更新 |
| | `cli-rename-edge-cases.e2e.test.ts` | 邊界條件與錯誤處理 |
| | `cli-rename-symbol-types.e2e.test.ts` | 各種符號類型支援 |
| | `cli-rename-validation.e2e.test.ts` | 輸入驗證 |
| **move** | `cli-move-basic.e2e.test.ts` | 基本檔案移動功能 |
| | `cli-move-bugs.e2e.test.ts` | Bug 修復測試 |
| | `cli-move-extreme.e2e.test.ts` | 極端情況測試 |
| **move-member** | `cli-move-member.e2e.test.ts` | 成員移動功能 |
| | `cli-move-member-bugs.e2e.test.ts` | Bug 修復測試 |
| **deadcode** | `cli-deadcode.e2e.test.ts` | Dead code 檢測 |
| | `cli-deadcode-autofix.e2e.test.ts` | 自動修復功能 |
| **cycles** | `cli-cycles.e2e.test.ts` | 循環依賴檢測 |
| | `cli-cycles-coverage.e2e.test.ts` | 覆蓋率補充測試 |
| **impact** | `cli-impact.e2e.test.ts` | 影響分析 |
| | `cli-impact-path-alias.e2e.test.ts` | 路徑別名支援 |
| **snapshot** | `cli-snapshot.e2e.test.ts` | 模組快照 |
| | `cli-snapshot-incremental.e2e.test.ts` | 增量更新 |
| | `cli-snapshot-coverage.e2e.test.ts` | 覆蓋率補充測試 |
| **其他** | `cli-call-hierarchy.e2e.test.ts` | 呼叫層次分析 |
| | `cli-change-signature.e2e.test.ts` | 參數簽名重構 |
| | `cli-find-references.e2e.test.ts` | 符號引用查找 |

## 測試模式

所有測試使用 `memfs` 記憶體檔案系統進行隔離：

```typescript
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI <command>', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('測試案例', async () => {
    const result = await executeCLI(
      ['<command>', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);
  });
});
```

## 執行測試

```bash
# 執行所有 E2E 測試
pnpm test:e2e

# 執行特定命令的測試
pnpm test:e2e -- --run tests/e2e/commands/typescript/cli-rename*.e2e.test.ts

# 執行單一測試檔案
pnpm test:e2e -- --run tests/e2e/commands/typescript/cli-rename.e2e.test.ts
```
