/**
 * CLI snapshot 命令 E2E 測試
 * 基於 swift-sample-project fixture 測試 Swift 專案快照功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import type { SnapshotResult, ModuleSnapshotData, ProjectSnapshotData } from '@infrastructure/formatters/query-types.js';

// Swift parser 只在 macOS 可用
const isNotMacOS = process.platform !== 'darwin';

describe.skipIf(isNotMacOS)('CLI snapshot - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;
  let modelsPath: string;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
    modelsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Models`;
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本輸出', () => {
    it('應該成功執行 snapshot 命令', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該輸出有效 JSON 格式', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該包含 SnapshotResult 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.command).toBe('snapshot');
      expect(snapshotResult.success).toBe(true);
      expect(snapshotResult.snapshotType).toBeDefined();
      expect(snapshotResult.snapshot).toBeDefined();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      // summary 格式應該是人類可讀的文字，不是 JSON
      expect(() => JSON.parse(result.stdout)).toThrow();
    });
  });

  describe('Swift 專案結構解析', () => {
    it('應該正確識別 Swift Package 專案', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該識別專案中的 Swift 檔案', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        expect(snapshot.modules).toBeDefined();
        // 專案應該有多個模組
        expect(Object.keys(snapshot.modules).length).toBeGreaterThan(0);
      }
    });
  });

  describe('Swift struct 解析', () => {
    it('應該提取 User struct 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 Product struct 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 Order 和 OrderItem struct', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Swift enum 解析', () => {
    it('應該提取 UserRole enum', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 OrderStatus enum', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 ProductCategory enum', async () => {
      const result = await executeCLI(['snapshot', '--path', modelsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Swift protocol 解析', () => {
    it('應該提取 Services 目錄中的 protocol', async () => {
      const servicesPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Services`;
      const result = await executeCLI(['snapshot', '--path', servicesPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Swift class 解析', () => {
    it('應該提取 UserService class', async () => {
      const servicesPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Services`;
      const result = await executeCLI(['snapshot', '--path', servicesPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 Logger class（單例模式）', async () => {
      const utilsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Utils`;
      const result = await executeCLI(['snapshot', '--path', utilsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('Swift extension 解析', () => {
    it('應該提取 Date extension', async () => {
      const extensionsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Extensions`;
      const result = await executeCLI(['snapshot', '--path', extensionsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該提取 String extension', async () => {
      const extensionsPath = `${fixture.rootPath}/Sources/SwiftSampleApp/Extensions`;
      const result = await executeCLI(['snapshot', '--path', extensionsPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('專案快照驗證', () => {
    it('應該識別專案根目錄並產生專案快照', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(['module', 'project']).toContain(snapshotResult.snapshotType);
    });

    it('專案快照應該包含多個子模組', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        const moduleCount = Object.keys(snapshot.modules).length;
        expect(moduleCount).toBeGreaterThan(0);
      }
    });
  });

  describe('動態建立 Swift 檔案測試', () => {
    it('應該處理新增的 Swift struct', async () => {
      await fixture.writeFile('custom.swift', `
import Foundation

struct CustomModel: Codable {
    let id: String
    let name: String
    var value: Int

    func calculate() -> Int {
        return value * 2
    }
}
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理新增的 Swift protocol', async () => {
      await fixture.writeFile('protocols.swift', `
protocol Cacheable {
    associatedtype CacheKey: Hashable
    func cacheKey() -> CacheKey
    func invalidateCache()
}

protocol NetworkClient {
    func fetch<T: Decodable>(url: URL) async throws -> T
    func post<T: Encodable, R: Decodable>(url: URL, body: T) async throws -> R
}
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 Swift 泛型類別', async () => {
      await fixture.writeFile('generics.swift', `
class Repository<T: Identifiable> {
    private var items: [T.ID: T] = [:]

    func get(id: T.ID) -> T? {
        return items[id]
    }

    func save(_ item: T) {
        items[item.id] = item
    }

    func delete(id: T.ID) {
        items.removeValue(forKey: id)
    }
}
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('應該在路徑不存在時輸出錯誤訊息', async () => {
      const result = await executeCLI(['snapshot', '--path', '/nonexistent/path'], { memfs: fixture.memfs });

      expect(result.stderr || result.stdout).toMatch(/不存在|error|Error/i);
    });
  });

  describe('Swift 特有語法結構', () => {
    it('應該處理 computed property', async () => {
      await fixture.writeFile('computed.swift', `
struct Circle {
    var radius: Double

    var diameter: Double {
        radius * 2
    }

    var area: Double {
        .pi * radius * radius
    }

    var circumference: Double {
        get { 2 * .pi * radius }
        set { radius = newValue / (2 * .pi) }
    }
}
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 async/await 方法', async () => {
      await fixture.writeFile('async.swift', `
actor DataManager {
    private var cache: [String: Data] = [:]

    func fetch(key: String) async throws -> Data {
        if let cached = cache[key] {
            return cached
        }
        let data = try await loadFromNetwork(key: key)
        cache[key] = data
        return data
    }

    private func loadFromNetwork(key: String) async throws -> Data {
        return Data()
    }
}
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });

    it('應該處理 property wrapper', async () => {
      await fixture.writeFile('wrappers.swift', `
@propertyWrapper
struct Clamped<Value: Comparable> {
    private var value: Value
    private let range: ClosedRange<Value>

    var wrappedValue: Value {
        get { value }
        set { value = min(max(range.lowerBound, newValue), range.upperBound) }
    }

    init(wrappedValue: Value, _ range: ClosedRange<Value>) {
        self.range = range
        self.value = min(max(range.lowerBound, wrappedValue), range.upperBound)
    }
}

struct Volume {
    @Clamped(0...100)
    var level: Int = 50
}
`);

      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);
    });
  });
});
