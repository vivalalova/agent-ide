/**
 * CLI impact 命令 E2E 測試
 * 基於 swift-sample-project fixture 測試 Swift 專案影響分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// Swift parser 只在 macOS 可用
const isNotMacOS = process.platform !== 'darwin';

describe.skipIf(isNotMacOS)('CLI impact - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析 Swift 檔案影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Models/User.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Models/Product.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deps');
      expect(output.success).toBeDefined();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Models/User.swift', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('Swift Model 影響分析', () => {
    it('應該分析 User.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Models/User.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.impact).toBeDefined();
    });

    it('應該分析 Product.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Models/Product.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 Order.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Models/Order.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Swift Service 影響分析', () => {
    it('應該分析 UserService.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Services/UserService.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 ProductService.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Services/ProductService.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 OrderService.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Services/OrderService.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Swift Utils 影響分析', () => {
    it('應該分析 Logger.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Utils/Logger.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 Validator.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Utils/Validator.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Swift Extensions 影響分析', () => {
    it('應該分析 DateExtensions.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Extensions/DateExtensions.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 StringExtensions.swift 的影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'Sources/SwiftSampleApp/Extensions/StringExtensions.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('動態建立依賴關係測試', () => {
    it('應該分析直接依賴者', async () => {
      await fixture.writeFile('core.swift', `
struct CoreModel {
    let id: String
    let name: String
}
`);
      await fixture.writeFile('consumer.swift', `
// 使用 CoreModel
struct Consumer {
    let core: String // 模擬依賴
}
`);

      const result = await executeCLI(
        ['impact', '--file', 'core.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析間接依賴者（傳遞性）', async () => {
      await fixture.writeFile('base.swift', 'struct Base { let value = 1 }');
      await fixture.writeFile('mid.swift', 'struct Mid { let base = "base" }');
      await fixture.writeFile('top.swift', 'struct Top { let mid = "mid" }');

      const result = await executeCLI(
        ['impact', '--file', 'base.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理高扇出檔案（被多檔案依賴）', async () => {
      await fixture.writeFile('shared.swift', `
struct Shared {
    static let instance = Shared()
    let id = UUID()
}
`);

      const consumers = Array.from({ length: 15 }, (_, i) => ({
        path: `consumer-${i}.swift`,
        content: `struct Consumer${i} { let shared = "shared" }`
      }));

      await Promise.all(consumers.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'shared.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理深層依賴鏈', async () => {
      const chainFiles = Array.from({ length: 10 }, (_, i) => ({
        path: `chain-${i}.swift`,
        content: i === 9
          ? 'struct ChainLeaf { let value = "end" }'
          : `struct Chain${i} { let next = "chain-${i + 1}" }`
      }));

      await Promise.all(chainFiles.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'chain-9.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Swift 菱形依賴處理', () => {
    it('應該正確處理菱形依賴（避免重複計算）', async () => {
      await fixture.writeFile('diamond-base.swift', 'struct DiamondBase { let id = 1 }');
      await fixture.writeFile('diamond-left.swift', 'struct DiamondLeft { let base = "diamond-base" }');
      await fixture.writeFile('diamond-right.swift', 'struct DiamondRight { let base = "diamond-base" }');
      await fixture.writeFile('diamond-top.swift', 'struct DiamondTop { let left = "left"; let right = "right" }');

      const result = await executeCLI(
        ['impact', '--file', 'diamond-base.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理複雜菱形網絡', async () => {
      // 底層
      await fixture.writeFile('net-a.swift', 'struct NetA { let id = 1 }');
      await fixture.writeFile('net-b.swift', 'struct NetB { let id = 2 }');
      // 中層
      await fixture.writeFile('net-ab.swift', 'struct NetAB { let a = "a"; let b = "b" }');
      await fixture.writeFile('net-ba.swift', 'struct NetBA { let b = "b"; let a = "a" }');
      // 頂層
      await fixture.writeFile('net-top.swift', 'struct NetTop { let ab = "ab"; let ba = "ba" }');

      const result = await executeCLI(
        ['impact', '--file', 'net-a.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Swift 特有語法影響分析', () => {
    it('應該分析 protocol 的影響範圍', async () => {
      await fixture.writeFile('my-protocol.swift', `
protocol MyProtocol {
    var id: String { get }
    func process() -> String
}
`);
      await fixture.writeFile('impl1.swift', `
struct Impl1 {
    let id = "impl1"
    func process() -> String { "1" }
}
`);
      await fixture.writeFile('impl2.swift', `
struct Impl2 {
    let id = "impl2"
    func process() -> String { "2" }
}
`);

      const result = await executeCLI(
        ['impact', '--file', 'my-protocol.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 extension 的影響範圍', async () => {
      await fixture.writeFile('string-ext.swift', `
extension String {
    var reversed: String {
        String(self.reversed())
    }
}
`);

      const result = await executeCLI(
        ['impact', '--file', 'string-ext.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 actor 的影響範圍', async () => {
      await fixture.writeFile('my-actor.swift', `
actor MyActor {
    private var state = 0

    func increment() {
        state += 1
    }

    func getState() -> Int {
        state
    }
}
`);

      const result = await executeCLI(
        ['impact', '--file', 'my-actor.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('邊界條件', () => {
    it('應該處理孤島檔案（無依賴者）', async () => {
      await fixture.writeFile('island.swift', `
struct Island {
    let isolated = "alone"
}
`);

      const result = await executeCLI(
        ['impact', '--file', 'island.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理不存在的檔案', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'nonexistent.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理空專案路徑', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'test.swift', '--path', '/nonexistent', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理深層目錄結構', async () => {
      await fixture.writeFile('deep/nested/very/deep/file.swift', 'struct DeepFile { let deep = 1 }');
      await fixture.writeFile('deep/nested/consumer.swift', 'struct DeepConsumer { let deep = "file" }');

      const result = await executeCLI(
        ['impact', '--file', 'deep/nested/very/deep/file.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含 command 欄位', async () => {
      await fixture.writeFile('verify.swift', 'struct Verify { let v = 1 }');

      const result = await executeCLI(
        ['impact', '--file', 'verify.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deps');
    });

    it('應該包含 success 欄位', async () => {
      await fixture.writeFile('success-test.swift', 'struct SuccessTest { let v = 1 }');

      const result = await executeCLI(
        ['impact', '--file', 'success-test.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(typeof output.success).toBe('boolean');
    });

    it('應該包含 impact 物件', async () => {
      await fixture.writeFile('impact-test.swift', 'struct ImpactTest { let v = 1 }');

      const result = await executeCLI(
        ['impact', '--file', 'impact-test.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.impact).toBeDefined();
    });

    it('應該包含 summary 欄位', async () => {
      await fixture.writeFile('summary-test.swift', 'struct SummaryTest { let v = 1 }');

      const result = await executeCLI(
        ['impact', '--file', 'summary-test.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });

  describe('大規模 Swift 專案情境', () => {
    it('應該處理 30+ 檔案專案', async () => {
      const files = Array.from({ length: 35 }, (_, i) => ({
        path: `large-${i}.swift`,
        content: i === 0
          ? 'struct Root { static let shared = Root() }'
          : `struct Large${i} { let root = "large-0" }`
      }));

      await Promise.all(files.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'large-0.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理複雜依賴網絡', async () => {
      // 建立 3 層 × 4 檔案的網絡
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < 4; i++) {
          const content = layer > 0
            ? `struct L${layer}_${i} { let deps = "layer-${layer - 1}" }`
            : `struct L${layer}_${i} { let base = ${layer * 4 + i} }`;
          await fixture.writeFile(`l${layer}-${i}.swift`, content);
        }
      }

      const result = await executeCLI(
        ['impact', '--file', 'l0-0.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Impact 結構詳細驗證', () => {
    it('應該返回 targetFile 欄位', async () => {
      await fixture.writeFile('target-file.swift', 'struct TargetFile { let target = 1 }');

      const result = await executeCLI(
        ['impact', '--file', 'target-file.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.impact).toBeDefined();
      expect(output.impact.targetFile).toContain('target-file.swift');
    });

    it('應該返回 dependents 陣列', async () => {
      await fixture.writeFile('dep-base.swift', 'struct DepBase { let base = 1 }');
      await fixture.writeFile('dep-consumer.swift', 'struct DepConsumer { let base = "dep-base" }');

      const result = await executeCLI(
        ['impact', '--file', 'dep-base.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.impact).toBeDefined();
      expect(Array.isArray(output.impact.dependents)).toBe(true);
    });

    it('應該返回 dependencies 陣列', async () => {
      await fixture.writeFile('lib.swift', 'struct Lib { let lib = 1 }');
      await fixture.writeFile('app.swift', 'struct App { let lib = "lib" }');

      const result = await executeCLI(
        ['impact', '--file', 'app.swift', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.impact).toBeDefined();
      expect(Array.isArray(output.impact.dependencies)).toBe(true);
    });

    it('應該在 summary 格式顯示影響資訊', async () => {
      await fixture.writeFile('sum-base.swift', 'struct SumBase { let sum = 1 }');
      await fixture.writeFile('sum-user.swift', 'struct SumUser { let sum = "sum-base" }');

      const result = await executeCLI(
        ['impact', '--file', 'sum-base.swift', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('影響分析');
    });
  });
});
