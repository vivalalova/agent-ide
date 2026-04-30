# no-new-filesystem

## 規則說明

禁止直接 `new FileSystem()` 實例化，強制從外部注入。

### 目的

FileSystem 實例僅由 composition root（以 `cli.ts` 結尾的檔案）建立，其餘模組一律注入，確保：
- **可測試性**：測試時注入 mock FileSystem
- **單一來源**：整個應用共用同一 FileSystem 實例
- **架構清晰**：實例化職責集中在 composition root

## 禁止的模式

```typescript
// ❌ 錯誤：直接實例化
class MyService {
  private fs = new FileSystem();
}

// ❌ 錯誤：在 function 中實例化
function doSomething() {
  const fs = new FileSystem();
}
```

## 允許的模式

```typescript
// ✅ 正確：從 constructor 注入
class MyService {
  constructor(private fileSystem: FileSystem) {}
}

// ✅ 正確：以 cli.ts 結尾的檔案（composition root）
// src/interfaces/cli/cli.ts
const fileSystem = new FileSystem();
```

## 錯誤訊息

```
error  Direct FileSystem instantiation is not allowed.
       Inject FileSystem from outside. Only cli.ts is allowed to create FileSystem instances.
       custom/no-new-filesystem
```

## 測試方法

```bash
# 測試單一檔案
npx eslint src/infrastructure/cache/cache-manager.ts

# 檢查所有違規
pnpm lint 2>&1 | grep 'custom/no-new-filesystem'

# 列出所有違規檔案
pnpm lint 2>&1 | grep -B 1 'custom/no-new-filesystem' | grep '\.ts:' | sort -u
```

## 實作細節

- **規則類型**：`problem`（錯誤級別）
- **檢查範圍**：`**/*.ts`（`cli.ts` 除外）
- **例外**：所有以 `cli.ts` 結尾的檔案（composition root）
- **偵測模式**：`NewExpression` 且 callee 為 `FileSystem`

## 修正指南

1. 移除 `new FileSystem()`
2. 在 constructor 加入 `FileSystem` 參數
3. 從呼叫端傳入 FileSystem 實例
