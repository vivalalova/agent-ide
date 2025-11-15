# 测试可读性改进清单

本文档列出需要改进的测试文件、具体问题和预估工作量。

## 优先级分类

- 🔴 **P0 - 高优先级**：重复代码多，改进效果明显
- 🟡 **P1 - 中优先级**：部分重复，可以改进
- 🟢 **P2 - 低优先级**：已经较好，小幅优化

---

## 🔴 P0 - 高优先级文件（建议优先改进）

### 1. tests/unit/core/shit-score/grading.test.ts
**问题：**
- 大量重复的评级判定测试（A/B/C/D/F 各一个测试）
- 每个维度的建议生成测试都高度相似
- 测试名称包含硬编码范围值

**改进建议：**
- [ ] 使用 `it.each` 合并评级判定测试（5个测试 → 1个参数化测试）
- [ ] 使用 `it.each` 合并边界值测试
- [ ] 提取 `createDimensionScore` 工厂函数
- [ ] 使用常量定义阈值

**预估工作量：** 1-2 小时  
**潜在代码减少：** ~40%（约 100 行 → 60 行）

---

### 2. tests/unit/infrastructure/cache/strategies.test.ts
**问题：**
- 每个测试都手动创建 `CacheItem` 对象
- StrategyFactory 测试重复 5 次
- 相似的测试模式在不同策略中重复

**改进建议：**
- [ ] 使用 `createCacheItem` 工厂函数（已创建）
- [ ] 使用 `it.each` 合并 StrategyFactory 测试（5个 → 1个）
- [ ] 提取共同的测试辅助函数

**预估工作量：** 2-3 小时  
**潜在代码减少：** ~50%（约 340 行 → 170 行）

---

### 3. tests/unit/core/analysis/quality-metrics.test.ts
**问题：**
- getGrade 测试重复 5 次
- 大量手动创建 `CodeMetrics` 对象
- 魔术数字散布在各处（60, 25, 20, 7 等）

**改进建议：**
- [ ] 使用 `it.each` 合并 getGrade 测试
- [ ] 创建 `createCodeMetrics` 工厂函数
- [ ] 定义常量 `THRESHOLDS`（LONG_METHOD, LARGE_CLASS 等）
- [ ] 使用 `createCodeLines` 辅助函数

**预估工作量：** 2-3 小时  
**潜在代码减少：** ~35%（约 524 行 → 340 行）

---

### 4. tests/unit/core/indexing/file-index.test.ts
**问题：**
- beforeEach 中手动创建大量 mock 数据
- "應該回傳空陣列" 模式重复 6 次
- "應該拋出錯誤" 模式重复多次

**改进建议：**
- [ ] 使用 `createFileInfo` 和 `createIndexConfig` 工厂函数
- [ ] 使用 `it.each` 合并 "應該回傳空陣列" 测试
- [ ] 使用 `it.each` 合并 "應該拋出錯誤" 测试
- [ ] 使用 `createSymbol` 和 `createDependency` 工厂函数

**预估工作量：** 2-3 小时  
**潜在代码减少：** ~30%（约 597 行 → 418 行）

---

### 5. tests/e2e/cli/ts/cli-deps.e2e.test.ts
**问题：**
- 手动创建循环依赖的代码重复多次
- 缺少辅助函数封装常见操作
- 测试场景组织可以更清晰

**改进建议：**
- [ ] 创建 `createCircularDependency` 辅助函数
- [ ] 创建 `createMultiLevelCycle` 辅助函数
- [ ] 创建 `expectCircularDependencyDetected` 断言辅助函数
- [ ] 使用 `it.each` 测试不同层级的循环依赖

**预估工作量：** 2-3 小时  
**潜在代码减少：** ~60%（约 397 行 → 160 行）

---

## 🟡 P1 - 中优先级文件

### 6. tests/unit/core/dependency/cycle-detector.test.ts
**问题：**
- 测试名称可以更具描述性
- 部分重复的图创建逻辑

**改进建议：**
- [ ] 提取 `createCycleGraph` 辅助函数
- [ ] 改进测试名称，添加具体场景描述

**预估工作量：** 1 小时  
**潜在代码减少：** ~15%

---

### 7. tests/unit/core/refactor/extract-function.test.ts
**问题：**
- 重复创建相似的 config 对象
- 测试可以更好地分组

**改进建议：**
- [ ] 创建 `createExtractConfig` 工厂函数
- [ ] 使用 `it.each` 测试不同的插入点

**预估工作量：** 1-2 小时  
**潜在代码减少：** ~20%

---

### 8. tests/e2e/cli/ts/cli-shit.e2e.test.ts
**问题：**
- 大量重复的 CLI 调用
- 可以提取更多辅助函数

**改进建议：**
- [ ] 创建 `executeShitCommand` 辅助函数
- [ ] 创建 `expectValidShitScore` 断言辅助函数

**预估工作量：** 1-2 小时  
**潜在代码减少：** ~25%

---

### 9. tests/unit/core/rename/reference-updater.test.ts
**问题：**
- 重复的 "應該處理" 模式
- 可以使用更多参数化测试

**改进建议：**
- [ ] 使用 `it.each` 合并相似测试场景

**预估工作量：** 1 小时  
**潜在代码减少：** ~20%

---

### 10. tests/unit/core/indexing/symbol-index.test.ts
**问题：**
- "應該回傳空陣列" 模式重复
- 手动创建 Symbol 对象

**改进建议：**
- [ ] 使用 `createSymbol` 工厂函数
- [ ] 使用 `it.each` 合并空数组测试

**预估工作量：** 1-2 小时  
**潜在代码减少：** ~25%

---

## 🟢 P2 - 低优先级文件

这些文件已经相对较好，可以进行小幅优化：

11. tests/unit/core/dependency/dependency-graph.test.ts
12. tests/unit/core/snapshot/snapshot-differ.test.ts
13. tests/unit/core/search/text-engine.test.ts
14. tests/unit/infrastructure/storage/file-system.test.ts
15. tests/unit/infrastructure/cache/memory-cache.test.ts

**改进建议：** 小幅优化，使用工厂函数  
**预估工作量：** 每个文件 0.5-1 小时

---

## 立即需要修复的问题

### ❌ 严重可读性问题

1. **魔术数字泛滥**
   - 文件：quality-metrics.test.ts, grading.test.ts
   - 问题：60, 25, 20, 7 等硬编码值散布各处
   - 影响：难以理解阈值含义，修改时容易遗漏
   - 修复：定义常量 `THRESHOLDS`

2. **测试名称不够描述性**
   - 文件：多个文件
   - 问题："應該正確初始化"、"應該處理邊界值" 等太通用
   - 影响：失败时难以快速定位问题
   - 修复：使用具体的场景描述

3. **大量重复代码**
   - 文件：strategies.test.ts, grading.test.ts
   - 问题：相同测试逻辑重复 5+ 次
   - 影响：维护成本高，修改时容易不一致
   - 修复：使用 `it.each` 参数化测试

---

## 总体工作量预估

### 按优先级

| 优先级 | 文件数 | 预估工作量 | 预期收益 |
|--------|--------|------------|----------|
| 🔴 P0  | 5      | 8-14 小时  | 代码减少 30-60% |
| 🟡 P1  | 5      | 5-9 小时   | 代码减少 15-25% |
| 🟢 P2  | 5+     | 3-5 小时   | 代码减少 10-15% |
| **总计** | **15+** | **16-28 小时** | **平均减少 25%+ 代码** |

### 分阶段实施建议

#### 第一阶段（高影响，1-2 天）
- [ ] 创建测试辅助工具（test-data-factories.ts）✅ 已完成
- [ ] 创建最佳实践文档（TESTING_BEST_PRACTICES.md）✅ 已完成
- [ ] 改进 P0 优先级文件（grading.test.ts, strategies.test.ts）

#### 第二阶段（中影响，2-3 天）
- [ ] 改进剩余 P0 文件（quality-metrics.test.ts, file-index.test.ts, cli-deps.e2e.test.ts）
- [ ] 改进 P1 优先级文件

#### 第三阶段（低影响，1-2 天）
- [ ] 改进 P2 文件
- [ ] 全面代码审查
- [ ] 更新文档

---

## 成功指标

改进完成后，应该看到：

1. **代码量减少**：测试代码总行数减少 25% 以上
2. **重复度降低**：`it.each` 使用率提高到 30% 以上
3. **可维护性提升**：新增测试用例时间减少 50%
4. **可读性提升**：新团队成员理解测试的时间减少 40%
5. **工厂函数使用**：80% 以上的测试使用数据工厂函数

---

## 附录：常见模式统计

通过代码分析，发现以下重复模式：

| 模式 | 出现次数 | 文件数 | 改进方法 |
|------|----------|--------|----------|
| "應該回傳空陣列" | 93 | 14 | `it.each` + 工厂函数 |
| "應該處理..." | 250+ | 46 | 更具描述性的名称 |
| 手动创建 mock 对象 | 500+ | 所有 | 使用工厂函数 |
| 重复的策略测试 | 25 | 1 | `it.each` |
| 重复的等级测试 | 15 | 2 | `it.each` |

---

## 参考资料

- [TESTING_BEST_PRACTICES.md](./TESTING_BEST_PRACTICES.md) - 最佳实践指南
- [IMPROVEMENT_EXAMPLES.md](./IMPROVEMENT_EXAMPLES.md) - 具体改进示例
- [test-utils/test-data-factories.ts](./test-utils/test-data-factories.ts) - 测试工厂函数
