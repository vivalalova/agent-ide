# 測試覆蓋率提升指南 - 達成90%+

## 目標
根據 CLAUDE.md 規範，提升 Agent IDE 專案測試覆蓋率到 90%+ (核心模組95%+)，並增加多樣化測試案例。

## 現況分析
- **當前狀況**: 707個測試通過，91個失敗，總計815個測試
- **主要問題**: analysis 和 refactor 模組缺少源碼實作
- **測試品質**: 測試架構完整，但執行穩定性需改善

## 執行策略

### 第一階段：修復失敗測試 (1-2天)

#### 1.1 修復 Edge Cases 測試
**問題**: `ReferenceError: description is not defined`
**位置**: `tests/edge-cases/*/edge-cases.test.ts`

**修復方案**:
```typescript
// 修正變數引用錯誤
- describe(description, () => {  // ❌ 錯誤
+ describe('測試描述', () => {  // ✅ 正確
```

**檢查清單**:
- [ ] 修復 tests/edge-cases/analysis/edge-cases.test.ts
- [ ] 修復 tests/edge-cases/dependency/edge-cases.test.ts
- [ ] 修復 tests/edge-cases/indexing/edge-cases.test.ts
- [ ] 修復 tests/edge-cases/move/edge-cases.test.ts
- [ ] 修復 tests/edge-cases/refactor/edge-cases.test.ts
- [ ] 修復 tests/edge-cases/rename/edge-cases.test.ts
- [ ] 修復 tests/edge-cases/search/edge-cases.test.ts

#### 1.2 解決記憶體洩漏警告
**問題**: `MaxListenersExceededWarning: 51 listeners`
**解決方案**:
```typescript
// 在 tests/setup.ts 中增加
process.setMaxListeners(100);
EventEmitter.defaultMaxListeners = 100;
```

### 第二階段：實作缺失模組 (3-5天)

#### 2.1 實作 Analysis 模組
**需實作檔案**:
```
src/core/analysis/
├── complexity-analyzer.ts     # 複雜度分析器
├── dead-code-detector.ts      # 死代碼檢測器
├── duplication-detector.ts    # 重複代碼檢測器
├── quality-metrics.ts         # 代碼品質指標
└── index.ts                   # 模組入口
```

**實作規範**:
- 遵循 CLAUDE.md 的模組化原則
- 使用 TypeScript strict mode
- 所有方法返回 Promise
- 完整的錯誤處理

**測試對應檔案**:
```
tests/core/analysis/
├── complexity-analyzer.test.ts    ✅ 已存在
├── dead-code-detector.test.ts     ✅ 已存在
├── duplication-detector.test.ts   ✅ 已存在
└── quality-metrics.test.ts        ✅ 已存在
```

#### 2.2 實作 Refactor 模組
**需實作檔案**:
```
src/core/refactor/
├── extract-function.ts        # 函式提取重構
├── inline-function.ts         # 函式內聯重構
├── design-patterns.ts         # 設計模式重構
└── index.ts                   # 模組入口
```

**實作規範**:
- 基於 AST 操作，不修改原始檔案
- 支援預覽模式
- 完整的回滾機制
- 符合 TypeScript/JavaScript 語法規範

### 第三階段：增加測試案例多樣性 (2-3天)

#### 3.1 增強錯誤處理測試
**每個模組都需要包含**:
```typescript
describe('錯誤處理', () => {
  describe('當輸入無效時', () => {
    it('應該拋出 ValidationError', () => {
      expect(() => service.method(null)).toThrow(ValidationError);
    });
  });

  describe('當檔案不存在時', () => {
    it('應該拋出 FileNotFoundError', () => {
      expect(() => service.method('invalid-path')).toThrow(FileNotFoundError);
    });
  });

  describe('當權限不足時', () => {
    it('應該拋出 PermissionError', () => {
      expect(() => service.method('/root/file')).toThrow(PermissionError);
    });
  });
});
```

#### 3.2 增加邊界條件測試
**每個模組都需要測試**:
```typescript
describe('邊界條件', () => {
  it('應該正確處理空字串', () => {
    expect(service.method('')).toBe(expectedEmptyResult);
  });

  it('應該正確處理極大數值', () => {
    expect(service.method(Number.MAX_SAFE_INTEGER)).toBe(expectedResult);
  });

  it('應該正確處理特殊字符', () => {
    expect(service.method('特殊字符\n\t\r')).toBe(expectedResult);
  });

  it('應該正確處理 Unicode 字符', () => {
    expect(service.method('🚀💻📚')).toBe(expectedResult);
  });
});
```

#### 3.3 增加並發測試
```typescript
describe('並發處理', () => {
  it('應該能安全處理並發請求', async () => {
    const promises = Array.from({ length: 10 }, () => service.method(testData));
    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    expect(results.every(r => r.success)).toBe(true);
  });
});
```

### 第四階段：覆蓋率監控與優化 (1天)

#### 4.1 設定覆蓋率閾值
**修改 vitest.config.ts**:
```typescript
coverage: {
  reporter: ['text', 'json', 'html', 'lcov'],
  thresholds: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    },
    // 核心模組要求更高標準
    'src/core/**': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95
    }
  },
  exclude: [
    'node_modules/',
    'tests/',
    'dist/',
    '**/*.d.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/bin.ts',           // CLI 入口點
    '**/types.ts',         // 純型別檔案
    '**/constants.ts'      // 常數檔案
  ]
}
```

#### 4.2 覆蓋率報告分析
**每日執行**:
```bash
# 生成詳細覆蓋率報告
npm run test:coverage

# 檢查覆蓋率是否達標
npm run test:coverage -- --reporter=json | jq '.coverage.summary'
```

## 品質標準

### 測試案例品質要求
1. **描述清晰**: 使用繁體中文，遵循 BDD 風格
2. **案例完整**: 包含正常流程、錯誤處理、邊界條件
3. **斷言具體**: 避免模糊的 `toBeTruthy()`，使用具體值比對
4. **Mock 適當**: 隔離外部依賴，但避免過度 Mock

### 測試性能要求
```typescript
// 每個測試應在合理時間內完成
describe('性能測試', () => {
  it('應該在100ms內完成基本操作', async () => {
    const start = Date.now();
    await service.basicOperation();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
```

### 記憶體管理要求
```typescript
// 每個測試後清理資源
afterEach(async () => {
  await TestCleanup.cleanupAll();
  if (global.gc) {
    global.gc();
  }
});
```

## 執行檢查清單

### 第一階段檢查清單
- [ ] 修復所有 edge-cases 測試的 ReferenceError
- [ ] 解決 EventEmitter 記憶體洩漏警告
- [ ] 確認失敗測試數量減少到 < 20 個

### 第二階段檢查清單
- [ ] 完成 complexity-analyzer.ts 實作
- [ ] 完成 dead-code-detector.ts 實作
- [ ] 完成 duplication-detector.ts 實作
- [ ] 完成 quality-metrics.ts 實作
- [ ] 完成 extract-function.ts 實作
- [ ] 完成 inline-function.ts 實作
- [ ] 完成 design-patterns.ts 實作
- [ ] 所有新實作的模組通過對應測試

### 第三階段檢查清單
- [ ] 每個核心模組都有完整的錯誤處理測試
- [ ] 每個核心模組都有完整的邊界條件測試
- [ ] 增加至少 50 個新的測試案例
- [ ] 所有新測試案例都通過

### 第四階段檢查清單
- [ ] 全域覆蓋率達到 90%+
- [ ] 核心模組覆蓋率達到 95%+
- [ ] 覆蓋率報告正常生成
- [ ] 所有測試穩定通過

## 驗證標準

### 最終驗證命令
```bash
# 1. 執行完整測試套件
npm run test:run

# 2. 生成覆蓋率報告
npm run test:coverage

# 3. 檢查測試穩定性（執行3次）
for i in {1..3}; do npm run test:run; done

# 4. 檢查記憶體使用
npm run test:memory
```

### 成功標準
- ✅ 測試通過率 > 95% (至少 774/815 個測試通過)
- ✅ 全域覆蓋率 ≥ 90%
- ✅ 核心模組覆蓋率 ≥ 95%
- ✅ 測試執行時間 < 30 秒
- ✅ 無記憶體洩漏警告
- ✅ 所有新實作模組功能正常

## 風險管理

### 潛在風險
1. **實作複雜度**: analysis 和 refactor 模組功能複雜
2. **測試穩定性**: 並發測試可能不穩定
3. **記憶體限制**: 大量測試可能導致記憶體不足

### 風險緩解
1. **分階段實作**: 先實作基本功能，再增加複雜特性
2. **漸進增加**: 逐步增加測試案例，確保穩定性
3. **記憶體監控**: 每階段監控記憶體使用，及時優化