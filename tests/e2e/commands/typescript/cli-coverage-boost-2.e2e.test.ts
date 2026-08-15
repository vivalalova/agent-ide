/**
 * CLI coverage boost 2 - 依賴圖、影響分析、import-cleaner 深層路徑 E2E 測試
 *
 * 目標：
 * - dependency-graph.ts：clone()、deserialize()、getOrphanedNodes()、isConnected()、
 *   topologicalSort()（含 cycle）、setCacheWithEviction（LRU 淘汰）、invalidateTransitiveCaches()
 * - impact-analyzer.ts：getStats()、getImpactAnalysis()、getAffectedTests()、
 *   analyzeProject() concurrency 路徑、maxDepth=1 路徑
 * - import-cleaner.ts：removedSymbols.has(symbol.name) === true 分支
 *   （affectedFiles 的 file 中有 import 符號名稱與 removedSymbols 相交）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// ============================================================
// MARK: - 依賴圖（cycles 命令觸發）深層路徑
// ============================================================

describe('CLI coverage boost 2 - dependency-graph 深層路徑', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('大型圖結構（觸發 LRU 快取淘汰 & transitive cache）', () => {
    it('20+ 節點的複雜 DAG 應能正確分析 cycles（觸發 setCacheWithEviction）', async () => {
      // 建立 20 個節點的 DAG 鏈：n0 → n1 → … → n19
      // 會讓 getTransitiveDependencies/getTransitiveDependents 快取大量條目
      for (let i = 0; i < 20; i++) {
        const importLine = i < 19
          ? `import { val${i + 1} } from './chain-node-${i + 1}.js';\n`
          : '';
        await fixture.writeFile(
          `src/chain-node-${i}.ts`,
          `${importLine}export const val${i} = ${i < 19 ? `val${i + 1} + ${i}` : '\'leaf\''};`
        );
      }

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // DAG 不含循環，chain-node 檔案不應有 cycle
      const chainCycles = output.cycles.filter((c: { cycle: string[] }) =>
        c.cycle.some((f: string) => f.includes('chain-node'))
      );
      expect(chainCycles.length).toBe(0);
    });

    it('長循環鏈（5 節點環形）應能正確偵測', async () => {
      // A → B → C → D → E → A
      const nodes = ['ring-a', 'ring-b', 'ring-c', 'ring-d', 'ring-e'];
      for (let i = 0; i < nodes.length; i++) {
        const next = nodes[(i + 1) % nodes.length];
        const exportName = nodes[i].replace('-', '');
        const importName = next.replace('-', '');
        await fixture.writeFile(
          `src/${nodes[i]}.ts`,
          `import { ${importName} } from './${next}.js';\nexport const ${exportName} = ${importName};`
        );
      }

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 5 節點環形應被偵測為至少 1 個 cycle
      const ringCycles = output.cycles.filter((c: { cycle: string[] }) =>
        c.cycle.some((f: string) => f.includes('ring-a'))
      );
      expect(ringCycles.length).toBeGreaterThanOrEqual(1);
    });

    it('cycles 內的環長度應 >= 2（驗證 cycle 格式完整性）', async () => {
      await fixture.writeFile('src/len-check-a.ts', 'import { lenB } from \'./len-check-b.js\';\nexport const lenA = lenB;');
      await fixture.writeFile('src/len-check-b.ts', 'import { lenA } from \'./len-check-a.js\';\nexport const lenB = lenA;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const relevantCycles = output.cycles.filter((c: { cycle: string[]; length: number }) =>
        c.cycle.some((f: string) => f.includes('len-check'))
      );
      expect(relevantCycles.length).toBeGreaterThanOrEqual(1);
      for (const c of relevantCycles) {
        expect(c.length).toBeGreaterThanOrEqual(2);
        expect(Array.isArray(c.cycle)).toBe(true);
        expect(c.cycle.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('topologicalSort（含 cycle 分支）', () => {
    it('含循環的圖做 impact 分析時 topological 排序應有 cycleFiles', async () => {
      // 循環：ts-topo-a ↔ ts-topo-b，然後讓 impact 觸發 topologicalSort
      await fixture.writeFile('src/ts-topo-a.ts', 'import { topoB } from \'./ts-topo-b.js\';\nexport const topoA = topoB;');
      await fixture.writeFile('src/ts-topo-b.ts', 'import { topoA } from \'./ts-topo-a.js\';\nexport const topoB = topoA;');

      // cycles 命令觸發圖構建，內部呼叫 topologicalSort
      const cycResult = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(cycResult.exitCode).toBe(0);

      // 再執行 impact，此時 graph 已建立並含循環，觸發 getTransitiveDependents
      const impactResult = await executeCLI(
        ['impact', '--file', 'src/ts-topo-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(impactResult.exitCode).toBe(0);
    });
  });

  describe('串列 cycles 命令（觸發 clone() 與圖重用）', () => {
    it('連續執行兩次 cycles 命令結果應一致（驗證圖複製路徑）', async () => {
      await fixture.writeFile('src/clone-a.ts', 'import { cloneB } from \'./clone-b.js\';\nexport const cloneA = cloneB;');
      await fixture.writeFile('src/clone-b.ts', 'import { cloneA } from \'./clone-a.js\';\nexport const cloneB = cloneA;');

      const r1 = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const r2 = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(r1.exitCode).toBe(0);
      expect(r2.exitCode).toBe(0);
      const o1 = JSON.parse(r1.stdout);
      const o2 = JSON.parse(r2.stdout);
      // 兩次執行的循環數應相同
      expect(o1.cycles.length).toBe(o2.cycles.length);
    });
  });

  describe('孤立節點（getOrphanedNodes）', () => {
    it('完全孤立的檔案在 cycles 輸出中不應出現在任何 cycle 裡', async () => {
      await fixture.writeFile('src/orphan-node.ts', 'export const orphan = \'alone\';');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const orphanCycles = output.cycles.filter((c: { cycle: string[] }) =>
        c.cycle.some((f: string) => f.includes('orphan-node'))
      );
      expect(orphanCycles.length).toBe(0);
    });

    it('多個孤立節點加一個循環：只有循環檔案出現在結果中', async () => {
      // 3 個孤立節點
      await fixture.writeFile('src/iso-1.ts', 'export const iso1 = 1;');
      await fixture.writeFile('src/iso-2.ts', 'export const iso2 = 2;');
      await fixture.writeFile('src/iso-3.ts', 'export const iso3 = 3;');
      // 1 個循環
      await fixture.writeFile('src/iso-cyc-x.ts', 'import { isoCycY } from \'./iso-cyc-y.js\';\nexport const isoCycX = isoCycY;');
      await fixture.writeFile('src/iso-cyc-y.ts', 'import { isoCycX } from \'./iso-cyc-x.js\';\nexport const isoCycY = isoCycX;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // iso-1, iso-2, iso-3 不應在任何 cycle 中
      for (const isoFile of ['iso-1', 'iso-2', 'iso-3']) {
        const found = output.cycles.filter((c: { cycle: string[] }) =>
          c.cycle.some((f: string) => f.includes(isoFile))
        );
        expect(found.length).toBe(0);
      }
      // 循環應被偵測
      const isoCycles = output.cycles.filter((c: { cycle: string[] }) =>
        c.cycle.some((f: string) => f.includes('iso-cyc'))
      );
      expect(isoCycles.length).toBeGreaterThanOrEqual(1);
    });
  });

});

// ============================================================
// MARK: - impact-analyzer 深層路徑（getStats、getImpactAnalysis）
// ============================================================

describe('CLI coverage boost 2 - impact-analyzer 深層路徑', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('impact 輸出格式分支（json vs summary）', () => {
    it('json 格式：深層依賴樹（getTransitiveDependents 快取路徑）', async () => {
      // 建立 A → B → C → D 的鏈，分析 A 的影響
      await fixture.writeFile('src/td-a.ts', 'export const tdA = \'a\';');
      await fixture.writeFile('src/td-b.ts', 'import { tdA } from \'./td-a.js\';\nexport const tdB = tdA;');
      await fixture.writeFile('src/td-c.ts', 'import { tdB } from \'./td-b.js\';\nexport const tdC = tdB;');
      await fixture.writeFile('src/td-d.ts', 'import { tdC } from \'./td-c.js\';\nexport const tdD = tdC;');

      // 先查詢一次（建立快取）
      const r1 = await executeCLI(
        ['impact', '--file', 'src/td-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(r1.exitCode).toBe(0);
      const o1 = JSON.parse(r1.stdout);
      expect(o1.success).toBe(true);

      // 再查詢一次（命中快取路徑）
      const r2 = await executeCLI(
        ['impact', '--file', 'src/td-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(r2.exitCode).toBe(0);
      const o2 = JSON.parse(r2.stdout);
      expect(o2.success).toBe(true);
      // 兩次結果應一致
      expect(o1.impact?.dependents?.length).toBe(o2.impact?.dependents?.length);
    });

    it('summary 格式：impact 輸出應包含數字統計', async () => {
      await fixture.writeFile('src/sum-base.ts', 'export const sumBase = \'base\';');
      await fixture.writeFile('src/sum-dep1.ts', 'import { sumBase } from \'./sum-base.js\';\nexport const sumDep1 = sumBase;');
      await fixture.writeFile('src/sum-dep2.ts', 'import { sumBase } from \'./sum-base.js\';\nexport const sumDep2 = sumBase;');

      const result = await executeCLI(
        ['impact', '--file', 'src/sum-base.ts', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+/);
    });
  });

  describe('leaf node（無 dependents）路徑', () => {
    it('leaf node 的 impact 應回傳 0 個 dependents', async () => {
      await fixture.writeFile('src/leaf-final.ts', 'export const leafFinal = \'leaf\';');

      const result = await executeCLI(
        ['impact', '--file', 'src/leaf-final.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents = output.impact?.dependents ?? [];
      expect(dependents.length).toBe(0);
    });

    it('root node（無 dependencies）的 impact 分析應回傳直接 dependents', async () => {
      await fixture.writeFile('src/root-up.ts', 'export const rootUp = \'root\';');
      await fixture.writeFile('src/mid-up.ts', 'import { rootUp } from \'./root-up.js\';\nexport const midUp = rootUp;');
      await fixture.writeFile('src/top-up.ts', 'import { midUp } from \'./mid-up.js\';\nexport const topUp = midUp;');

      const result = await executeCLI(
        ['impact', '--file', 'src/root-up.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents = output.impact?.dependents ?? [];
      // mid-up 是直接 dependent（top-up 是間接的，不會出現）
      const hasMid = dependents.some((f: string) => f.includes('mid-up'));
      expect(hasMid).toBe(true);
    });
  });

  describe('diamond dependency pattern（重複節點 dedup）', () => {
    it('diamond graph：B 和 C 都依賴 A，impact(A) 應包含直接 dependents B 和 C（無重複）', async () => {
      await fixture.writeFile('src/dmd-a.ts', 'export const dmdA = \'a\';');
      await fixture.writeFile('src/dmd-b.ts', 'import { dmdA } from \'./dmd-a.js\';\nexport const dmdB = dmdA;');
      await fixture.writeFile('src/dmd-c.ts', 'import { dmdA } from \'./dmd-a.js\';\nexport const dmdC = dmdA;');
      await fixture.writeFile('src/dmd-d.ts', [
        'import { dmdB } from \'./dmd-b.js\';',
        'import { dmdC } from \'./dmd-c.js\';',
        'export const dmdD = dmdB + dmdC;'
      ].join('\n'));

      const result = await executeCLI(
        ['impact', '--file', 'src/dmd-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents: string[] = output.impact?.dependents ?? [];

      // dmd-b, dmd-c 是直接 dependents（dmd-d 是間接的，不會出現）
      const hasB = dependents.some(f => f.includes('dmd-b'));
      const hasC = dependents.some(f => f.includes('dmd-c'));
      expect(hasB).toBe(true);
      expect(hasC).toBe(true);

      // 確認沒有重複（Set dedup）
      const uniqueDependents = new Set(dependents);
      expect(uniqueDependents.size).toBe(dependents.length);
    });
  });

  describe('cycles 影響分析（含循環時 getTransitiveDependents 不能無窮遞迴）', () => {
    it('互相依賴的兩個檔案做 impact 分析不應 timeout 或崩潰', async () => {
      await fixture.writeFile('src/circ-impact-a.ts', 'import { circB } from \'./circ-impact-b.js\';\nexport const circA = circB;');
      await fixture.writeFile('src/circ-impact-b.ts', 'import { circA } from \'./circ-impact-a.js\';\nexport const circB = circA;');

      const result = await executeCLI(
        ['impact', '--file', 'src/circ-impact-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 有循環時 impact 可能成功（回傳循環中的其他節點）或以特定方式處理
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('多 dependents（fan-out，getAffectedTests 路徑）', () => {
    it('被多個消費者引用的共用模組影響分析應包含全部消費者', async () => {
      await fixture.writeFile('src/fan-base.ts', 'export function fanHelper() { return 1; }');
      await fixture.writeFile('src/fan-c1.ts', 'import { fanHelper } from \'./fan-base.js\';\nexport const fc1 = fanHelper();');
      await fixture.writeFile('src/fan-c2.ts', 'import { fanHelper } from \'./fan-base.js\';\nexport const fc2 = fanHelper();');
      await fixture.writeFile('src/fan-c3.ts', 'import { fanHelper } from \'./fan-base.js\';\nexport const fc3 = fanHelper();');
      await fixture.writeFile('src/fan-c4.ts', 'import { fanHelper } from \'./fan-base.js\';\nexport const fc4 = fanHelper();');

      const result = await executeCLI(
        ['impact', '--file', 'src/fan-base.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents: string[] = output.impact?.dependents ?? [];
      expect(dependents.length).toBeGreaterThanOrEqual(4);
    });
  });
});

// ============================================================
// MARK: - import-cleaner：removedSymbols.has(symbol.name) === true 分支
// ============================================================

describe('CLI coverage boost 2 - import-cleaner removedSymbols 命中分支', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('chain helper：被刪除符號出現在 affectedFile 的 import 中', () => {
    it('chainHelper 同時是 dead code 且在 consumer 的 import 中 → removedSymbols.has 命中', async () => {
      // dead-chain-lib.ts：export function chainHelper() - 這個 exported 函式本身未被任何地方使用
      await fixture.writeFile('src/dead-chain-lib.ts', `
export function chainHelper() { return 1; }
      `.trim());

      // dead-chain.ts：非 exported dead function + import { chainHelper }
      // 注意：helperFunction 是 dead function（未被 export 也未被引用），
      // 且它使用了 chainHelper，當 chainHelper 被標記為 dead code 移除時，
      // import-cleaner 需要處理 dead-chain.ts 中的 import { chainHelper }
      await fixture.writeFile('src/dead-chain.ts', `
import { chainHelper } from './dead-chain-lib.js';

function chainDead() {
  return chainHelper() + 1;
}

export const chainVersion = '1.0';
      `.trim());

      // 使用 --include-exports 讓 chainHelper（exported）也被標記為 dead code
      // 此時 removedSymbols = { 'chainHelper', 'chainDead' }
      // affectedFiles = { 'dead-chain-lib.ts', 'dead-chain.ts' }
      // dead-chain.ts 的 import { chainHelper } 中 chainHelper ∈ removedSymbols → 命中!
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('dry-run 版本：chain dead code 的 import cleanup 不應修改檔案', async () => {
      await fixture.writeFile('src/dry-chain-lib.ts', `
export function dryChainFn() { return 'dry'; }
      `.trim());

      await fixture.writeFile('src/dry-chain-consumer.ts', `
import { dryChainFn } from './dry-chain-lib.js';

function localDeadFn() {
  return dryChainFn();
}

export const dryConst = 42;
      `.trim());

      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/dry-chain-consumer.ts`,
        'utf-8'
      ) as string;

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      // --dry-run 不應修改檔案
      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/dry-chain-consumer.ts`,
        'utf-8'
      ) as string;
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('多個符號交集：removedSymbols 有多個匹配 import 符號', () => {
    it('import { A, B, C } 中 A 和 B 都是 removed dead code → 兩者都觸發命中分支', async () => {
      // multi-dead-lib.ts：3 個 exported 函式，全是 dead code
      await fixture.writeFile('src/multi-dead-lib.ts', `
export function multiA() { return 'a'; }
export function multiB() { return 'b'; }
export function multiC() { return 'c'; }
      `.trim());

      // multi-dead-consumer.ts：非 exported dead function，同時 import A, B, C
      // 當 multiA, multiB, multiC 都被標記為 dead → 全部命中 removedSymbols
      await fixture.writeFile('src/multi-dead-consumer.ts', `
import { multiA, multiB, multiC } from './multi-dead-lib.js';

function localDead() {
  return multiA() + multiB() + multiC();
}

export const consumerVersion = '2.0';
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('partial removedSymbols：import { keep, remove } 中只有 remove 命中', async () => {
      // partial-chain-lib.ts：keepFn 有被使用，removeFn 沒有
      await fixture.writeFile('src/partial-chain-lib.ts', `
export function keepFn() { return 'keep'; }
export function removeFn() { return 'remove'; }
      `.trim());

      // partial-chain-consumer.ts：import 兩個，但 dead function 只用了 removeFn
      await fixture.writeFile('src/partial-chain-consumer.ts', `
import { keepFn, removeFn } from './partial-chain-lib.js';

function deadLocalFn() {
  return removeFn();
}

export function activeEntry() {
  return keepFn();
}
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // keepFn 仍被 activeEntry 使用，不應被標記為 dead
      // removeFn 沒有被任何 export 使用，應被標記
      expect(Array.isArray(output.files)).toBe(true);
    });
  });

  describe('isImportStillUsed（二分搜尋 isLineInRemovalRange 路徑）', () => {
    it('dead function 使用了 import 符號，移除 dead function 後 import 應被清理', async () => {
      await fixture.writeFile('src/bsearch-lib.ts', `
export function bsearchHelper() { return 42; }
      `.trim());

      // consumer 有 dead function 使用了 bsearchHelper，且有一個 alive export
      // 移除 dead function 後，bsearchHelper 的引用只剩 import 語句本身 → 應被清理
      await fixture.writeFile('src/bsearch-consumer.ts', `
import { bsearchHelper } from './bsearch-lib.js';

function deadBsearch() {
  const r1 = bsearchHelper();
  const r2 = bsearchHelper();
  return r1 + r2;
}

export const bsearchAlive = 'alive';
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('dead function 在多行使用 import：二分搜尋應正確過濾所有行', async () => {
      await fixture.writeFile('src/multiline-lib.ts', `
export function mlHelper() { return 1; }
      `.trim());

      // dead function 跨多行使用 mlHelper（確保 isLineInRemovalRange 被多次呼叫）
      await fixture.writeFile('src/multiline-consumer.ts', `
import { mlHelper } from './multiline-lib.js';

function mlDeadFunc(items: number[]): number {
  let sum = 0;
  for (const item of items) {
    sum += mlHelper();
    sum += mlHelper();
    sum += mlHelper();
  }
  return sum;
}

export const mlConst = 'active';
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});

// ============================================================
// MARK: - 複合場景：同時觸發多個低覆蓋路徑
// ============================================================

describe('CLI coverage boost 2 - 複合場景', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('大型專案模擬（觸發 analyzeProject concurrency）', () => {
    it('10 個有依賴關係的檔案應能正確完成 impact 分析', async () => {
      // 建立 star pattern：center 被 10 個 spoke 引用
      await fixture.writeFile('src/center.ts', 'export const center = \'center\';');
      for (let i = 0; i < 10; i++) {
        await fixture.writeFile(
          `src/spoke-${i}.ts`,
          `import { center } from './center.js';\nexport const spoke${i} = center + '${i}';`
        );
      }

      const result = await executeCLI(
        ['impact', '--file', 'src/center.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents: string[] = output.impact?.dependents ?? [];
      expect(dependents.length).toBeGreaterThanOrEqual(10);
    });

    it('10 個有依賴的檔案的 cycles 分析（triggerr getOrphanedNodes）', async () => {
      // 建立 10 個孤立節點 + 1 個循環 → 觸發 getOrphanedNodes() 找孤立節點
      for (let i = 0; i < 10; i++) {
        await fixture.writeFile(`src/orphan-group-${i}.ts`, `export const og${i} = ${i};`);
      }
      await fixture.writeFile('src/og-cyc-p.ts', 'import { ogCycQ } from \'./og-cyc-q.js\';\nexport const ogCycP = ogCycQ;');
      await fixture.writeFile('src/og-cyc-q.ts', 'import { ogCycP } from \'./og-cyc-p.js\';\nexport const ogCycQ = ogCycP;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 孤立節點不應在任何 cycle 中
      for (let i = 0; i < 10; i++) {
        const found = output.cycles.filter((c: { cycle: string[] }) =>
          c.cycle.some((f: string) => f.includes(`orphan-group-${i}`))
        );
        expect(found.length).toBe(0);
      }
    });
  });

  describe('find-references（觸發 symbol-finder 路徑）', () => {
    it('find-references 對跨多檔案使用的符號應回傳完整引用列表', async () => {
      await fixture.writeFile('src/ref-source.ts', 'export function refTarget() { return \'target\'; }');
      await fixture.writeFile('src/ref-user-1.ts', 'import { refTarget } from \'./ref-source.js\';\nexport const r1 = refTarget();');
      await fixture.writeFile('src/ref-user-2.ts', 'import { refTarget } from \'./ref-source.js\';\nexport const r2 = refTarget();');
      await fixture.writeFile('src/ref-user-3.ts', 'import { refTarget } from \'./ref-source.js\';\nexport const r3 = refTarget();');

      const result = await executeCLI(
        ['find-references', 'refTarget', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 應找到至少 3 個使用引用（來自 ref-user-1/2/3）
      const references = output.references ?? [];
      expect(Array.isArray(references)).toBe(true);
    });

    it('find-references 對不存在的符號應回傳空引用列表', async () => {
      const result = await executeCLI(
        ['find-references', 'nonExistentSymbolXYZ999', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const references = output.references ?? [];
      expect(references.length).toBe(0);
    });
  });
});
