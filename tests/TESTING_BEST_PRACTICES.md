# 测试最佳实践指南

本文档提供 Agent IDE 项目的测试编写最佳实践，旨在提高测试代码的可读性和可维护性。

## 目录

1. [测试命名规范](#测试命名规范)
2. [使用 it.each 减少重复](#使用-iteach-减少重复)
3. [辅助函数和测试工具](#辅助函数和测试工具)
4. [断言最佳实践](#断言最佳实践)
5. [Mock 和 Fixture 管理](#mock-和-fixture-管理)
6. [常见模式](#常见模式)

---

## 测试命名规范

### ✅ 好的命名

测试名称应该清晰描述：
- **被测试的场景**
- **预期的行为**
- **具体的条件**（如果有）

```typescript
// ✅ 具体且描述性强
it('应该在检测到循环依赖时返回包含路径的数组', () => {})
it('应该在文件大小超过 1MB 时抛出错误', () => {})
it('应该将评分 85-100 映射到 F 等级', () => {})

// ✅ 使用领域术语
it('应该使用 Tarjan 算法检测强连通分量', () => {})
it('应该在索引更新时触发文件监听器回调', () => {})
```

### ❌ 避免的命名

```typescript
// ❌ 太通用
it('应该正确初始化', () => {})
it('应该处理边界值', () => {})
it('应该正常工作', () => {})

// ❌ 不描述预期行为
it('测试 getGrade 方法', () => {})
it('验证输入', () => {})
```

---

## 使用 it.each 减少重复

### 示例 1: 评级边界测试

**❌ Before（重复代码）**

```typescript
it('应该回傳 A 級（0-29）', () => {
  const grade = grading.getGrade(15);
  expect(grade.level).toBe(GradeLevel.A);
  expect(grade.emoji).toBe('✅');
});

it('应该回傳 B 級（30-49）', () => {
  const grade = grading.getGrade(40);
  expect(grade.level).toBe(GradeLevel.B);
  expect(grade.emoji).toBe('⚠️');
});

it('应该回傳 C 級（50-69）', () => {
  const grade = grading.getGrade(60);
  expect(grade.level).toBe(GradeLevel.C);
  expect(grade.emoji).toBe('💩');
});
```

**✅ After（使用 it.each）**

```typescript
it.each([
  { score: 15, expectedLevel: GradeLevel.A, expectedEmoji: '✅', range: '0-29' },
  { score: 40, expectedLevel: GradeLevel.B, expectedEmoji: '⚠️', range: '30-49' },
  { score: 60, expectedLevel: GradeLevel.C, expectedEmoji: '💩', range: '50-69' },
  { score: 75, expectedLevel: GradeLevel.D, expectedEmoji: '💩💩', range: '70-84' },
  { score: 90, expectedLevel: GradeLevel.F, expectedEmoji: '💩💩💩', range: '85-100' },
])('应该将评分 $score ($range) 映射到 $expectedLevel 等级', ({ score, expectedLevel, expectedEmoji }) => {
  const grade = grading.getGrade(score);
  expect(grade.level).toBe(expectedLevel);
  expect(grade.emoji).toBe(expectedEmoji);
});
```

### 示例 2: 缓存策略工厂测试

**❌ Before（重复代码）**

```typescript
it('应该创建 LRU 策略', () => {
  const strategy = StrategyFactory.createStrategy(EvictionStrategy.LRU);
  expect(strategy).toBeInstanceOf(LRUStrategy);
  expect(strategy.name).toBe(EvictionStrategy.LRU);
});

it('应该创建 LFU 策略', () => {
  const strategy = StrategyFactory.createStrategy(EvictionStrategy.LFU);
  expect(strategy).toBeInstanceOf(LFUStrategy);
  expect(strategy.name).toBe(EvictionStrategy.LFU);
});
```

**✅ After（使用 it.each）**

```typescript
it.each([
  { type: EvictionStrategy.LRU, expectedClass: LRUStrategy },
  { type: EvictionStrategy.LFU, expectedClass: LFUStrategy },
  { type: EvictionStrategy.FIFO, expectedClass: FIFOStrategy },
  { type: EvictionStrategy.TTL, expectedClass: TTLStrategy },
  { type: EvictionStrategy.RANDOM, expectedClass: RandomStrategy },
])('应该创建 $type 策略', ({ type, expectedClass }) => {
  const strategy = StrategyFactory.createStrategy(type);
  expect(strategy).toBeInstanceOf(expectedClass);
  expect(strategy.name).toBe(type);
});
```

### 示例 3: 边界值测试

**❌ Before**

```typescript
it('应该处理邊界值', () => {
  expect(grading.getGrade(0).level).toBe(GradeLevel.A);
  expect(grading.getGrade(29).level).toBe(GradeLevel.A);
  expect(grading.getGrade(30).level).toBe(GradeLevel.B);
  expect(grading.getGrade(100).level).toBe(GradeLevel.F);
});
```

**✅ After**

```typescript
it.each([
  { score: 0, expectedLevel: GradeLevel.A, description: '最小值' },
  { score: 29, expectedLevel: GradeLevel.A, description: 'A 级上限' },
  { score: 30, expectedLevel: GradeLevel.B, description: 'B 级下限' },
  { score: 49, expectedLevel: GradeLevel.B, description: 'B 级上限' },
  { score: 100, expectedLevel: GradeLevel.F, description: '最大值' },
])('应该在边界值 $score ($description) 返回 $expectedLevel 等级', ({ score, expectedLevel }) => {
  expect(grading.getGrade(score).level).toBe(expectedLevel);
});
```

---

## 辅助函数和测试工具

### 创建测试数据工厂

**❌ Before（每个测试都创建 mock 数据）**

```typescript
it('测试 A', () => {
  const item: CacheItem<string> = { 
    value: 'v1', 
    createdAt: Date.now(), 
    lastAccessedAt: Date.now(), 
    accessCount: 0, 
    size: 10 
  };
  // ...
});

it('测试 B', () => {
  const item: CacheItem<string> = { 
    value: 'v2', 
    createdAt: Date.now(), 
    lastAccessedAt: Date.now(), 
    accessCount: 0, 
    size: 10 
  };
  // ...
});
```

**✅ After（使用工厂函数）**

```typescript
// test-helpers.ts
export function createCacheItem<T>(
  value: T, 
  overrides?: Partial<CacheItem<T>>
): CacheItem<T> {
  const now = Date.now();
  return {
    value,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    size: 10,
    ...overrides,
  };
}

export function createFileInfo(overrides?: Partial<FileInfo>): FileInfo {
  return {
    filePath: '/workspace/src/file.ts',
    lastModified: new Date('2024-01-01'),
    size: 1000,
    extension: '.ts',
    language: 'typescript',
    checksum: 'abc123',
    ...overrides,
  };
}

// 测试中使用
it('测试 A', () => {
  const item = createCacheItem('v1');
  // ...
});

it('测试 B', () => {
  const item = createCacheItem('v2', { accessCount: 5 });
  // ...
});
```

### 常用断言辅助函数

```typescript
// test-helpers.ts
export function expectToBeInRange(value: number, min: number, max: number) {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

export function expectValidShitScore(score: number) {
  expectToBeInRange(score, 0, 100);
}

// 使用
it('应该返回有效的评分', () => {
  const result = analyzer.calculate();
  expectValidShitScore(result.shitScore);
});
```

---

## 断言最佳实践

### 1. 使用具体的断言

```typescript
// ❌ 太宽泛
expect(result).toBeTruthy();

// ✅ 具体明确
expect(result.success).toBe(true);
expect(result.errors).toHaveLength(0);
```

### 2. 先断言成功，再断言细节

```typescript
// ✅ 清晰的断言顺序
it('应该成功提取函数', async () => {
  const result = await extractor.extract(code, selection, config);
  
  // 1. 先验证操作成功
  expect(result.success).toBe(true);
  
  // 2. 再验证具体细节
  expect(result.functionName).toBe('calculateSum');
  expect(result.edits.length).toBeGreaterThan(0);
  expect(result.errors).toHaveLength(0);
});
```

### 3. 避免在单个测试中测试太多内容

```typescript
// ❌ 测试太多内容
it('应该处理所有情况', () => {
  expect(func(0)).toBe('A');
  expect(func(30)).toBe('B');
  expect(func(50)).toBe('C');
  expect(() => func(-1)).toThrow();
  expect(() => func(101)).toThrow();
});

// ✅ 拆分为多个测试或使用 it.each
describe('getGrade', () => {
  it.each([...])('应该正确映射分数到等级', () => {});
  it.each([...])('应该在无效分数时抛出错误', () => {});
});
```

---

## Mock 和 Fixture 管理

### 1. 在 beforeEach 中初始化共享状态

```typescript
describe('FileIndex', () => {
  let fileIndex: FileIndex;
  let mockConfig: IndexConfig;
  let mockFileInfo: FileInfo;

  beforeEach(() => {
    mockConfig = createIndexConfig();
    mockFileInfo = createFileInfo();
    fileIndex = new FileIndex(mockConfig);
  });

  it('测试 A', () => {
    // 使用 fileIndex, mockConfig, mockFileInfo
  });
});
```

### 2. 使用常量避免魔术值

```typescript
// ❌ 魔术数字
it('应该检测长方法', () => {
  const code = Array(60).fill('console.log("line");').join('\n');
  // ...
});

// ✅ 使用命名常量
const LONG_METHOD_THRESHOLD = 60;

it('应该检测超过阈值的长方法', () => {
  const code = Array(LONG_METHOD_THRESHOLD).fill('console.log("line");').join('\n');
  // ...
});
```

---

## 常见模式

### 模式 1: 测试错误处理

```typescript
describe('错误处理', () => {
  it.each([
    { input: null, expectedError: '程式碼必須是字串' },
    { input: undefined, expectedError: '程式碼必須是字串' },
    { input: 123, expectedError: '程式碼必須是字串' },
  ])('应该在输入为 $input 时抛出错误', async ({ input, expectedError }) => {
    await expect(extractor.extract(input as any, selection))
      .rejects.toThrow(expectedError);
  });
});
```

### 模式 2: 测试异步操作

```typescript
// ✅ 清晰的异步测试
it('应该异步加载文件索引', async () => {
  const promise = fileIndex.load();
  
  // 验证加载状态
  expect(fileIndex.isLoading()).toBe(true);
  
  // 等待完成
  await promise;
  
  // 验证完成状态
  expect(fileIndex.isLoading()).toBe(false);
  expect(fileIndex.getTotalFiles()).toBeGreaterThan(0);
});
```

### 模式 3: 测试状态转换

```typescript
it.each([
  { from: 'idle', to: 'loading', action: 'load' },
  { from: 'loading', to: 'ready', action: 'finishLoad' },
  { from: 'ready', to: 'error', action: 'fail' },
])('应该从 $from 状态转换到 $to 状态', ({ from, to, action }) => {
  stateMachine.setState(from);
  stateMachine[action]();
  expect(stateMachine.getState()).toBe(to);
});
```

---

## E2E 测试最佳实践

### 1. 使用描述性的 fixture 名称

```typescript
// ✅ 清晰的 fixture 使用
describe('CLI deps 命令 - 循环依赖检测', () => {
  const fixturePath = getFixturePath('sample-project');
  
  beforeEach(async () => {
    await resetFixtures();
  });
  
  it('应该检测手动创建的双向循环依赖', async () => {
    // 创建具体的循环依赖场景
    await createCircularDependency(fixturePath, 'service-a', 'service-b');
    
    const result = await analyzeDependencies(fixturePath);
    
    expect(result.stdout).toMatch(/cycle|circular|循環/);
  });
});
```

### 2. 分离测试场景

```typescript
// ✅ 按功能分组
describe('CLI shit 命令', () => {
  describe('基本功能', () => {
    it('应该输出 JSON 格式评分', async () => {});
    it('应该包含四大维度评分', async () => {});
  });
  
  describe('--detailed 参数', () => {
    it('应该输出详细建议', async () => {});
    it('应该输出 topShit 列表', async () => {});
  });
  
  describe('--max-allowed 参数', () => {
    it('应该在超过阈值时退出码为 1', async () => {});
    it('应该在低于阈值时退出码为 0', async () => {});
  });
});
```

---

## 总结检查清单

在编写或审查测试时，检查以下几点：

- [ ] 测试名称清晰描述了**场景**和**预期行为**
- [ ] 使用 `it.each` 消除了重复的测试模式
- [ ] 提取了可复用的辅助函数和工厂方法
- [ ] 断言具体且有意义
- [ ] 避免了魔术数字和硬编码值
- [ ] beforeEach 正确初始化了共享状态
- [ ] 异步测试正确使用了 async/await
- [ ] E2E 测试使用了清晰的 fixture 和辅助函数
- [ ] 测试按功能逻辑分组（使用 describe）
- [ ] 每个测试只测试一个具体的行为

---

**参考资料**

- [Vitest API 文档](https://vitest.dev/api/)
- [测试驱动开发（TDD）最佳实践](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [CLAUDE.md 项目规范](/CLAUDE.md)
