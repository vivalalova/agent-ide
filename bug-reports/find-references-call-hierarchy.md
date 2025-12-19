# Agent-IDE Find References & Call Hierarchy 功能測試報告

## 測試環境

| 項目 | 資訊 |
|------|------|
| 測試專案 | /Users/lova/git/AGGR/ems/backend |
| 專案類型 | NestJS 後端 (TypeScript) |
| Agent-IDE 版本 | 0.7.2 |
| 測試日期 | 2025-12-19 |

## 測試項目

### 1. Find References 功能

測試符號引用查找功能，驗證能否正確找到符號的定義位置和所有引用。

### 2. Call Hierarchy 功能

測試函數呼叫層級分析，驗證能否正確識別呼叫者（incoming calls）和被呼叫者（outgoing calls）。

---

## 測試結果

### Find References - AlarmService

**測試符號**: `AlarmService`

**結果**: ✅ 成功

| 項目 | 結果 |
|------|------|
| 定義位置 | `alarm.service.ts:32` |
| 引用數量 | 18 個引用 |
| 涉及檔案 | 8 個檔案 |
| 定義/引用區分 | ✅ 正確區分 definition 和 usage |

**輸出範例**:

```
Definition:
  alarm.service.ts:32 - export class AlarmService implements OnModuleInit {

Usages (18):
  alarm.controller.ts:15 - constructor(private readonly alarmService: AlarmService) {}
  alarm.service.ts:32 - export class AlarmService implements OnModuleInit {
  smart-control.service.ts:45 - private readonly alarmService: AlarmService,
  ...
```

---

### Find References - getConfig

**測試符號**: `getConfig`

**結果**: ⚠️ 部分成功（存在問題）

| 項目 | 結果 |
|------|------|
| 引用數量 | 21 個引用 |
| 涉及檔案 | 8 個檔案 |
| 問題 | ❌ 同名方法只回報第一個定義 |

**發現問題**:

當多個 class 有同名方法時（如 `AlarmService.getConfig` 和 `ConfigService.getConfig`），find-references 只回報第一個定義位置，無法區分不同 class 的同名方法。

**範例情境**:

```typescript
// alarm.service.ts
export class AlarmService {
  getConfig() { ... }  // ← 只回報這個定義
}

// config.service.ts
export class ConfigService {
  getConfig() { ... }  // ← 沒有回報此定義
}
```

---

### Call Hierarchy - detectAnomalies

**測試符號**: `detectAnomalies`

**結果**: ✅ 正確失敗（符號不存在）

工具正確回報該函數不存在於專案中，符合預期行為。

---

### Call Hierarchy - checkMinutelyAnomalies

**測試符號**: `checkMinutelyAnomalies`

**結果**: ✅ 成功

| 項目 | 結果 |
|------|------|
| Incoming Calls (呼叫者) | 3 個 |
| Outgoing Calls (被呼叫者) | 5 個 |
| 準確性 | ✅ 準確識別呼叫關係 |

**Incoming Calls**:

```
1. alarm.service.ts:120 - startSchedule()
2. alarm.controller.ts:45 - manualCheck()
3. smart-control.service.ts:200 - validateAlarms()
```

**Outgoing Calls**:

```
1. alarm-db.service.ts:80 - getAlarmConfig()
2. device.service.ts:150 - getDeviceData()
3. notification.service.ts:90 - sendAlert()
4. logger.service.ts:50 - log()
5. date-utils.ts:30 - getCurrentTime()
```

---

## 發現的問題

### 問題 1: 同名方法只回報第一個定義

**嚴重程度**: 🔴 高

**描述**: 當專案中存在多個 class 擁有同名方法時，find-references 只回報第一個找到的定義位置，導致無法區分不同 class 的同名方法。

**影響**:
- 無法準確定位特定 class 的方法
- call-hierarchy 可能分析錯誤的方法版本
- 重構時可能誤改其他 class 的同名方法

**重現步驟**:

```bash
# 搜尋 getConfig 方法
agent-ide find-references --symbol getConfig --path ./src

# 結果：只顯示第一個定義，忽略其他同名方法
```

---

### 問題 2: 行號偏移約 2 行

**嚴重程度**: 🟡 中

**描述**: 回報的行號指向裝飾器位置，而非實際的 class 宣告位置。

**範例**:

```typescript
// 實際檔案內容
@Injectable()              // ← 回報指向這裡 (line 30)
@ApiTags('alarm')          // line 31
export class AlarmService  // ← 應該指向這裡 (line 32)
```

**影響**:
- 使用者需要手動調整行號才能找到正確位置
- 自動化工具可能定位到錯誤的程式碼區塊

---

### 問題 3: Call Hierarchy 只分析單一定義版本

**嚴重程度**: 🔴 高

**描述**: 當執行 call-hierarchy 分析同名方法時，只分析第一個找到的定義版本，忽略其他同名方法的呼叫關係。

**範例**:

```typescript
// AlarmService.getConfig() 的呼叫關係
agent-ide call-hierarchy --symbol getConfig

// 結果：只分析 AlarmService.getConfig()
// 忽略：ConfigService.getConfig() 的呼叫關係
```

**影響**:
- 呼叫關係分析不完整
- 重構時無法評估完整影響範圍

---

## 建議改進

### 改進 1: 支援完整符號路徑

**優先級**: 🔴 高

**建議**:

允許使用完整符號路徲來指定目標，例如：

```bash
# 指定 class 和方法
agent-ide find-references --symbol AlarmService.getConfig

# 指定檔案路徑和符號
agent-ide find-references --symbol src/alarm/alarm.service.ts:getConfig

# 指定行號
agent-ide find-references --symbol getConfig --line 45
```

**預期效果**:
- 精確定位特定 class 的方法
- 避免同名方法混淆
- 提升大型專案的可用性

---

### 改進 2: 列出所有定義位置供使用者選擇

**優先級**: 🔴 高

**建議**:

當找到多個同名符號時，列出所有定義位置並提示使用者選擇：

```bash
$ agent-ide find-references --symbol getConfig

Found 3 definitions for 'getConfig':
  [1] alarm.service.ts:45 - AlarmService.getConfig()
  [2] config.service.ts:120 - ConfigService.getConfig()
  [3] device.service.ts:200 - DeviceService.getConfig()

Please specify which one to analyze:
  --symbol AlarmService.getConfig
  --symbol ConfigService.getConfig
  --symbol DeviceService.getConfig
```

**預期效果**:
- 清楚展示所有可能的目標
- 使用者可明確選擇要分析的符號
- 避免分析錯誤的方法版本

---

### 改進 3: 修正行號偏移問題

**優先級**: 🟡 中

**建議**:

調整行號計算邏輯，指向實際的符號宣告位置，而非裝飾器或註解位置。

**預期效果**:
- 準確定位符號位置
- 提升使用者體驗
- 與主流 IDE 行為一致

---

### 改進 4: 增強 Call Hierarchy 的多定義支援

**優先級**: 🔴 高

**建議**:

當分析同名方法時，提供選項分析所有定義版本的呼叫關係：

```bash
$ agent-ide call-hierarchy --symbol getConfig --all

Analyzing all definitions of 'getConfig':

[1] AlarmService.getConfig()
    Incoming: 3 calls
    Outgoing: 5 calls

[2] ConfigService.getConfig()
    Incoming: 12 calls
    Outgoing: 2 calls

[3] DeviceService.getConfig()
    Incoming: 8 calls
    Outgoing: 3 calls
```

**預期效果**:
- 完整的呼叫關係分析
- 準確評估重構影響範圍
- 支援大型專案的複雜呼叫鏈

---

## 總結

### 功能優勢

✅ 基本的符號引用查找功能正常運作
✅ Call hierarchy 能準確識別呼叫關係
✅ 能正確區分 definition 和 usage
✅ 能正確回報不存在的符號

### 關鍵缺陷

❌ 同名方法無法區分（影響準確性）
❌ Call hierarchy 只分析單一定義（影響完整性）
⚠️ 行號偏移問題（影響使用體驗）

### 優先改進項目

1. **支援完整符號路徑**（解決同名方法問題）
2. **列出所有定義供選擇**（提升使用者控制）
3. **增強多定義支援**（完整的影響分析）
4. **修正行號偏移**（提升準確性）

---

## 附錄：測試指令

```bash
# Find References 測試
agent-ide find-references --symbol AlarmService --path ./src
agent-ide find-references --symbol getConfig --path ./src

# Call Hierarchy 測試
agent-ide call-hierarchy --symbol detectAnomalies --path ./src
agent-ide call-hierarchy --symbol checkMinutelyAnomalies --path ./src
```
