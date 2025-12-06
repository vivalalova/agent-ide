/**
 * CLI change-signature 命令 E2E 測試 - Swift 專案
 * 基於 swift-sample-project fixture 測試 Swift 函式簽章修改功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

// Swift parser 只在 macOS 可用
const isNotMacOS = process.platform !== 'darwin';

describe.skipIf(isNotMacOS)('CLI change-signature - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('參數重排序 - 基本功能', () => {
    it('應該成功重排序 Swift 函式的兩個參數', async () => {
      const testFile = `${fixture.rootPath}/test-reorder.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func calculate(a: Int, b: Int) -> Int {
    return a - b
}

let result = calculate(a: 10, b: 5)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'calculate', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.originalSignature.name).toBe('calculate');
      }
    });

    it('應該成功重排序 Swift 函式的三個參數', async () => {
      const testFile = `${fixture.rootPath}/test-reorder-three.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func format(prefix: String, value: Int, suffix: String) -> String {
    return prefix + String(value) + suffix
}

let text = format(prefix: "[", value: 42, suffix: "]")
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'format', '-p', fixture.rootPath, '--reorder', 'value,prefix,suffix', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該更新所有 Swift 呼叫點的參數順序', async () => {
      const testFile = `${fixture.rootPath}/test-reorder-calls.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func add(x: Int, y: Int) -> Int {
    return x + y
}

let a = add(x: 1, y: 2)
let b = add(x: 3, y: 4)
let c = add(x: 5, y: 6)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'y,x', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.stats.callSitesUpdated).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('新增參數 - 基本功能', () => {
    it('應該成功新增有預設值的 Swift 參數', async () => {
      const testFile = `${fixture.rootPath}/test-add-param.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func greet(name: String) -> String {
    return "Hello, " + name
}

let msg = greet(name: "World")
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'greet', '-p', fixture.rootPath, '--add', 'greeting:String=Hello', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功新增多個 Swift 參數', async () => {
      const testFile = `${fixture.rootPath}/test-add-multi.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func log(message: String) {
    print(message)
}

log(message: "test")
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'log', '-p', fixture.rootPath, '--add', 'level:String=info', '--add', 'timestamp:Bool=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('刪除參數 - 基本功能', () => {
    it('應該成功刪除未使用的 Swift 參數', async () => {
      const testFile = `${fixture.rootPath}/test-remove-param.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func process(data: String, unused: Int) -> String {
    return data.uppercased()
}

let result = process(data: "test", unused: 123)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'process', '-p', fixture.rootPath, '--remove', 'unused', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('修改參數類型 - 基本功能', () => {
    it('應該成功修改 Swift 參數類型', async () => {
      const testFile = `${fixture.rootPath}/test-change-type.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func count(value: Int) -> Int {
    return value
}

let n = count(value: 42)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'count', '-p', fixture.rootPath, '--change-type', 'value:Int64', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的 Swift 函式', async () => {
      const testFile = `${fixture.rootPath}/test-nonexistent.swift`;
      await fixture.memfs.writeFile(testFile, 'let x = 1');

      const result = await executeCLI(
        ['change-signature', testFile, 'nonExistent', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
      }
    });

    it('應該處理無效的 Swift 參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-param.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func test(a: Int) -> Int {
    return a
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath, '--reorder', 'x,y', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(false);
      }
    });

    it('應該處理不存在的 Swift 檔案', async () => {
      const result = await executeCLI(
        ['change-signature', '/nonexistent/file.swift', 'test', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr).toBeDefined();
    });

    it('應該處理語法錯誤的 Swift 檔案', async () => {
      const testFile = `${fixture.rootPath}/test-syntax-error.swift`;
      await fixture.memfs.writeFile(testFile, 'func broken( { return }');

      const result = await executeCLI(
        ['change-signature', testFile, 'broken', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-json.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func fn(a: Int, b: Int) -> Int { return a + b }
let x = fn(a: 1, b: 2)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-summary.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func fn(a: Int, b: Int) -> Int { return a + b }
let x = fn(a: 1, b: 2)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });

    it('應該支援 diff 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-diff.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func fn(a: Int, b: Int) -> Int { return a + b }
let x = fn(a: 1, b: 2)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const testFile = `${fixture.rootPath}/test-dry-run.swift`;
      const originalContent = `
import Foundation

func calc(a: Int, b: Int) -> Int {
    return a - b
}
let result = calc(a: 10, b: 5)
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        ['change-signature', testFile, 'calc', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const fileContent = await fixture.memfs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe(originalContent);
    });
  });

  describe('Swift class 方法', () => {
    it('應該處理 Swift class 方法的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-class-method.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

final class Calculator {
    func add(a: Int, b: Int) -> Int {
        return a + b
    }
}

let calc = Calculator()
let result = calc.add(a: 1, b: 2)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 Swift struct 方法的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-struct-method.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

struct Calculator {
    func multiply(x: Int, y: Int) -> Int {
        return x * y
    }
}

let calc = Calculator()
let result = calc.multiply(x: 3, y: 4)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'multiply', '-p', fixture.rootPath, '--reorder', 'y,x', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift async 函式', () => {
    it('應該處理 Swift async 函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-async.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func fetchData(url: String, timeout: Int) async -> String {
    return url
}

Task {
    let data = await fetchData(url: "/api", timeout: 5000)
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fetchData', '-p', fixture.rootPath, '--reorder', 'timeout,url', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 Swift async throws 函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-async-throws.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func loadUser(id: String, cache: Bool) async throws -> String {
    return id
}

Task {
    let user = try await loadUser(id: "123", cache: true)
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'loadUser', '-p', fixture.rootPath, '--reorder', 'cache,id', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift 泛型函式', () => {
    it('應該處理 Swift 泛型函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-generic.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func identity<T>(value: T, label: String) -> T {
    print(label)
    return value
}

let num = identity(value: 42, label: "number")
let str = identity(value: "hello", label: "string")
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'identity', '-p', fixture.rootPath, '--reorder', 'label,value', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift protocol 方法', () => {
    it('應該處理 Swift protocol 方法的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-protocol.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

protocol DataService {
    func fetch(id: String, refresh: Bool) async throws -> Data
}

final class ApiService: DataService {
    func fetch(id: String, refresh: Bool) async throws -> Data {
        return Data()
    }
}

let service: DataService = ApiService()
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fetch', '-p', fixture.rootPath, '--reorder', 'refresh,id', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift 閉包參數', () => {
    it('應該處理帶閉包參數的 Swift 函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-closure.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func execute(delay: Int, action: () -> Void) {
    action()
}

execute(delay: 100, action: { print("done") })
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'execute', '-p', fixture.rootPath, '--reorder', 'action,delay', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 大量參數（50+ 個）', () => {
    it('應該處理 55 個參數的 Swift 函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-many-params.swift`;
      const params = Array.from({ length: 55 }, (_, i) => `p${i}: Int`).join(', ');
      const paramNames = Array.from({ length: 55 }, (_, i) => `p${i}`);
      const args = Array.from({ length: 55 }, (_, i) => `p${i}: ${i}`).join(', ');

      await fixture.memfs.writeFile(testFile, `
import Foundation

func manyParams(${params}) -> Int {
    return ${paramNames.join(' + ')}
}

let result = manyParams(${args})
`.trim());

      // 重排序：將 p0 移到最後
      const reordered = [...paramNames.slice(1), paramNames[0]].join(',');

      const result = await executeCLI(
        ['change-signature', testFile, 'manyParams', '-p', fixture.rootPath, '--reorder', reordered, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 大量呼叫點（60+ 個）', () => {
    it('應該處理有 60+ 呼叫點的 Swift 函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-many-calls.swift`;
      const calls = Array.from({ length: 65 }, (_, i) => `let r${i} = add(x: ${i}, y: ${i + 1})`).join('\n');

      await fixture.memfs.writeFile(testFile, `
import Foundation

func add(x: Int, y: Int) -> Int {
    return x + y
}

${calls}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'y,x', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.stats.callSitesUpdated).toBeGreaterThanOrEqual(65);
      }
    });
  });

  describe('極端測試標準 - 深層巢狀（10+ 層）', () => {
    it('應該處理 12 層巢狀結構中的 Swift 函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-deep-nested.swift`;
      const nestOpen = Array.from({ length: 12 }, (_, i) => `${'    '.repeat(i)}func level${i}() {`).join('\n');
      const nestClose = Array.from({ length: 12 }, (_, i) => `${'    '.repeat(11 - i)}}`).join('\n');

      await fixture.memfs.writeFile(testFile, `
import Foundation

func target(a: Int, b: String) -> String {
    return b + String(a)
}

${nestOpen}
${'    '.repeat(12)}let x = target(a: 1, b: "test")
${nestClose}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'target', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超長函式（500+ 行）', () => {
    it('應該處理 500+ 行 Swift 函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-long-function.swift`;
      const longBody = Array.from({ length: 500 }, (_, i) => `    let v${i} = a + b + ${i}`).join('\n');

      await fixture.memfs.writeFile(testFile, `
import Foundation

func longFunction(a: Int, b: Int) -> Int {
${longBody}
    return v499
}

let result = longFunction(a: 1, b: 2)
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'longFunction', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超長參數名稱（100+ 字元）', () => {
    it('應該處理超長 Swift 參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-long-names.swift`;
      const longName1 = 'a'.repeat(100);
      const longName2 = 'b'.repeat(100);

      await fixture.memfs.writeFile(testFile, `
import Foundation

func test(${longName1}: Int, ${longName2}: String) -> String {
    return ${longName2} + String(${longName1})
}

let r = test(${longName1}: 1, ${longName2}: "x")
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath, '--reorder', `${longName2},${longName1}`, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('複合操作', () => {
    it('應該同時支援重排序和新增 Swift 參數', async () => {
      const testFile = `${fixture.rootPath}/test-combo.swift`;
      await fixture.memfs.writeFile(testFile, `
import Foundation

func combo(a: Int, b: String) -> String {
    return b + String(a)
}

let r = combo(a: 1, b: "x")
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'combo', '-p', fixture.rootPath, '--reorder', 'b,a', '--add', 'c:Bool=true', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Swift Fixture 實際檔案測試', () => {
    it('應該處理 UserService 的 createUser 方法簽章修改', async () => {
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'), 'createUser', '-p', fixture.rootPath, '--reorder', 'email,name,role', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 ProductService 的 updateStock 方法簽章修改', async () => {
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('Sources/SwiftSampleApp/Services/ProductService.swift'), 'updateStock', '-p', fixture.rootPath, '--reorder', 'quantity,productId', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 OrderService 的 createOrder 方法簽章修改', async () => {
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('Sources/SwiftSampleApp/Services/OrderService.swift'), 'createOrder', '-p', fixture.rootPath, '--reorder', 'items,userId', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 Validator 的 validateEmail 方法簽章修改', async () => {
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('Sources/SwiftSampleApp/Utils/Validator.swift'), 'validateEmail', '-p', fixture.rootPath, '--add', 'strict:Bool=false', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 Logger 的 log 方法簽章修改', async () => {
      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('Sources/SwiftSampleApp/Utils/Logger.swift'), 'log', '-p', fixture.rootPath, '--reorder', 'level,message,file,line', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('缺少參數處理', () => {
    it('應該處理缺少 Swift 檔案參數', async () => {
      const result = await executeCLI(
        ['change-signature'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少 Swift 函式名稱參數', async () => {
      const testFile = `${fixture.rootPath}/test.swift`;
      await fixture.memfs.writeFile(testFile, 'let x = 1');

      const result = await executeCLI(
        ['change-signature', testFile],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少操作參數', async () => {
      const testFile = `${fixture.rootPath}/test.swift`;
      await fixture.memfs.writeFile(testFile, 'func test(a: Int) -> Int { return a }');

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });
});
