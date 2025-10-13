# E2E 測試

## 測試架構

本專案的 E2E 測試使用 **真實複雜的 TypeScript 專案** 作為測試 fixture，確保測試涵蓋真實使用場景。

## Fixture 專案

### sample-project

位置：`tests/fixtures/sample-project/`

**專案規模**：
- 32 個 TypeScript 檔案
- 11 個目錄（5 層深度）
- 20+ 型別定義（interface, type, enum, class）
- 50+ 跨檔案引用關係

**專案結構**：
```
sample-project/
├── src/
│   ├── types/          # 核心型別定義
│   │   ├── user.ts
│   │   ├── product.ts
│   │   ├── order.ts
│   │   ├── api.ts
│   │   └── common.ts
│   ├── models/         # 資料模型（繼承 BaseModel）
│   │   ├── base-model.ts
│   │   ├── user-model.ts
│   │   ├── product-model.ts
│   │   └── order-model.ts
│   ├── services/       # 業務邏輯服務
│   │   ├── user-service.ts
│   │   ├── auth-service.ts
│   │   ├── product-service.ts
│   │   ├── order-service.ts
│   │   ├── notification-service.ts
│   │   └── payment-service.ts
│   ├── api/            # API 層
│   │   ├── handlers/
│   │   │   ├── user-handler.ts
│   │   │   └── product-handler.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── validator.ts
│   ├── controllers/    # 控制器層
│   │   ├── base-controller.ts
│   │   ├── user-controller.ts
│   │   ├── product-controller.ts
│   │   └── order-controller.ts
│   ├── utils/          # 工具函式
│   │   ├── formatter.ts
│   │   ├── validator.ts
│   │   ├── date-utils.ts
│   │   ├── string-utils.ts
│   │   └── array-utils.ts
│   ├── core/           # 核心配置
│   │   ├── config/
│   │   │   └── settings.ts
│   │   └── constants.ts
│   └── index.ts        # 主入口
├── package.json
└── tsconfig.json
```

**特點**：
- ✅ 真實的 4 層架構（Types → Models → Services → Controllers）
- ✅ 豐富的 TypeScript 特性（enum, interface, type, generic, extends）
- ✅ 跨檔案依賴關係複雜
- ✅ 包含業務邏輯和驗證
- ✅ 可編譯的完整專案

## 使用 Fixture

### 基本用法

```typescript
import { loadFixture } from './helpers/fixture-manager';

describe('測試範例', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('測試案例', async () => {
    // 使用 fixture
    const filePath = fixture.getFilePath('src/types/user.ts');
    // ... 執行測試
  });
});
```

### Fixture Manager API

#### `loadFixture(name: string): Promise<FixtureProject>`
載入並初始化 fixture 專案。

#### `getFilePath(relativePath: string): string`
取得檔案的絕對路徑。

```typescript
const userPath = fixture.getFilePath('src/types/user.ts');
```

#### `readFile(relativePath: string): Promise<string>`
讀取檔案內容。

```typescript
const content = await fixture.readFile('src/types/user.ts');
```

#### `writeFile(relativePath: string, content: string): Promise<void>`
寫入檔案（用於測試修改操作）。

```typescript
await fixture.writeFile('src/types/user.ts', newContent);
```

#### `fileExists(relativePath: string): Promise<boolean>`
檢查檔案是否存在。

```typescript
const exists = await fixture.fileExists('src/types/user.ts');
```

#### `getModifiedFiles(): Promise<string[]>`
取得所有被修改過的檔案路徑。

```typescript
const modified = await fixture.getModifiedFiles();
expect(modified).toContain('src/types/user.ts');
```

#### `assertFileContains(relativePath: string, text: string): Promise<boolean>`
驗證檔案包含特定文字。

```typescript
const hasUser = await fixture.assertFileContains('src/types/user.ts', 'interface User');
expect(hasUser).toBe(true);
```

#### `assertFileNotContains(relativePath: string, text: string): Promise<boolean>`
驗證檔案不包含特定文字。

```typescript
const noOldName = await fixture.assertFileNotContains('src/types/user.ts', 'OldName');
expect(noOldName).toBe(true);
```

#### `reset(): Promise<void>`
重置到初始狀態。

```typescript
await fixture.reset();
```

#### `cleanup(): Promise<void>`
清理臨時檔案。

```typescript
await fixture.cleanup();
```

## 測試範例

### Index 測試

```typescript
it('應該索引整個專案並提取所有符號', async () => {
  const fixture = await loadFixture('sample-project');

  const result = await indexProject(fixture.tempPath);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('索引完成');
  // 驗證索引了 30+ 個檔案
  expect(result.stdout).toMatch(/(\d+)/);

  await fixture.cleanup();
});
```

### Rename 測試

```typescript
it('重命名 User 型別應該更新所有引用檔案', async () => {
  const fixture = await loadFixture('sample-project');

  // 執行重命名
  await executeCLI([
    'rename',
    '--symbol', 'User',
    '--new-name', 'Person',
    '--path', fixture.tempPath
  ]);

  // 驗證所有檔案都被更新
  const typesFile = await fixture.readFile('src/types/user.ts');
  expect(typesFile).toContain('interface Person');
  expect(typesFile).not.toContain('interface User');

  const modelFile = await fixture.readFile('src/models/user-model.ts');
  expect(modelFile).toContain('BaseModel<Person>');

  const serviceFile = await fixture.readFile('src/services/user-service.ts');
  expect(serviceFile).toContain('import { Person');

  await fixture.cleanup();
});
```

### Move 測試

```typescript
it('移動檔案應該更新所有 import 路徑', async () => {
  const fixture = await loadFixture('sample-project');

  const sourcePath = fixture.getFilePath('src/types/user.ts');
  const targetPath = fixture.getFilePath('src/types/entities/user.ts');

  await executeCLI(['move', sourcePath, targetPath]);

  // 驗證 import 路徑被更新
  const serviceFile = await fixture.readFile('src/services/user-service.ts');
  expect(serviceFile).toContain("from '../types/entities/user'");

  await fixture.cleanup();
});
```

## 測試原則

### 1. 使用真實場景
- ❌ 不要：建立 3 個簡單檔案的臨時專案
- ✅ 要：使用 fixture 專案測試真實的 30+ 檔案場景

### 2. 驗證實際功能
- ❌ 不要：只檢查 `exitCode === 0` 和 `stdout.length > 0`
- ✅ 要：驗證檔案內容、引用更新、型別正確性

### 3. 測試跨檔案影響
- ❌ 不要：只測試單一檔案的修改
- ✅ 要：驗證修改影響所有相關檔案（10+ 個引用）

### 4. 可反覆執行
- ❌ 不要：測試後留下副作用
- ✅ 要：使用 `afterEach` cleanup，確保可重複執行

## 執行測試

```bash
# 執行所有 E2E 測試
pnpm test:e2e

# 執行特定測試檔案
pnpm test:e2e cli-rename.e2e.test.ts

# Watch 模式
pnpm test:e2e:watch

# Coverage
pnpm test:e2e:coverage
```

## 新增測試

1. 在 `tests/e2e/cli/` 或 `tests/e2e/workflows/` 建立測試檔案
2. 使用 `loadFixture('sample-project')` 載入測試專案
3. 執行功能並驗證結果
4. 確保 `afterEach` 呼叫 `cleanup()`

## Fixture 維護

### 更新 Fixture

如需修改 sample-project：
1. 編輯 `tests/fixtures/sample-project/` 中的檔案
2. 執行 `pnpm test:e2e complexity-validation` 驗證複雜度
3. 更新相關測試案例

### 新增 Fixture

1. 在 `tests/fixtures/` 建立新目錄
2. 在 fixture-manager.ts 中註冊
3. 撰寫對應的驗證測試
