# Agent IDE 專案規範

## 快速參考

```bash
pnpm build test:unit test:e2e typecheck lint
```

**架構**：10核心模組、3 Parser、雙層測試（1167 Unit + E2E）

**路徑映射**：`@core/*` `@infrastructure/*` `@shared/*` `@plugins/*` `@application/*` `@interfaces/*`

## 開發規範

**原則**：TDD、TS strict、SOLID、禁 any

**測試策略**：
- Unit Tests (`tests/unit/**`) - vitest + mock、90%+ 覆蓋率
- E2E Tests (`tests/e2e/**`) - fixture-based CLI 測試

**Unit Test 範例**：
```typescript
import { describe, it, expect, vi } from 'vitest';
import { DependencyGraph } from '@core/dependency/dependency-graph';

describe('DependencyGraph', () => {
  it('應該新增節點', () => {
    const graph = new DependencyGraph();
    graph.addNode('file.ts');
    expect(graph.hasNode('file.ts')).toBe(true);
  });
});
```

**E2E Test 範例**：
```typescript
import { loadFixture } from '../helpers/fixture-manager';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI shit - 基於 sample-project fixture', () => {
  let fixture;
  beforeEach(async () => { fixture = await loadFixture('sample-project'); });
  afterEach(async () => { await fixture.cleanup(); });

  it('應該分析專案並輸出 JSON', async () => {
    const result = await executeCLI(['shit', '--path', fixture.tempPath, '--format', 'json']);
    expect(result.exitCode).toBe(0);
  });
});
```

**常見陷阱**：
- ❌ 測試實作細節 → ✅ 測試公開 API
- ❌ 直接測試類別 → ✅ E2E 透過 CLI

## 核心模組

1. Analysis - 複雜度/品質/死代碼
2. Dependency - 依賴圖/循環檢測(Tarjan)/影響分析(BFS)
3. Indexing - 1000檔/秒、查詢<10ms
4. Move - 檔案移動+import更新
5. Refactor - 提取/內聯函式
6. Rename - 符號重命名+引用更新
7. Search - 文字/語義/結構化
8. Shift - 行級移動
9. Snapshot - 快照管理
10. ShitScore - 0-100分評分（Complexity 30%、Maintainability 30%、Architecture 30%、QA 20%）

## 基礎設施

- Parser - 插件管理/統一AST（TS/JS/Swift）
- Cache - LRU/LFU/TTL
- Storage - FS抽象/事務
