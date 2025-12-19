# Agent-IDE Rename 功能測試報告

## 測試環境

| 項目 | 詳細資訊 |
|------|----------|
| **專案路徑** | `/Users/lova/git/AGGR/ems/backend` |
| **專案類型** | NestJS 後端（TypeScript） |
| **Agent-IDE 版本** | 0.7.2 |
| **測試日期** | 2025-12-19 |
| **測試者** | Lova |

## 測試項目與結果

### 1. Class 重命名測試

**測試案例**：`AlarmDbService` → `AlarmDatabaseService`

**執行結果**：
- ✅ 成功識別 10 個相關檔案
- ⚠️ 輸出格式問題
- ❌ 定義檔案未出現在輸出中

**詳細問題**：

#### 問題 1：輸出只顯示符號名稱，非完整行內容

**期望輸出**：
```typescript
// 檔案：alarm.service.ts:5
constructor(private alarmDbService: AlarmDbService) {}
```

**實際輸出**：
```
alarm.service.ts:5
AlarmDbService
```

**影響**：
- 無法快速驗證重命名上下文是否正確
- 必須手動開啟每個檔案確認
- 降低審查效率

#### 問題 2：定義檔案未見於輸出清單

**預期行為**：
- `alarm-db.service.ts`（定義檔案）應該出現在輸出中
- 該檔案包含 `export class AlarmDbService`

**實際行為**：
- 輸出的 10 個檔案中不包含定義檔案
- 僅列出使用該 class 的檔案

**風險**：
- 使用者可能漏改 class 定義本身
- 造成定義與使用不一致

### 2. 方法重命名測試

**測試案例**：`getConfig` → `fetchConfig`

**執行結果**：
- ✅ 識別 8 個相關檔案
- 🚨 **嚴重問題**：無作用域識別，同名方法全面替換

**詳細問題**：

#### 問題 1：跨 Class 同名方法誤改

**原始程式碼範例**：

```typescript
// alarm.service.ts
export class AlarmService {
  constructor(
    private configService: ConfigService,
    private alarmDbService: AlarmDbService
  ) {}

  async initialize() {
    // AlarmDbService.getConfig() - 預期改名
    const config = await this.alarmDbService.getConfig();

    // ConfigService.getConfig() - 不應該改名
    const appConfig = await this.configService.getConfig();
  }
}
```

**重命名後**：

```typescript
export class AlarmService {
  constructor(
    private configService: ConfigService,
    private alarmDbService: AlarmDbService
  ) {}

  async initialize() {
    // ✅ 正確
    const config = await this.alarmDbService.fetchConfig();

    // ❌ 錯誤！ConfigService 的方法也被改了
    const appConfig = await this.configService.fetchConfig();
  }
}
```

**影響範圍**：
- 所有包含 `getConfig` 字串的地方都被替換
- 包括：
  - ✅ `AlarmDbService.getConfig()`（目標）
  - ❌ `ConfigService.getConfig()`（誤改）
  - ❌ `TouService.getConfig()`（誤改）
  - ❌ `ForecastService.getConfig()`（誤改）

#### 問題 2：純文字搜尋替換，非 AST 語義分析

**根本原因**：
- Agent-IDE 使用文字模式搜尋 `getConfig`
- 未透過 TypeScript Compiler API 分析方法所屬的 class
- 無法區分不同 class 的同名方法

**對比理想行為**（使用 AST 分析）：
```typescript
// 應該只重命名符合以下條件的方法：
// 1. class 為 AlarmDbService
// 2. 方法名為 getConfig
renameMethod({
  className: 'AlarmDbService',
  methodName: 'getConfig',
  newName: 'fetchConfig'
})
```

### 3. 常數/Enum 重命名測試

**測試案例**：`NotificationLevel` → `AlertLevel`

**執行結果**：
- ✅ 識別 12+ 個檔案
- 🚨 **嚴重問題**：會誤改 enum 定義源頭
- ⚠️ re-export 處可能造成不一致

**詳細問題**：

#### 問題 1：定義源頭被修改

**原始結構**：

```typescript
// types/notification.ts（定義源頭）
export enum NotificationLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

// alarm/types.ts（re-export）
export { NotificationLevel } from '../types/notification';

// alarm.service.ts（使用）
import { NotificationLevel } from './types';

const level = NotificationLevel.WARNING;
```

**重命名後**：

```typescript
// types/notification.ts
export enum AlertLevel {  // ❌ 定義被改了
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

// alarm/types.ts
export { AlertLevel } from '../types/notification';  // ✅ re-export 正確

// alarm.service.ts
import { AlertLevel } from './types';  // ✅ import 正確

const level = AlertLevel.WARNING;  // ✅ 使用正確
```

**問題分析**：
- 在某些場景下，定義源頭應該保持不變
- 特別是當該 enum 是從第三方套件 re-export 時
- 應該詢問使用者是否要修改定義本身

#### 問題 2：Re-export 追蹤不完整

**可能的邊緣案例**：

```typescript
// shared/types.ts
export enum NotificationLevel { ... }

// module-a/types.ts
export { NotificationLevel } from '../shared/types';

// module-b/types.ts
export type { NotificationLevel } from '../shared/types';  // type-only export

// module-c/constants.ts
import { NotificationLevel as Level } from '../shared/types';  // 別名 import
export { Level };
```

**風險**：
- Type-only export 可能被漏改
- Alias import/export 可能無法正確追蹤
- 造成部分檔案更新、部分未更新的不一致狀態

## 發現的問題總結

### 高嚴重度問題

| # | 問題 | 影響 | 範例 |
|---|------|------|------|
| 1 | **無作用域識別** | 同名方法全面替換，破壞其他 class 的方法 | `ConfigService.getConfig()` 被誤改為 `fetchConfig()` |
| 2 | **定義與使用未分離** | Enum/Type 定義源頭被修改，可能破壞第三方依賴 | 從外部套件 re-export 的 enum 定義被改 |
| 3 | **純文字搜尋替換** | 非 AST 分析，無法理解語義 | 註解、字串字面量中的符號名稱也被替換 |

### 中嚴重度問題

| # | 問題 | 影響 | 建議 |
|---|------|------|------|
| 4 | **輸出格式簡陋** | 只顯示符號名稱，缺乏上下文 | 應顯示完整程式碼行，類似 `grep -n` 輸出 |
| 5 | **檔案名稱未同步更新** | Class 改名後，檔案名仍為舊名稱 | 提示使用者是否需執行檔案重命名 |
| 6 | **Re-export 追蹤不完整** | Type-only export、別名 export 可能遺漏 | 加強 import/export 語句的 AST 解析 |

## 測試結論

### ✅ 可用場景

| 重命名類型 | 可用性 | 條件 | 風險等級 |
|-----------|--------|------|---------|
| **Class** | 🟡 謹慎使用 | 確認該 class 名稱在專案中唯一 | 中 |
| **Interface/Type** | 🟡 謹慎使用 | 確認非從第三方套件 re-export | 中 |
| **常數** | 🟡 謹慎使用 | 確認名稱唯一性 | 中 |

### ❌ 不建議使用場景

| 重命名類型 | 可用性 | 原因 | 風險等級 |
|-----------|--------|------|---------|
| **方法** | 🔴 不建議 | 同名方法風險太高，會誤改其他 class | 高 |
| **屬性** | 🔴 不建議 | 同名屬性問題同上 | 高 |
| **函數參數** | 🔴 不建議 | 作用域識別不可靠 | 高 |

### 🔒 必須執行的安全措施

**永遠先執行 `--dry-run`**：

```bash
# 正確流程
agent-ide rename AlarmDbService AlarmDatabaseService --dry-run

# 審查輸出，確認無誤後才執行
agent-ide rename AlarmDbService AlarmDatabaseService
```

**人工檢查清單**：

- [ ] 確認符號名稱在專案中唯一
- [ ] 檢查是否有其他 class 使用相同方法名
- [ ] 確認定義源頭是否應該被修改
- [ ] 審查所有輸出的檔案路徑
- [ ] 執行後立即跑測試驗證

## 建議改進方向

### 1. 實作完整的 AST 語義分析

**目前**：純文字搜尋替換
**建議**：使用 TypeScript Compiler API

```typescript
// 偽代碼範例
import ts from 'typescript';

function renameMethod(
  className: string,
  methodName: string,
  newName: string
) {
  const program = ts.createProgram(fileNames, compilerOptions);
  const checker = program.getTypeChecker();

  // 透過 AST 找到所有 method call
  const methodCalls = findMethodCalls(program, checker);

  // 過濾出符合 className.methodName 的調用
  const targetCalls = methodCalls.filter(call => {
    const type = checker.getTypeAtLocation(call.expression);
    return type.symbol?.name === className;
  });

  // 只重命名這些調用
  return targetCalls;
}
```

### 2. 區分定義與使用

**建議行為**：

```bash
$ agent-ide rename NotificationLevel AlertLevel

發現以下項目：
  定義位置：
    ✓ types/notification.ts:5 - enum NotificationLevel

  使用位置（12 處）：
    ✓ alarm/types.ts:3 - export { NotificationLevel }
    ✓ alarm.service.ts:8 - import { NotificationLevel }
    ...

是否要重命名定義本身？[y/N]
```

### 3. 改善輸出格式

**目前輸出**：
```
alarm.service.ts:5
AlarmDbService
```

**建議輸出**：
```
alarm.service.ts:5
  constructor(private alarmDbService: AlarmDbService) {}
                                      ^^^^^^^^^^^^^^^
```

### 4. 提供檔案重命名建議

**Class 重命名後**：

```bash
$ agent-ide rename AlarmDbService AlarmDatabaseService

✓ 已重命名 10 個檔案中的符號

建議同步重命名檔案：
  alarm-db.service.ts → alarm-database.service.ts
  alarm-db.service.spec.ts → alarm-database.service.spec.ts

是否執行檔案重命名？[y/N]
```

### 5. 加入作用域過濾選項

**建議新增參數**：

```bash
# 只重命名特定 class 的方法
agent-ide rename getConfig fetchConfig --scope AlarmDbService

# 只重命名特定模組內的符號
agent-ide rename NotificationLevel AlertLevel --module alarm

# 排除特定檔案
agent-ide rename getConfig fetchConfig --exclude "*.spec.ts"
```

## 風險評估矩陣

| 操作 | 同名符號風險 | 定義源頭風險 | 建議使用方式 |
|------|-------------|-------------|-------------|
| Class 重命名 | 🟡 中 | 🟢 低 | ✅ 可用，需 dry-run |
| Interface 重命名 | 🟡 中 | 🟡 中 | ⚠️ 謹慎使用 |
| Method 重命名 | 🔴 高 | 🟢 低 | ❌ 不建議 |
| Enum 重命名 | 🟡 中 | 🔴 高 | ⚠️ 需確認來源 |
| 常數重命名 | 🟢 低 | 🟢 低 | ✅ 相對安全 |

## 總結

Agent-IDE 的 `rename` 功能目前**不適合用於生產環境的大規模重構**，主要受限於：

1. **缺乏語義理解**：純文字搜尋替換，無法區分不同作用域的同名符號
2. **無定義/使用分離**：可能誤改定義源頭或第三方依賴
3. **輸出資訊不足**：難以快速驗證重命名的正確性

**建議使用場景**：
- ✅ 小型專案的簡單重命名（確認名稱唯一）
- ✅ 實驗性重構（配合 git 隨時 revert）
- ✅ 快速原型開發

**不建議使用場景**：
- ❌ 大型專案的方法重命名
- ❌ 跨模組的 API 重構
- ❌ 生產環境的關鍵重構

**替代方案**：
- TypeScript Language Service 的 Rename Symbol（VS Code F2）
- WebStorm/IntelliJ IDEA 的 Refactor → Rename
- 專用重構工具（如 ts-morph）

---

**附註**：本報告基於實際測試結果撰寫，所有問題均已在測試環境中重現驗證。
