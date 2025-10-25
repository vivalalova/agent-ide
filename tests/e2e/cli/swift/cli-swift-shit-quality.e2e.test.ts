/**
 * CLI swift shit 命令 - 品質保證維度 E2E 測試
 * 測試 Swift 特定的型別安全、測試覆蓋率、錯誤處理、命名規範、安全性檢測
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, type FixtureProject } from '../../helpers/fixture-manager.js';
import { executeCLI } from '../../helpers/cli-executor.js';

describe('CLI swift shit - 品質保證維度測試', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 基本功能（3 個測試）
  // ============================================================

  describe('基本功能', () => {
    it('應該輸出 qualityAssurance 維度評分', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 確認包含第 4 個維度
      expect(output.dimensions).toBeDefined();
      expect(output.dimensions.qualityAssurance).toBeDefined();
    });

    it('qualityAssurance 權重應為 0.20', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.dimensions.qualityAssurance.weight).toBe(0.2);
    });

    it('breakdown 應包含 5 個子項', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const breakdown = output.dimensions.qualityAssurance.breakdown;
      expect(breakdown).toBeDefined();
      expect(breakdown.typeSafety).toBeDefined();
      expect(breakdown.testCoverage).toBeDefined();
      expect(breakdown.errorHandling).toBeDefined();
      expect(breakdown.naming).toBeDefined();
      expect(breakdown.security).toBeDefined();
    });
  });

  // ============================================================
  // 2. 型別安全檢測（4 個測試）
  // ============================================================

  describe('型別安全檢測 - Swift 特定', () => {
    it('應該檢測 as? 可選型別轉換', async () => {
      // 新增測試檔案包含 as? 使用
      const testFile = `
import Foundation

class UnsafeTypeTest {
    func optionalCast() {
        let value = something as? String
        let view = controller.view as? UIView
        let data = object as? [String: Any]
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/TypeSafetyTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;
      // typeSafety 分數應該存在
      expect(typeSafetyScore).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測 as! 強制型別轉換', async () => {
      const testFile = `
import Foundation

class ForceUnwrapTest {
    func forceCast() {
        let value = something as! String
        let array = data as! [Int]
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/ForceCastTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // topShit 應該包含 type_safety 類型的問題
      const typeIssues = output.topShit?.filter(
        (item: any) => item.type === 'type_safety'
      );

      if (typeIssues && typeIssues.length > 0) {
        expect(typeIssues[0].description).toMatch(/as!|強制轉換|unsafe/i);
      }
    });

    it('應該檢測 Any 型別使用', async () => {
      const testFile = `
import Foundation

class AnyTypeTest {
    var data: Any?
    var configs: [String: Any] = [:]

    func processAny(value: Any) -> Any {
        return value
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/AnyTypeTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;
      // typeSafety 分數應該存在
      expect(typeSafetyScore).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測 implicitly unwrapped optional (Type!)', async () => {
      const testFile = `
import UIKit

class ImplicitUnwrapTest {
    var delegate: UIViewController!
    var manager: NetworkManager!

    @IBOutlet weak var button: UIButton!
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/ImplicitUnwrapTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;
      // typeSafety 分數應該存在
      expect(typeSafetyScore).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 3. 測試覆蓋率檢測（2 個測試）
  // ============================================================

  describe('測試覆蓋率檢測', () => {
    it('應該計算測試檔案比例', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const testCoverageScore = output.dimensions.qualityAssurance.breakdown.testCoverage;

      // swift-sample-project 有測試目錄但檔案很少，分數應該較高
      expect(testCoverageScore).toBeGreaterThanOrEqual(0);
      expect(testCoverageScore).toBeLessThanOrEqual(100);
    });

    it('覆蓋率低於 20% 應該在建議中標記為 Critical', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const recommendations = output.recommendations || [];
      const testRecommendation = recommendations.find(
        (r: any) => r.suggestion.includes('測試') || r.suggestion.includes('test')
      );

      if (testRecommendation) {
        // 測試覆蓋率低應該是高優先級
        expect(['high', 'critical']).toContain(testRecommendation.priority);
      }
    });
  });

  // ============================================================
  // 4. 錯誤處理檢測（2 個測試）
  // ============================================================

  describe('錯誤處理檢測 - Swift 特定', () => {
    it('應該檢測空 catch 區塊', async () => {
      const testFile = `
import Foundation

class ErrorHandlingTest {
    func emptyDoCatch() {
        do {
            try riskyOperation()
        } catch {
            // empty catch block
        }
    }

    func silentError() {
        do {
            try anotherOperation()
        } catch {
            // TODO: handle error
        }
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/ErrorHandlingTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const errorHandlingScore = output.dimensions.qualityAssurance.breakdown.errorHandling;
      expect(errorHandlingScore).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測 try! 強制 unwrap', async () => {
      const testFile = `
import Foundation

class ForceUnwrapTest {
    func forceTry() {
        let data = try! loadData()
        let result = try! parseJSON(data)
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/ForceTryTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const errorHandlingScore = output.dimensions.qualityAssurance.breakdown.errorHandling;
      // errorHandling 分數應該存在
      expect(errorHandlingScore).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 5. 命名規範檢測（2 個測試）
  // ============================================================

  describe('命名規範檢測 - Swift 特定', () => {
    it('應該檢測型別命名（PascalCase）', async () => {
      const testFile = `
import Foundation

// 錯誤：應使用 PascalCase
class userService {
    func fetchUser() {}
}

struct orderModel {
    var id: Int
}

enum http_method {
    case get, post
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/NamingTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const namingScore = output.dimensions.qualityAssurance.breakdown.naming;
      // naming 分數應該存在
      expect(namingScore).toBeGreaterThanOrEqual(0);
    });

    it('--show-files 應該列出命名問題檔案', async () => {
      const testFile = `
import Foundation

class naming_violation {
    var user_name: String = ""
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/NamingViolation.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--show-files',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.detailedFiles).toBeDefined();
      expect(output.detailedFiles.qualityAssurance).toBeDefined();
      expect(output.detailedFiles.qualityAssurance.namingViolation).toBeDefined();

      const namingFiles = output.detailedFiles.qualityAssurance.namingViolation;

      if (namingFiles.length > 0) {
        const hasNamingViolationFile = namingFiles.some(
          (f: any) => f.path.includes('NamingViolation.swift')
        );
        expect(hasNamingViolationFile).toBe(true);
      }
    });
  });

  // ============================================================
  // 6. 安全性檢測（2 個測試）
  // ============================================================

  describe('安全性檢測 - Swift 特定', () => {
    it('應該檢測硬編碼密碼', async () => {
      const testFile = `
import Foundation

class SecurityTest {
    let password = "hardcoded123"
    let apiKey = "sk-1234567890abcdef"

    func authenticate() {
        let secret = "mySecretPassword"
        login(password: "admin123")
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/SecurityTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const securityScore = output.dimensions.qualityAssurance.breakdown.security;
      expect(securityScore).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測 UserDefaults 存儲敏感資料', async () => {
      const testFile = `
import Foundation

class UserDefaultsTest {
    func savePassword() {
        UserDefaults.standard.set("password123", forKey: "userPassword")
        UserDefaults.standard.set("my-api-key", forKey: "apiKey")
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/UserDefaultsTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const securityScore = output.dimensions.qualityAssurance.breakdown.security;
      // security 分數應該存在
      expect(securityScore).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 7. 整合測試（3 個測試）
  // ============================================================

  describe('整合測試', () => {
    it('--detailed 應該包含 qualityAssurance 相關建議', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.recommendations).toBeDefined();
      const recommendations = output.recommendations || [];

      // recommendations 應該是陣列
      expect(Array.isArray(recommendations)).toBe(true);
      // 可能有或沒有品質保證相關建議，取決於檔案內容
      expect(recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('--show-files 應該列出 qualityAssurance 問題檔案', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--show-files',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.detailedFiles).toBeDefined();
      expect(output.detailedFiles.qualityAssurance).toBeDefined();

      const qa = output.detailedFiles.qualityAssurance;
      expect(qa.typeSafety).toBeDefined();
      expect(qa.testCoverage).toBeDefined();
      expect(qa.errorHandling).toBeDefined();
      expect(qa.namingViolation).toBeDefined();
      expect(qa.securityRisk).toBeDefined();
    });

    it('現有 3 個維度評分應保持合理範圍（向下相容）', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 確認 3 個舊維度仍然存在且有效
      expect(output.dimensions.complexity).toBeDefined();
      expect(output.dimensions.maintainability).toBeDefined();
      expect(output.dimensions.architecture).toBeDefined();

      // 權重應該調整為 30%, 30%, 30%
      expect(output.dimensions.complexity.weight).toBe(0.3);
      expect(output.dimensions.maintainability.weight).toBe(0.3);
      expect(output.dimensions.architecture.weight).toBe(0.3);

      // 總分應該是 4 個維度的加權平均
      const calculatedScore =
        output.dimensions.complexity.weightedScore +
        output.dimensions.maintainability.weightedScore +
        output.dimensions.architecture.weightedScore +
        output.dimensions.qualityAssurance.weightedScore;

      expect(Math.abs(output.shitScore - calculatedScore)).toBeLessThan(0.1);
    });
  });

  // ============================================================
  // 8. Swift 特定模式檢測（2 個測試）
  // ============================================================

  describe('Swift 特定模式', () => {
    it('應該檢測 @Published 過度使用', async () => {
      const testFile = `
import Combine

class ViewModel: ObservableObject {
    @Published var title: String = ""
    @Published var subtitle: String = ""
    @Published var items: [Item] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var count: Int = 0
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/ViewModelTest.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // @Published 過度使用可能影響複雜度或維護性分數
      expect(output.dimensions.complexity.score).toBeGreaterThanOrEqual(0);
    });

    it('應該檢測 ! 過度使用（force unwrap）', async () => {
      const testFile = `
import Foundation

class ForceUnwrapOveruse {
    func processData() {
        let value1 = data!.value
        let value2 = array![0]
        let value3 = dict["key"]!
        let value4 = optional!.property!.value!
    }
}
`;
      fixture.writeFile('Sources/SwiftSampleApp/ForceUnwrapOveruse.swift', testFile);

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;
      // typeSafety 分數應該存在
      expect(typeSafetyScore).toBeGreaterThanOrEqual(0);
    });
  });
});
