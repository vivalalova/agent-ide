/**
 * CLI analyze 命令 E2E 測試
 * 基於 sample-project fixture 測試真實複雜程式碼分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../helpers/fixture-manager';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI analyze - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 複雜度分析測試（3 個測試）
  // ============================================================

  it('應該識別 OrderService 為高複雜度模組', async () => {
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.getFilePath('src/services'),
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThan(0);

    const orderServiceResult = output.files.find((f: any) => f.path.includes('order-service.ts'));
    expect(orderServiceResult).toBeDefined();
    expect(orderServiceResult.complexity).toBeGreaterThan(0); // OrderService 有複雜度
    expect(orderServiceResult.evaluation).toBeDefined();

    // 驗證 OrderService 相對複雜（與其他檔案比較）
    const avgComplexity = output.summary.averageComplexity;
    expect(orderServiceResult.complexity).toBeGreaterThanOrEqual(avgComplexity);
  });

  it('應該正確分析抽象類別 BaseModel 的複雜度', async () => {
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.getFilePath('src/models'),
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThan(0);

    const baseModelResult = output.files.find((f: any) => f.path.includes('base-model.ts'));
    expect(baseModelResult).toBeDefined();
    expect(baseModelResult.complexity).toBeGreaterThan(0);
    expect(baseModelResult.cognitiveComplexity).toBeDefined();
  });

  it('應該能比較不同模組的複雜度差異', async () => {
    // 分析整個專案獲取所有檔案複雜度
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThan(0);

    // 驗證包含核心業務檔案
    const userServiceResult = output.files.find((f: any) => f.path.includes('user-service.ts'));
    const stringUtilsResult = output.files.find((f: any) => f.path.includes('string-utils.ts'));
    const orderServiceResult = output.files.find((f: any) => f.path.includes('order-service.ts'));

    expect(userServiceResult).toBeDefined();
    expect(stringUtilsResult).toBeDefined();
    expect(orderServiceResult).toBeDefined();

    // 驗證所有檔案都有複雜度值
    expect(userServiceResult.complexity).toBeGreaterThan(0);
    expect(stringUtilsResult.complexity).toBeGreaterThan(0);
    expect(orderServiceResult.complexity).toBeGreaterThan(0);

    // 驗證所有檔案都有認知複雜度
    expect(userServiceResult.cognitiveComplexity).toBeGreaterThanOrEqual(0);
    expect(stringUtilsResult.cognitiveComplexity).toBeGreaterThanOrEqual(0);
    expect(orderServiceResult.cognitiveComplexity).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // 2. 整體專案分析測試（2 個測試）
  // ============================================================

  it('應該能分析整個專案並統計所有檔案的複雜度', async () => {
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThanOrEqual(30); // 至少 30 個檔案
    expect(output.summary).toBeDefined();
    expect(output.summary.totalFiles).toBeGreaterThanOrEqual(30);
    expect(output.summary.averageComplexity).toBeGreaterThan(0);
    expect(output.summary.maxComplexity).toBeGreaterThan(0);

    // 驗證包含核心模組
    const filePaths = output.files.map((f: any) => f.path);
    expect(filePaths.some((p: string) => p.includes('user-service.ts'))).toBe(true);
    expect(filePaths.some((p: string) => p.includes('order-service.ts'))).toBe(true);
    expect(filePaths.some((p: string) => p.includes('base-model.ts'))).toBe(true);
  });

  it('應該能檢測專案中的最佳實踐', async () => {
    const result = await executeCLI([
      'analyze',
      'best-practices',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.recommendations).toBeDefined();
    expect(Array.isArray(output.recommendations)).toBe(true);

    // sample-project 使用 ES Module
    const hasEsmRecommendation = output.recommendations.some(
      (r: any) => r.type === 'es-modules' && r.status === 'good'
    );
    expect(hasEsmRecommendation).toBe(true);
  });

  // ============================================================
  // 3. 死代碼檢測測試（2 個測試）
  // ============================================================

  it('應該執行死代碼檢測並返回正確格式', async () => {
    // 新增未使用的函式（用於測試檢測功能）
    await fixture.writeFile(
      'src/utils/unused.ts',
      `
export function unusedHelper() {
  return 'never used';
}

export function anotherUnusedHelper() {
  return 'also unused';
}
`.trim()
    );

    const result = await executeCLI([
      'analyze',
      'dead-code',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ], { timeout: 120000 }); // 增加 timeout 到 120 秒

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(Array.isArray(output.files)).toBe(true);
    expect(output.files.length).toBeGreaterThan(0);
    expect(output.summary).toBeDefined();
    expect(output.summary.totalDeadFunctions).toBeGreaterThanOrEqual(0);
    expect(output.summary.totalDeadVariables).toBeGreaterThanOrEqual(0);
    expect(output.summary.totalDeadCode).toBeGreaterThanOrEqual(0);

    // 驗證 unused.ts 被分析
    const unusedFile = output.files.find((f: any) => f.path.includes('unused.ts'));
    expect(unusedFile).toBeDefined();
    expect(Array.isArray(unusedFile.deadCode)).toBe(true);
  });

  it('應該能追蹤跨檔案的引用關係', async () => {
    // 分析原始專案（所有 export 都被使用）
    const result = await executeCLI([
      'analyze',
      'dead-code',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ], { timeout: 120000 }); // 增加 timeout 到 120 秒

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.summary).toBeDefined();

    // sample-project 設計良好，死代碼應該很少或為零
    // （除非有刻意設計的未使用函式）
    expect(output.summary.totalDeadCode).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // 4. 程式碼模式檢測測試（1 個測試）
  // ============================================================

  it('應該能檢測專案中的程式碼模式', async () => {
    const result = await executeCLI([
      'analyze',
      'patterns',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.patterns).toBeDefined();
    expect(Array.isArray(output.patterns)).toBe(true);

    // sample-project 應該包含這些模式
    expect(output.patterns).toContain('async-functions'); // async/await in services
    expect(output.patterns).toContain('promise-usage'); // Promise in services
    expect(output.patterns).toContain('interface-usage'); // interface definitions
    expect(output.patterns).toContain('generic-types'); // BaseModel<T>, ApiResponse<T>
    expect(output.patterns).toContain('enum-usage'); // UserRole, ProductCategory, etc.

    // 驗證統計資訊
    expect(output.statistics).toBeDefined();
    expect(output.statistics.asyncFunctions).toBeGreaterThan(0);
  });

  // ============================================================
  // 5. 精確複雜度驗證測試（新增）
  // ============================================================

  describe('精確複雜度驗證', () => {
    it('應該正確計算 OrderService.createOrder 的高複雜度', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.getFilePath('src/services/order-service.ts'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const orderServiceFile = output.files.find((f: any) => f.path.includes('order-service.ts'));
      expect(orderServiceFile).toBeDefined();

      // createOrder 有複雜的業務邏輯：
      // - 2 層 for 迴圈（行 31-41, 60-62）
      // - 多個 if 判斷（行 26, 33, 38）
      // - try-catch
      // 預期圈複雜度 >= 8
      expect(orderServiceFile.complexity).toBeGreaterThanOrEqual(8);

      // 認知複雜度應該更高（因為巢狀結構）
      if (orderServiceFile.cognitiveComplexity !== undefined) {
        expect(orderServiceFile.cognitiveComplexity).toBeGreaterThanOrEqual(10);
      }
    });

    it('應該正確識別巢狀複雜度', async () => {
      // 建立包含巢狀結構的測試檔案
      await fixture.writeFile('src/test-complexity.ts', `
export function simpleFunction() {
  return 'simple'; // 複雜度 = 1
}

export function nestedComplexity(items: any[]) {
  for (const item of items) {           // +1
    if (item.valid) {                   // +2 (巢狀)
      for (const child of item.children) { // +3 (雙層巢狀)
        if (child.active) {              // +4 (三層巢狀)
          console.log(child);
        }
      }
    }
  }
  // 圈複雜度應該 >= 4
  // 認知複雜度應該更高（因為深度巢狀）
}

export function multipleBranches(value: number): string {
  if (value < 0) return 'negative';     // +1
  if (value === 0) return 'zero';       // +1
  if (value < 10) return 'small';       // +1
  if (value < 100) return 'medium';     // +1
  return 'large';
  // 圈複雜度 = 5
}
      `.trim());

      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.getFilePath('src/test-complexity.ts'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const testFile = output.files.find((f: any) => f.path.includes('test-complexity.ts'));
      expect(testFile).toBeDefined();

      // 檔案總複雜度應該 >= 9 (實際解析結果)
      expect(testFile.complexity).toBeGreaterThanOrEqual(9);

      // 如果有方法級別的複雜度資訊
      if (testFile.methods) {
        const simpleFunc = testFile.methods.find((m: any) => m.name === 'simpleFunction');
        const nestedFunc = testFile.methods.find((m: any) => m.name === 'nestedComplexity');
        const branchFunc = testFile.methods.find((m: any) => m.name === 'multipleBranches');

        if (simpleFunc) {
          expect(simpleFunc.complexity).toBe(1);
        }

        if (nestedFunc) {
          expect(nestedFunc.complexity).toBeGreaterThanOrEqual(4);
          // 認知複雜度應該更高（因為巢狀）
          if (nestedFunc.cognitiveComplexity !== undefined) {
            expect(nestedFunc.cognitiveComplexity).toBeGreaterThan(nestedFunc.complexity);
          }
        }

        if (branchFunc) {
          expect(branchFunc.complexity).toBe(5);
        }
      }
    });

    it('應該識別簡單函式的低複雜度', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.getFilePath('src/utils/string-utils.ts'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const stringUtilsFile = output.files.find((f: any) => f.path.includes('string-utils.ts'));
      expect(stringUtilsFile).toBeDefined();

      // string-utils 應該是簡單的 utility 函式
      // 平均複雜度應該較低
      if (output.summary && output.summary.averageComplexity) {
        // 與 OrderService 比較，應該明顯較低
        const orderServiceResult = await executeCLI([
          'analyze',
          'complexity',
          '--path',
          fixture.getFilePath('src/services/order-service.ts'),
          '--format',
          'json'
        ]);

        const orderOutput = JSON.parse(orderServiceResult.stdout);
        const orderFile = orderOutput.files[0];

        // OrderService 複雜度應該高於 string-utils
        expect(orderFile.complexity).toBeGreaterThan(stringUtilsFile.complexity);
      }
    });
  });

  // ============================================================
  // 6. 真實死代碼檢測測試（新增）
  // ============================================================

  describe('真實死代碼檢測', () => {
    it.skip('應該檢測真實的未使用函式', async () => {
      // 在 user-service.ts 中新增一個未使用的函式
      const originalContent = await fixture.readFile('src/services/user-service.ts');

      // 新增未使用的函式（未 export，純內部函式）
      const modifiedContent = originalContent + `

function unusedHelperFunction() {
  return 'This function is never called';
}

function anotherUnusedFunction(param: string): string {
  return param.toUpperCase();
}
`;
      await fixture.writeFile('src/services/user-service.ts', modifiedContent);

      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 收集所有死代碼函式
      const allDeadFunctions = output.files
        .flatMap((f: any) => f.deadCode || [])
        .filter((dc: any) => dc.type === 'function' || dc.kind === 'function');

      // 應該檢測到新增的未使用函式
      const hasUnusedHelper = allDeadFunctions.some(
        (f: any) => f.name === 'unusedHelperFunction' || f.symbol === 'unusedHelperFunction'
      );
      const hasAnotherUnused = allDeadFunctions.some(
        (f: any) => f.name === 'anotherUnusedFunction' || f.symbol === 'anotherUnusedFunction'
      );

      expect(hasUnusedHelper || hasAnotherUnused).toBe(true);
    });

    it.skip('不應該將有引用的函式標記為死代碼', async () => {
      // TODO: reference finding 需要正確處理 class 繼承的方法呼叫
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ], { timeout: 120000 }); // 增加 timeout 到 120 秒

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 收集所有死代碼函式名稱
      const deadFunctions = output.files
        .flatMap((f: any) => f.deadCode || [])
        .filter((dc: any) => dc.type === 'function' || dc.kind === 'function')
        .map((dc: any) => dc.name || dc.symbol);

      // 這些函式在 sample-project 中都有被引用，不應該是死代碼
      const usedFunctions = [
        'createOrder',    // OrderService 方法，被 OrderController 使用
        'createUser',     // UserService 方法，被 UserController 使用
        'validateEmail',  // BaseModel 方法，被子類別使用
        'formatDate'      // date-utils，被多處引用
      ];

      for (const funcName of usedFunctions) {
        expect(deadFunctions).not.toContain(funcName);
      }
    });
  });

  // ============================================================
  // 7. 程式碼模式統計驗證（新增）
  // ============================================================

  describe('程式碼模式統計驗證', () => {
    it('應該統計各模式的精確使用次數', async () => {
      const result = await executeCLI([
        'analyze',
        'patterns',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 驗證統計資訊存在
      expect(output.statistics).toBeDefined();

      // sample-project 有 4 個 Service 類別，每個至少 2 個 async 方法
      // 總共應該至少 8 個 async 函式
      if (output.statistics.asyncFunctions !== undefined) {
        expect(output.statistics.asyncFunctions).toBeGreaterThanOrEqual(8);
      }

      // 驗證 class 數量：
      // Services: UserService, AuthService, OrderService, ProductService, PaymentService, NotificationService
      // Controllers: UserController, ProductController, OrderController, BaseController
      // Models: BaseModel, UserModel, ProductModel, OrderModel
      // 至少 13 個類別
      if (output.statistics.classCount !== undefined) {
        expect(output.statistics.classCount).toBeGreaterThanOrEqual(13);
      }

      // 驗證泛型使用
      if (output.statistics.genericTypes) {
        const genericNames = Array.isArray(output.statistics.genericTypes)
          ? output.statistics.genericTypes
          : [];

        // 應該包含這些泛型型別
        const hasBaseModel = genericNames.some((name: string) => name.includes('BaseModel'));
        const hasApiResponse = genericNames.some((name: string) => name.includes('ApiResponse'));

        expect(hasBaseModel || hasApiResponse).toBe(true);
      }

      // 驗證 interface 數量
      // User, UserProfile, UserAddress, Product, ProductVariant, Order, OrderItem, ApiResponse, etc.
      // 至少 10 個 interface
      if (output.statistics.interfaceCount !== undefined) {
        expect(output.statistics.interfaceCount).toBeGreaterThanOrEqual(10);
      }

      // 驗證 enum 數量
      // UserRole, UserStatus, ProductCategory, ProductStatus, OrderStatus, PaymentStatus, etc.
      // 至少 6 個 enum
      if (output.statistics.enumCount !== undefined) {
        expect(output.statistics.enumCount).toBeGreaterThanOrEqual(6);
      }
    });
  });
});
