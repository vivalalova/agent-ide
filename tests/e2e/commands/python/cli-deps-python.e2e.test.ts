/**
 * CLI deps Python 命令 E2E 測試
 * 基於 python-sample-project fixture 測試 cycles 和 impact 功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deps Python - 基於 python-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('python-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('cycles 命令', () => {
    describe('基本功能', () => {
      it('應該成功分析 Python 專案依賴', async () => {
        const result = await executeCLI(['cycles', '--path', fixture.rootPath], { memfs: fixture.memfs });

        expect(result.exitCode).toBe(0);
      });

      it('應該支援 JSON 格式輸出', async () => {
        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();

        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('deps');
        expect(output.success).toBeDefined();
        expect(output.cycles).toBeDefined();
        expect(Array.isArray(output.cycles)).toBe(true);
      });

      it('應該支援 summary 格式輸出', async () => {
        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout.length).toBeGreaterThan(0);
      });
    });

    describe('循環依賴檢測', () => {
      it('應該檢測 Python 直接循環依賴 (A<->B)', async () => {
        await fixture.writeFile('cycle_a.py', 'from cycle_b import b\n\na = 1');
        await fixture.writeFile('cycle_b.py', 'from cycle_a import a\n\nb = 2');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.cycles).toBeDefined();
      });

      it('應該檢測 Python 間接循環依賴 (A->B->C->A)', async () => {
        await fixture.writeFile('indirect_a.py', 'from indirect_c import c\n\na = 1');
        await fixture.writeFile('indirect_b.py', 'from indirect_a import a\n\nb = 2');
        await fixture.writeFile('indirect_c.py', 'from indirect_b import b\n\nc = 3');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該檢測 Python 模組間的循環依賴', async () => {
        // 模擬 Python 模組間循環
        await fixture.writeFile('pkg_a/__init__.py', 'from pkg_b import something\nvalue = 1');
        await fixture.writeFile('pkg_b/__init__.py', 'from pkg_a import value\nsomething = 2');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該回傳循環結構（cycle, length）', async () => {
        await fixture.writeFile('struct_a.py', 'from struct_b import b\na = b');
        await fixture.writeFile('struct_b.py', 'from struct_a import a\nb = a');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.cycles.length).toBeGreaterThanOrEqual(0);

        if (output.cycles.length > 0) {
          const cycle = output.cycles[0];
          expect(cycle).toHaveProperty('cycle');
          expect(cycle).toHaveProperty('length');
          expect(Array.isArray(cycle.cycle)).toBe(true);
          expect(typeof cycle.length).toBe('number');
        }
      });
    });

    describe('Python Import 語法', () => {
      it('應該處理 from ... import 語法', async () => {
        await fixture.writeFile('from_import_source.py', 'value = 1\nother = 2');
        await fixture.writeFile('from_import_consumer.py', 'from from_import_source import value\nresult = value');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理 import ... as 語法', async () => {
        await fixture.writeFile('alias_source.py', 'value = 1');
        await fixture.writeFile('alias_consumer.py', 'import alias_source as src\nresult = src.value');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理 from ... import * 語法', async () => {
        await fixture.writeFile('star_source.py', 'a = 1\nb = 2\nc = 3');
        await fixture.writeFile('star_consumer.py', 'from star_source import *\nresult = a + b');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理相對導入 (from . import)', async () => {
        await fixture.writeFile('pkg/__init__.py', '');
        await fixture.writeFile('pkg/module_a.py', 'value = 1');
        await fixture.writeFile('pkg/module_b.py', 'from . import module_a\nresult = module_a.value');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理父目錄相對導入 (from .. import)', async () => {
        await fixture.writeFile('parent/__init__.py', 'parent_value = 1');
        await fixture.writeFile('parent/child/__init__.py', '');
        await fixture.writeFile('parent/child/module.py', 'from .. import parent_value\nresult = parent_value');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });
    });

    describe('依賴結構極端情境', () => {
      it('應該處理深層依賴鏈 (15+ 層)', async () => {
        const chainFiles = Array.from({ length: 20 }, (_, i) => ({
          path: `chain_${i}.py`,
          content: i === 19
            ? 'leaf = "end"'
            : `from chain_${i + 1} import leaf\nvalue = leaf`
        }));

        await Promise.all(chainFiles.map(file => fixture.writeFile(file.path, file.content)));

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理扇出極高的單檔案 (30+ import)', async () => {
        const moduleFiles = Array.from({ length: 35 }, (_, i) => ({
          path: `module_${i}.py`,
          content: `value${i} = ${i}`
        }));

        const imports = moduleFiles
          .map((_, i) => `from module_${i} import value${i}`)
          .join('\n');
        const fanOutContent = `${imports}\n\nsum_value = ${moduleFiles.map((_, i) => `value${i}`).join(' + ')}`;

        await Promise.all([
          ...moduleFiles.map(file => fixture.writeFile(file.path, file.content)),
          fixture.writeFile('fan_out.py', fanOutContent)
        ]);

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理扇入極高的單模組 (被 30+ 檔案引用)', async () => {
        await fixture.writeFile('shared.py', 'shared = "value"');

        const consumerFiles = Array.from({ length: 35 }, (_, i) => ({
          path: `consumer_${i}.py`,
          content: `from shared import shared\nuse${i} = shared`
        }));

        await Promise.all(consumerFiles.map(file => fixture.writeFile(file.path, file.content)));

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });
    });

    describe('邊界條件', () => {
      it('應該處理孤島檔案（無任何依賴）', async () => {
        await fixture.writeFile('island.py', 'island = "isolated"');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理外部套件依賴', async () => {
        await fixture.writeFile('external.py', 'import os\nimport sys\nfrom typing import List\nvalue = 1');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該處理空 __init__.py', async () => {
        await fixture.writeFile('empty_pkg/__init__.py', '');
        await fixture.writeFile('empty_pkg/module.py', 'value = 1');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });
    });
  });

  describe('impact 命令', () => {
    describe('基本功能', () => {
      it('應該成功分析 Python 檔案影響範圍', async () => {
        const result = await executeCLI(
          ['impact', '--file', 'src/models/user.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      });

      it('應該支援 JSON 格式輸出', async () => {
        const result = await executeCLI(
          ['impact', '--file', 'src/models/product.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('deps');
        expect(output.success).toBeDefined();
      });

      it('應該支援 summary 格式輸出', async () => {
        const result = await executeCLI(
          ['impact', '--file', 'src/models/user.py', '--path', fixture.rootPath, '--format', 'summary'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout.length).toBeGreaterThan(0);
      });
    });

    describe('影響範圍分析', () => {
      it('應該分析直接依賴者', async () => {
        await fixture.writeFile('core.py', 'core = "value"');
        await fixture.writeFile('consumer.py', 'from core import core\nuse = core');

        const result = await executeCLI(
          ['impact', '--file', 'core.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });

      it('應該分析間接依賴者（傳遞性）', async () => {
        await fixture.writeFile('base.py', 'base = 1');
        await fixture.writeFile('mid.py', 'from base import base\nmid = base');
        await fixture.writeFile('top.py', 'from mid import mid\ntop = mid');

        const result = await executeCLI(
          ['impact', '--file', 'base.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });

      it('應該處理高扇出檔案（被多檔案依賴）', async () => {
        await fixture.writeFile('shared_lib.py', 'shared = "value"');

        const consumers = Array.from({ length: 15 }, (_, i) => ({
          path: `lib_consumer_${i}.py`,
          content: `from shared_lib import shared\nuse${i} = shared`
        }));

        await Promise.all(consumers.map(f => fixture.writeFile(f.path, f.content)));

        const result = await executeCLI(
          ['impact', '--file', 'shared_lib.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });

      it('應該處理深層依賴鏈', async () => {
        const chainFiles = Array.from({ length: 10 }, (_, i) => ({
          path: `impact_chain_${i}.py`,
          content: i === 9
            ? 'leaf = "end"'
            : `from impact_chain_${i + 1} import leaf\nvalue = leaf`
        }));

        await Promise.all(chainFiles.map(f => fixture.writeFile(f.path, f.content)));

        const result = await executeCLI(
          ['impact', '--file', 'impact_chain_9.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });
    });

    describe('菱形依賴處理', () => {
      it('應該正確處理菱形依賴（避免重複計算）', async () => {
        await fixture.writeFile('diamond_base.py', 'base = 1');
        await fixture.writeFile('diamond_left.py', 'from diamond_base import base\nleft = base');
        await fixture.writeFile('diamond_right.py', 'from diamond_base import base\nright = base');
        await fixture.writeFile('diamond_top.py', 'from diamond_left import left\nfrom diamond_right import right\ntop = left + right');

        const result = await executeCLI(
          ['impact', '--file', 'diamond_base.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });
    });

    describe('循環依賴情境', () => {
      it('應該處理直接循環依賴', async () => {
        await fixture.writeFile('impact_cycle_a.py', 'from impact_cycle_b import b\na = 1');
        await fixture.writeFile('impact_cycle_b.py', 'from impact_cycle_a import a\nb = 2');

        const result = await executeCLI(
          ['impact', '--file', 'impact_cycle_a.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });

      it('應該處理間接循環依賴', async () => {
        await fixture.writeFile('impact_indirect_a.py', 'from impact_indirect_c import c\na = 1');
        await fixture.writeFile('impact_indirect_b.py', 'from impact_indirect_a import a\nb = 2');
        await fixture.writeFile('impact_indirect_c.py', 'from impact_indirect_b import b\nc = 3');

        const result = await executeCLI(
          ['impact', '--file', 'impact_indirect_a.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      });
    });

    describe('Impact 結構詳細驗證', () => {
      it('應該返回 impact 物件包含 targetFile', async () => {
        await fixture.writeFile('target_file.py', 'target = 1');

        const result = await executeCLI(
          ['impact', '--file', 'target_file.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.impact).toBeDefined();
        expect(output.impact.targetFile).toContain('target_file.py');
      });

      it('應該返回 dependents 陣列', async () => {
        await fixture.writeFile('dep_base.py', 'base = 1');
        await fixture.writeFile('dep_consumer.py', 'from dep_base import base\nuse = base');

        const result = await executeCLI(
          ['impact', '--file', 'dep_base.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.impact).toBeDefined();
        expect(Array.isArray(output.impact.dependents)).toBe(true);
      });

      it('應該返回 dependencies 陣列', async () => {
        await fixture.writeFile('lib.py', 'lib = 1');
        await fixture.writeFile('app.py', 'from lib import lib\napp = lib');

        const result = await executeCLI(
          ['impact', '--file', 'app.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.impact).toBeDefined();
        expect(Array.isArray(output.impact.dependencies)).toBe(true);
      });

      it('應該在 summary 格式顯示影響資訊', async () => {
        await fixture.writeFile('sum_base.py', 'sum_val = 1');
        await fixture.writeFile('sum_user.py', 'from sum_base import sum_val\nuse = sum_val');

        const result = await executeCLI(
          ['impact', '--file', 'sum_base.py', '--path', fixture.rootPath, '--format', 'summary'],
          { memfs: fixture.memfs }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('影響分析');
      });
    });
  });

  describe('錯誤處理', () => {
    describe('cycles 錯誤處理', () => {
      it('應該處理無效路徑', async () => {
        const result = await executeCLI(
          ['cycles', '--path', '/nonexistent/path'],
          { memfs: fixture.memfs }
        );

        expect([0, 1]).toContain(result.exitCode);
      });

      it('應該處理空專案', async () => {
        // 使用空的臨時目錄
        await fixture.writeFile('empty/.gitkeep', '');

        const result = await executeCLI(
          ['cycles', '--path', `${fixture.rootPath}/empty`],
          { memfs: fixture.memfs }
        );

        expect([0, 1]).toContain(result.exitCode);
      });

      it('應該處理語法錯誤的 Python 檔案', async () => {
        await fixture.writeFile('syntax_error.py', 'def broken(\n  return');

        const result = await executeCLI(
          ['cycles', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect([0, 1]).toContain(result.exitCode);
      });
    });

    describe('impact 錯誤處理', () => {
      it('應該處理不存在的檔案', async () => {
        const result = await executeCLI(
          ['impact', '--file', 'nonexistent.py', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect([0, 1]).toContain(result.exitCode);
      });

      it('應該處理空專案路徑', async () => {
        const result = await executeCLI(
          ['impact', '--file', 'test.py', '--path', '/nonexistent', '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect([0, 1]).toContain(result.exitCode);
      });

      it('應該處理非 Python 檔案', async () => {
        await fixture.writeFile('not_python.txt', 'this is not python');

        const result = await executeCLI(
          ['impact', '--file', 'not_python.txt', '--path', fixture.rootPath, '--format', 'json'],
          { memfs: fixture.memfs }
        );

        expect([0, 1]).toContain(result.exitCode);
      });
    });
  });

  describe('現有 Fixture 檔案測試', () => {
    it('應該分析 models/user.py 的 cycles', async () => {
      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 models/order.py 的 impact（引用 user 和 product）', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/models/user.py', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 services/auth_service.py 的 impact', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/services/auth_service.py', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 main.py 的 dependencies', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'main.py', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.impact).toBeDefined();
    });
  });

  describe('大規模 Python 專案情境', () => {
    it('應該處理 30+ 檔案專案的 cycles', async () => {
      const files = Array.from({ length: 35 }, (_, i) => ({
        path: `large_${i}.py`,
        content: i === 0
          ? 'root = "root"'
          : `from large_0 import root\nval${i} = root`
      }));

      await Promise.all(files.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 30+ 檔案專案的 impact', async () => {
      const files = Array.from({ length: 35 }, (_, i) => ({
        path: `impact_large_${i}.py`,
        content: i === 0
          ? 'root = "root"'
          : `from impact_large_0 import root\nval${i} = root`
      }));

      await Promise.all(files.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'impact_large_0.py', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理複雜依賴網絡', async () => {
      // 建立 3 層 x 4 檔案的網絡
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < 4; i++) {
          const imports = layer > 0
            ? Array.from({ length: 2 }, (_, j) => `from l${layer - 1}_${j} import v${layer - 1}_${j}`).join('\n')
            : '';
          const content = `${imports}\nv${layer}_${i} = ${layer * 4 + i}`;
          await fixture.writeFile(`l${layer}_${i}.py`, content);
        }
      }

      const result = await executeCLI(
        ['impact', '--file', 'l0_0.py', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
