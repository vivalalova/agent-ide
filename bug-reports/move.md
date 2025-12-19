# Agent-IDE Move 功能測試報告

## 測試環境

| 項目 | 資訊 |
|------|------|
| Agent-IDE 版本 | 0.7.2 |
| 測試專案 | /Users/lova/git/AGGR/ems/backend |
| 專案類型 | NestJS 後端 (TypeScript) |
| 路徑配置 | 使用 `@/*` 路徑映射 (tsconfig.json) |
| 測試日期 | 2025-12-19 |

## 測試項目與結果

### 一、`move` 命令測試

#### 1.1 基本檔案移動

**測試案例**：移動單一檔案並更新相對路徑 import

**結果**：✅ **成功**

**表現**：
- 正確偵測所有使用相對路徑的引用檔案
- 自動更新 import 路徑
- 變更預覽清晰易讀

---

#### 1.2 移動到新子目錄

**測試案例**：將檔案移動到新建的子目錄

```bash
# 移動前
src/modules/alarm/alarm.service.ts

# 移動後
src/modules/alarm/services/alarm.service.ts
```

**結果**：⚠️ **部分成功**

**偵測到的檔案**（7 個，使用相對路徑）：
- `src/modules/alarm/alarm-config/alarm-config.service.ts`
- `src/modules/alarm/alarm-consumer.ts`
- `src/modules/alarm/alarm-record/alarm-record.service.ts`
- `src/modules/alarm/alarm.facade.ts`
- `src/modules/alarm/alarm.service.spec.ts`
- `src/modules/alarm/notification-channel/line-notify.service.ts`
- `src/modules/alarm/test-helpers/alarm-service.helpers.ts`

**未偵測到的檔案**（3 個，使用路徑映射）：

1. `src/modules/alarm/alarm.controller.ts`
```typescript
import { AlarmService } from '@/modules/alarm/alarm.service';
```

2. `src/modules/alarm/alarm.module.ts`
```typescript
import { AlarmService } from '@/modules/alarm/alarm.service';
```

3. `src/modules/webhook/line-webhook.controller.ts`
```typescript
import { AlarmService } from '@/modules/alarm/alarm.service';
```

---

#### 1.3 移動 Barrel Export (index.ts)

**測試案例**：移動含動態 import 路徑的 index.ts

**結果**：✅ **成功**

**表現**：
- 正確處理 `export * from './xxx'` 語法
- 自動更新相對路徑引用

---

### 二、`move-member` 命令測試

#### 2.1 移動 Public 方法

**測試案例**：將 public 方法從一個 class 移至另一個

**結果**：✅ **成功**

**表現**：
- 方法正確移動
- 語法完整保留

---

#### 2.2 移動 Private 方法

**測試案例**：移動 private 方法

**結果**：✅ **成功**

---

#### 2.3 目標檔案不存在

**測試案例**：移動到不存在的檔案

**結果**：✅ **正確報錯**

**錯誤訊息**：
```
Error: Target file does not exist
```

---

#### 2.4 成員不存在

**測試案例**：嘗試移動不存在的方法

**結果**：✅ **正確報錯**

**錯誤訊息**：
```
Error: Member 'nonExistentMethod' not found in class
```

---

#### 2.5 引用更新計數問題

**結果**：❌ **失敗**

**問題描述**：
- 所有測試中 `referenceUpdates` 始終為 `0`
- 即使方法被其他檔案引用，更新計數仍為 0
- 可能原因：引用偵測邏輯未正確實作

**實際輸出範例**：
```json
{
  "success": true,
  "referenceUpdates": 0  // 應該 > 0
}
```

---

## 發現的問題

### 🔴 嚴重：路徑映射 (Path Mapping) 未被偵測

**影響範圍**：使用 TypeScript `paths` 配置的專案

**問題描述**：
Agent-IDE 無法偵測使用路徑映射 (`@/*`) 的 import 語句，導致移動檔案後這些引用未被自動更新。

**tsconfig.json 配置範例**：
```json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"]
    }
  }
}
```

**未偵測案例**：
```typescript
// ❌ 未被偵測
import { AlarmService } from '@/modules/alarm/alarm.service';

// ✅ 有被偵測
import { AlarmService } from '../alarm/alarm.service';
import { AlarmService } from './alarm.service';
```

**影響**：
- 移動檔案後需手動修正使用路徑映射的 import
- 增加重構風險，可能遺漏部分引用

---

### 🟡 中等：move-member 引用更新計數始終為 0

**問題描述**：
`move-member` 命令的 `referenceUpdates` 欄位始終返回 `0`，即使成員被其他檔案引用。

**預期行為**：
```json
{
  "success": true,
  "referenceUpdates": 3  // 應顯示實際更新的引用數量
}
```

**實際行為**：
```json
{
  "success": true,
  "referenceUpdates": 0  // 始終為 0
}
```

**影響**：
- 無法確認引用是否已正確更新
- 降低工具的可信度

---

## 建議改進

### 優先級 1：支援 TypeScript 路徑映射

**實作建議**：

1. **讀取 tsconfig.json 配置**
```typescript
import * as ts from 'typescript';

function loadPathMappings(projectRoot: string) {
  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    'tsconfig.json'
  );

  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    projectRoot
  );

  return options.paths || {};
}
```

2. **解析路徑映射為實際路徑**
```typescript
function resolvePathMapping(
  importPath: string,
  pathMappings: Record<string, string[]>,
  baseUrl: string
): string | null {
  // '@/modules/alarm/alarm.service' -> 'src/modules/alarm/alarm.service'
  for (const [pattern, replacements] of Object.entries(pathMappings)) {
    const regex = new RegExp(
      '^' + pattern.replace('*', '(.*)') + '$'
    );
    const match = importPath.match(regex);

    if (match) {
      const captured = match[1];
      return path.join(
        baseUrl,
        replacements[0].replace('*', captured)
      );
    }
  }

  return null;
}
```

3. **整合到引用偵測邏輯**
```typescript
function findReferences(file: string, pathMappings: Record<string, string[]>) {
  const imports = extractImports(file);

  return imports.filter(imp => {
    const resolvedPath = imp.startsWith('@/')
      ? resolvePathMapping(imp, pathMappings, baseUrl)
      : resolveRelativePath(imp);

    return resolvedPath === targetFile;
  });
}
```

---

### 優先級 2：修正 move-member 引用計數

**實作建議**：

1. **實作引用偵測**
```typescript
async function findMemberReferences(
  memberName: string,
  sourceClass: string,
  projectRoot: string
): Promise<string[]> {
  // 使用 TypeScript Compiler API 或 grep 查找引用
  const references = await searchProject(
    `${sourceClass}.${memberName}`,
    projectRoot
  );

  return references;
}
```

2. **更新返回值**
```typescript
const references = await findMemberReferences(memberName, sourceClass, projectRoot);
const updatedReferences = await updateReferences(references, targetClass);

return {
  success: true,
  referenceUpdates: updatedReferences.length  // 實際更新數量
};
```

---

### 優先級 3：增強錯誤訊息

**建議**：
- 當偵測到路徑映射但無法處理時，顯示警告
- 列出所有未處理的引用，提醒使用者手動檢查

**範例輸出**：
```
⚠️  Warning: 3 references using path mappings were not updated automatically:
  - src/modules/alarm/alarm.controller.ts:5
  - src/modules/alarm/alarm.module.ts:8
  - src/modules/webhook/line-webhook.controller.ts:12

Please update these imports manually:
  @/modules/alarm/alarm.service → @/modules/alarm/services/alarm.service
```

---

## 測試覆蓋率評估

| 功能 | 測試項目 | 通過率 |
|------|----------|--------|
| `move` - 相對路徑 | 7/7 | 100% ✅ |
| `move` - 路徑映射 | 0/3 | 0% ❌ |
| `move` - Barrel Export | 1/1 | 100% ✅ |
| `move-member` - 基本功能 | 4/4 | 100% ✅ |
| `move-member` - 引用更新 | 0/1 | 0% ❌ |
| **整體** | **12/16** | **75%** |

---

## 總結

Agent-IDE 的 `move` 和 `move-member` 功能在處理**相對路徑**時表現良好，但在**路徑映射**支援上存在重大缺陷。

### 優點
- ✅ 相對路徑引用偵測準確
- ✅ Barrel Export 處理完善
- ✅ 錯誤處理機制健全

### 待改進
- ❌ 缺少 TypeScript 路徑映射支援（嚴重影響實用性）
- ❌ move-member 引用計數功能未實作
- ⚠️ 錯誤訊息可更詳細

### 建議
1. **立即修復**：路徑映射支援（影響廣泛）
2. **中期改進**：引用計數功能
3. **長期優化**：增強錯誤提示與邊界案例處理

---

**測試者**：Claude Code
**報告日期**：2025-12-19
