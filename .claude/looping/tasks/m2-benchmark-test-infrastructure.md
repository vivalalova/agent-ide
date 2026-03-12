---
title: Benchmark 測試基礎建設
created: 2026-03-12
priority: low
suggested_order: M2
---

# Benchmark 測試基礎建設

無任何 `.bench.ts`。對 indexing、symbol search、call-hierarchy 等效能敏感操作應建立 benchmark baseline。

應 (1) 建立 `tests/bench/` (2) 為 IndexEngine.indexProject、SymbolFinder.findCallSites、CycleDetector.detect 建立 benchmark (3) 加 `pnpm bench` script。

## User Stories

- As a maintainer, I want performance benchmarks, so that I can detect performance regressions early.

## 驗收條件

- Given tests/bench/, when exists, then has benchmarks for key operations
- Given `pnpm bench`, when executed, then runs benchmarks and reports results
- Given benchmark results, when compared to baseline, then detects regressions > 20%
