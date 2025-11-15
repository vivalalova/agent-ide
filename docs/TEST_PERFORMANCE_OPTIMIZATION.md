# 测试性能优化报告

**生成时间**: 2025-11-15
**当前测试执行时间**: 28.94s (1167 tests)
**目标执行时间**: <20s

## 执行概况

- **总测试数**: 1167
- **总文件数**: 37
- **总执行时间**: 28.94s
- **平均每个测试**: 30.89ms
- **测试分布**:
  - <30ms: 661 (56.6%)
  - 30-50ms: 477 (40.9%)
  - 50-100ms: 28 (2.4%)
  - >100ms: 1 (0.1%)

## 性能瓶颈分析

### 1. 最慢的测试

| 排名 | 耗时 | 文件 | 测试名称 |
|------|------|------|----------|
| 1 | 131ms | text-engine.test.ts | 應該在超時時停止搜尋 |
| 2 | 93ms | extract-function.test.ts | 應該支援不同的插入點 |
| 3 | 77ms | registry.test.ts | 應該回傳相同的實例 |

### 2. 最慢的测试文件 (Top 5)

| 排名 | 总耗时 | 测试数 | 平均耗时 | 文件 |
|------|--------|--------|----------|------|
| 1 | 2049ms | 57 | 35.9ms | index-engine.test.ts |
| 2 | 1787ms | 59 | 30.3ms | import-resolver.test.ts |
| 3 | 1593ms | 50 | 31.9ms | file-system.test.ts |
| 4 | 1572ms | 52 | 30.2ms | file-index.test.ts |
| 5 | 1443ms | 51 | 28.3ms | symbol-index.test.ts |

### 3. 性能问题根因

#### 问题1: Setup/Teardown 开销大
- **影响范围**: 所有测试文件
- **问题描述**: 94个 beforeEach/afterEach 钩子，每个测试前后都需要重新设置mock
- **影响时间**: ~10-15秒 (setup: 49.98s累积)

#### 问题2: Mock设置复杂
- **影响文件**: index-engine.test.ts, file-system.test.ts
- **问题描述**: 每个测试都重新mock整个fs/promises、glob、crypto模块
- **影响时间**: ~3-5秒

#### 问题3: 不必要的延迟
- **影响文件**: text-engine.test.ts
- **问题描述**: 测试"應該在超時時停止搜尋"使用了100ms的setTimeout
- **影响时间**: ~131ms

#### 问题4: Worker进程开销
- **配置**: pool: 'forks', maxWorkers: 4
- **问题描述**: Fork进程有启动开销，对于小型快速测试不是最优
- **影响时间**: ~2-3秒

## 优化建议 (按收益排序)

### 🥇 优先级1: 高收益优化 (预计节省 8-12秒)

#### 1.1 优化Mock策略 ⭐⭐⭐⭐⭐
**预计节省**: 5-8秒

**问题分析**:
```typescript
// 当前做法 (index-engine.test.ts)
beforeEach(async () => {
  vi.clearAllMocks();
  
  // 每次都重新设置所有mock
  const fs = await import('fs/promises');
  vi.mocked(fs.stat).mockResolvedValue(/* ... */);
  vi.mocked(fs.readFile).mockResolvedValue(/* ... */);
  // ... 更多mock设置
});
```

**优化方案**:
```typescript
// 在文件顶层设置一次mock
vi.mock('fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({
    isDirectory: () => true,
    isFile: () => true,
    size: 1000,
    mtime: new Date('2024-01-01')
  }),
  readFile: vi.fn().mockResolvedValue('export function test() {}'),
  access: vi.fn().mockResolvedValue(undefined)
}));

// beforeEach中只重置mock调用记录，不重新设置
beforeEach(() => {
  vi.clearAllMocks(); // 只清除调用历史
});
```

**影响文件**:
- tests/unit/core/indexing/index-engine.test.ts
- tests/unit/infrastructure/storage/file-system.test.ts
- tests/unit/core/search/text-engine.test.ts

#### 1.2 切换到Threads池 ⭐⭐⭐⭐
**预计节省**: 2-3秒

**当前配置**:
```typescript
// vitest.unit.config.ts
test: {
  pool: 'forks',  // Fork进程，启动慢
  maxWorkers: 4,
}
```

**优化配置**:
```typescript
test: {
  pool: 'threads',  // 使用线程池，启动快
  maxWorkers: 8,    // 可以增加worker数量
  poolOptions: {
    threads: {
      singleThread: false,
      isolate: false  // 对于纯mock测试可以禁用隔离
    }
  }
}
```

**原因**: 对于大量使用mock的单元测试，线程池比fork进程更快，启动开销更小。

#### 1.3 减少重复的动态import ⭐⭐⭐⭐
**预计节省**: 1-2秒

**问题代码** (index-engine.test.ts):
```typescript
beforeEach(async () => {
  // 每个测试都重新import
  const fs = await import('fs/promises');
  const { glob } = await import('glob');
  const crypto = await import('crypto');
  const { ParserRegistry } = await import('@infrastructure/parser');
  // ...
});
```

**优化方案**:
```typescript
// 在文件顶层import一次
import fs from 'fs/promises';
import { glob } from 'glob';
import crypto from 'crypto';
import { ParserRegistry } from '@infrastructure/parser';

beforeEach(() => {
  // 只重置mock状态
  vi.clearAllMocks();
});
```

### 🥈 优先级2: 中等收益优化 (预计节省 3-5秒)

#### 2.1 优化慢速测试 ⭐⭐⭐
**预计节省**: 0.2秒

**问题测试**:
```typescript
// text-engine.test.ts:706-730
it('應該在超時時停止搜尋', async () => {
  vi.mocked(readFile).mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 100)); // ❌ 太慢
    return mockContent;
  });
  // ...
});
```

**优化方案**:
```typescript
it('應該在超時時停止搜尋', async () => {
  vi.mocked(readFile).mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 10)); // ✅ 减少到10ms
    return mockContent;
  });
  
  const query: TextQuery = {
    type: 'text',
    query: 'test',
    options: {
      scope: { type: 'project' },
      timeout: 5 // 相应减少超时时间
    }
  };
  // ...
});
```

#### 2.2 启用测试并行化 ⭐⭐⭐
**预计节省**: 2-4秒

**当前配置**:
```typescript
test: {
  maxConcurrency: 5  // 较低的并发数
}
```

**优化配置**:
```typescript
test: {
  maxConcurrency: 10,  // 增加并发数
  
  // 对于快速测试可以在文件内并行
  fileParallelism: true,
  
  // 序列化慢速测试文件
  sequence: {
    shuffle: false,
    concurrent: true
  }
}
```

**注意**: 需要确保测试之间没有共享状态。

#### 2.3 合并相似测试 ⭐⭐
**预计节省**: 0.5-1秒

**问题**: 一些测试文件有很多微小差异的测试用例

**示例** (import-resolver.test.ts 有59个测试):
```typescript
// 当前: 每个引号类型一个测试
it('應該解析使用單引號的 import', async () => {
  // test with single quotes
});
it('應該解析使用雙引號的 import', async () => {
  // test with double quotes
});
it('應該解析使用反引號的 import', async () => {
  // test with backticks
});
```

**优化**:
```typescript
it('應該解析不同引號類型的 import', async () => {
  const testCases = [
    { type: 'single', code: "import { a } from 'module'" },
    { type: 'double', code: 'import { a } from "module"' },
    { type: 'backtick', code: 'import { a } from `module`' }
  ];
  
  for (const { type, code } of testCases) {
    const result = resolver.parseImportStatements(code);
    expect(result).toBeDefined();
  }
});
```

**注意**: 只合并真正相似的测试，不要影响可读性和调试能力。

### 🥉 优先级3: 低收益优化 (预计节省 1-2秒)

#### 3.1 缓存测试setup ⭐⭐
**预计节省**: 0.5-1秒

创建测试工具函数减少重复代码:

```typescript
// tests/helpers/test-utils.ts
export function createMockFileSystem() {
  const fs = vi.mocked(await import('fs/promises'));
  fs.stat.mockResolvedValue({
    isDirectory: () => true,
    isFile: () => true,
    size: 1000,
    mtime: new Date('2024-01-01')
  });
  return fs;
}

// 在测试中使用
beforeEach(() => {
  createMockFileSystem();
});
```

#### 3.2 优化clearMocks配置 ⭐
**预计节省**: 0.3-0.5秒

**当前配置**:
```typescript
test: {
  clearMocks: true,      // 每个测试后清除
  restoreMocks: true,    // 每个测试后恢复
  unstubEnvs: true,      // 每个测试后清理环境变量
  unstubGlobals: true,   // 每个测试后清理全局变量
}
```

**优化**: 如果测试之间不共享状态，可以禁用部分自动清理:
```typescript
test: {
  clearMocks: true,      // 保持
  restoreMocks: false,   // 在需要时手动调用
  unstubEnvs: false,     // 如果不使用可以禁用
  unstubGlobals: false,  // 如果不使用可以禁用
}
```

#### 3.3 使用test.each减少重复 ⭐
**预计节省**: 0.2-0.5秒

```typescript
// 优化前
describe('大小寫敏感搜尋', () => {
  it('應該支援大小寫不敏感搜尋（預設）', async () => { /* ... */ });
  it('應該支援大小寫敏感搜尋', async () => { /* ... */ });
});

// 优化后
describe('大小寫敏感搜尋', () => {
  it.each([
    { caseSensitive: false, expected: 3, description: '不敏感' },
    { caseSensitive: true, expected: 1, description: '敏感' }
  ])('應該支援大小寫$description搜尋', async ({ caseSensitive, expected }) => {
    const query = { /* ... */, options: { caseSensitive } };
    const result = await engine.search(query);
    expect(result.matches.length).toBe(expected);
  });
});
```

## 优化实施计划

### Phase 1: 快速修复 (预计1小时，节省8-10秒)
1. ✅ 切换到threads池
2. ✅ 优化text-engine.test.ts的慢速测试
3. ✅ 移除beforeEach中的动态import

### Phase 2: 重构mock (预计3-4小时，节省5-8秒)
1. ✅ 重构index-engine.test.ts的mock设置
2. ✅ 重构file-system.test.ts的mock设置
3. ✅ 创建通用的mock工具函数

### Phase 3: 测试优化 (预计2-3小时，节省2-4秒)
1. ✅ 增加并发配置
2. ✅ 合并相似测试用例
3. ✅ 使用test.each重构重复测试

## 预期结果

| 阶段 | 当前耗时 | 优化后耗时 | 节省时间 | 改进百分比 |
|------|----------|------------|----------|------------|
| 当前 | 28.94s | - | - | - |
| Phase 1 | 28.94s | 18-20s | 8-10s | ~35% |
| Phase 2 | 18-20s | 12-15s | 6-8s | ~40% |
| Phase 3 | 12-15s | 10-12s | 2-4s | ~20% |
| **总计** | **28.94s** | **10-12s** | **16-22s** | **~60-75%** |

## 性能监控

已创建性能监控脚本 `scripts/test-performance-monitor.js`

### 使用方法

```bash
# 建立性能基准
node scripts/test-performance-monitor.js --baseline

# 运行测试并与基准比较
node scripts/test-performance-monitor.js --compare

# 只生成报告
node scripts/test-performance-monitor.js --report
```

### CI集成

在 `.github/workflows/test.yml` 中添加:

```yaml
- name: Test Performance Check
  run: node scripts/test-performance-monitor.js --compare
```

这将在CI中自动检测性能退化。

## 长期优化建议

### 1. 考虑快照测试
对于不常变化的输出，使用快照测试可以减少断言代码:
```typescript
expect(result).toMatchSnapshot();
```

### 2. 分离集成测试
将需要真实文件I/O的测试移到E2E测试套件:
- 单元测试: <15s
- E2E测试: 可以较慢，但提供真实场景验证

### 3. 使用测试覆盖率缓存
只测试改变的文件:
```typescript
test: {
  coverage: {
    provider: 'v8',
    all: false,  // 不收集所有文件的覆盖率
    skipFull: true  // 跳过100%覆盖的文件
  }
}
```

### 4. 考虑并行测试运行器
对于大型项目，可以考虑:
- Jest (可能比vitest更快对某些项目)
- Bun test (极快的测试运行器)
- 分布式测试 (在多台机器上运行)

## 严重性能问题

### ⚠️ 立即需要修复

**无**。当前没有严重的性能问题。

### 📊 需要关注

1. **Setup开销**: 49.98s的累积setup时间表明beforeEach有优化空间
2. **单个慢速测试**: text-engine.test.ts的131ms测试应该优化
3. **大型测试文件**: index-engine.test.ts (57 tests), import-resolver.test.ts (59 tests) 可以考虑拆分

## 结论

当前测试套件性能**良好但有优化空间**:
- ✅ 没有超过1秒的测试文件
- ✅ 97.5%的测试在50ms以内
- ✅ 平均测试时间30.89ms是可接受的
- ⚠️ 总执行时间28.94s对于1167个测试稍长
- ⚠️ Setup/teardown开销可以优化

通过实施上述优化，可以将测试执行时间**减少60-75%**，从28.94s降至**10-12秒**。

这将显著改善开发体验，使TDD工作流更加流畅。
