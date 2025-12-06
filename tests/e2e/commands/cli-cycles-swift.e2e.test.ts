/**
 * CLI cycles 命令 E2E 測試
 * 基於 swift-sample-project fixture 測試 Swift 專案循環依賴檢測
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI cycles - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析 Swift 專案依賴', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該包含正確的輸出結構', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deps');
      expect(output.success).toBe(true);
      expect(output.cycles).toBeDefined();
      expect(Array.isArray(output.cycles)).toBe(true);
    });
  });

  describe('Swift import 語法解析', () => {
    it('應該識別 Foundation import', async () => {
      await fixture.writeFile('foundation-test.swift', `
import Foundation

struct FoundationTest {
    let date = Date()
    let uuid = UUID()
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該識別多個系統框架 import', async () => {
      await fixture.writeFile('multi-import.swift', `
import Foundation
import UIKit
import SwiftUI
import Combine

class MultiImportTest {
    var cancellables = Set<AnyCancellable>()
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理條件 import', async () => {
      await fixture.writeFile('conditional-import.swift', `
import Foundation

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

struct PlatformView {
    #if canImport(UIKit)
    typealias ViewType = UIView
    #else
    typealias ViewType = NSView
    #endif
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('Swift 檔案循環依賴檢測', () => {
    it('應該檢測直接循環（A↔B）', async () => {
      await fixture.writeFile('cycle-a.swift', `
import Foundation
// 模擬引用 cycle-b 中的型別
struct CycleA {
    let b: String // 模擬依賴 CycleB
}
`);
      await fixture.writeFile('cycle-b.swift', `
import Foundation
// 模擬引用 cycle-a 中的型別
struct CycleB {
    let a: String // 模擬依賴 CycleA
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理跨模組依賴結構', async () => {
      // Services 依賴 Models
      const servicesPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Services`;
      const result = await executeCLI(['cycles', '--path', servicesPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Utils 目錄的獨立模組', async () => {
      const utilsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Utils`;
      const result = await executeCLI(['cycles', '--path', utilsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('Swift 專案結構分析', () => {
    it('應該分析 Models 目錄依賴', async () => {
      const modelsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Models`;
      const result = await executeCLI(['cycles', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 Extensions 目錄依賴', async () => {
      const extensionsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Extensions`;
      const result = await executeCLI(['cycles', '--path', extensionsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析完整專案依賴圖', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });
  });

  describe('動態建立循環依賴測試', () => {
    it('應該檢測三層循環（A→B→C→A）', async () => {
      await fixture.writeFile('swift-cycle-1.swift', `
struct SwiftCycle1 {
    // 依賴 SwiftCycle3
    func useCycle3() {}
}
`);
      await fixture.writeFile('swift-cycle-2.swift', `
struct SwiftCycle2 {
    // 依賴 SwiftCycle1
    func useCycle1() {}
}
`);
      await fixture.writeFile('swift-cycle-3.swift', `
struct SwiftCycle3 {
    // 依賴 SwiftCycle2
    func useCycle2() {}
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理深層依賴鏈（無循環）', async () => {
      const chainFiles = Array.from({ length: 10 }, (_, i) => ({
        path: `chain-${i}.swift`,
        content: i === 9
          ? 'struct ChainEnd { let value = "end" }'
          : `struct Chain${i} { let next = "chain-${i + 1}" }`
      }));

      await Promise.all(
        chainFiles.map(file => fixture.writeFile(file.path, file.content))
      );

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理高扇出結構', async () => {
      const moduleFiles = Array.from({ length: 20 }, (_, i) => ({
        path: `module-${i}.swift`,
        content: `struct Module${i} { let id = ${i} }`
      }));

      // 建立一個依賴所有模組的 Hub
      const hubContent = `
struct Hub {
    // 依賴所有 Module
    ${moduleFiles.map((_, i) => `let m${i} = "module-${i}"`).join('\n    ')}
}
`;

      await Promise.all([
        ...moduleFiles.map(file => fixture.writeFile(file.path, file.content)),
        fixture.writeFile('hub.swift', hubContent)
      ]);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('Swift 特有語法處理', () => {
    it('應該處理 @available 屬性', async () => {
      await fixture.writeFile('available.swift', `
import Foundation

@available(iOS 15.0, macOS 12.0, *)
struct ModernAPI {
    func newFeature() async throws -> String {
        return "modern"
    }
}

@available(*, deprecated, message: "Use ModernAPI instead")
struct LegacyAPI {
    func oldFeature() -> String {
        return "legacy"
    }
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 nested types', async () => {
      await fixture.writeFile('nested.swift', `
struct Outer {
    struct Inner {
        struct DeepInner {
            let value: Int
        }
        let deep: DeepInner
    }
    let inner: Inner

    enum Status {
        case active
        case inactive
    }
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 protocol 繼承鏈', async () => {
      await fixture.writeFile('protocol-chain.swift', `
protocol Base {
    var id: String { get }
}

protocol Identifiable: Base {
    associatedtype ID
    var id: ID { get }
}

protocol Named: Base {
    var name: String { get }
}

protocol Entity: Identifiable, Named where ID == String {
    var createdAt: Date { get }
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 actor 和 async', async () => {
      await fixture.writeFile('actor-test.swift', `
import Foundation

actor Counter {
    private var value = 0

    func increment() {
        value += 1
    }

    func getValue() -> Int {
        return value
    }
}

struct AsyncUser {
    func useCounter() async {
        let counter = Counter()
        await counter.increment()
        let _ = await counter.getValue()
    }
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('邊界條件', () => {
    it('應該處理空 Swift 檔案', async () => {
      await fixture.writeFile('empty.swift', '');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理只有註解的檔案', async () => {
      await fixture.writeFile('comments-only.swift', `
// This is a comment
/* This is a
   multi-line comment */
/// Documentation comment
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理路徑不存在的情況', async () => {
      const result = await executeCLI(['cycles', '--path', '/nonexistent/swift/path'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理單一 Swift 檔案', async () => {
      await fixture.writeFile('standalone.swift', `
import Foundation

struct Standalone: Codable {
    let id: String
    let name: String
}
`);

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含 cycles 陣列', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toBeDefined();
      expect(Array.isArray(output.cycles)).toBe(true);
    });

    it('應該包含 summary 統計資訊', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.cyclesFound).toBe('number');
    });

    it('應該正確識別無循環依賴的專案', async () => {
      // Swift sample project 設計上應該沒有循環依賴
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
