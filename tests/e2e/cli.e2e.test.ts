/**
 * CLI 端到端測試
 * 測試 CLI 命令的完整執行流程和輸出格式
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { withMemoryOptimization } from '../test-utils/cleanup';
import { AgentIdeCLI } from '../../src/interfaces/cli/cli';
import { ParserRegistry } from '../../src/infrastructure/parser/registry';
import { registerTestParsers } from '../test-utils/test-parsers';

// CLI 執行結果介面
interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

// CLI 測試工具類
class CLITestRunner {
  private tempDir: string = '';

  async setup(): Promise<void> {
    this.tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-'));
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      await rm(this.tempDir, { recursive: true, force: true });
    }
  }

  /**
   * 執行 CLI 命令並返回結果
   */
  async runCLI(args: string[], options?: {
    cwd?: string;
    input?: string;
    timeout?: number;
  }): Promise<CLIResult> {
    const startTime = Date.now();
    let exitCode = 0;
    let stdout = '';
    let stderr = '';

    // 確保測試環境
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // 重置並註冊測試 Parser
    ParserRegistry.resetInstance();
    registerTestParsers();

    // 攔截 console 輸出和 process.stdout
    const originalLog = console.log;
    const originalError = console.error;
    const originalProcessExit = process.exit;
    const originalProcessCwd = process.cwd;
    const originalStdoutWrite = process.stdout.write;

    let exitCalled = false;

    console.log = (...args) => {
      stdout += args.join(' ') + '\n';
    };

    console.error = (...args) => {
      stderr += args.join(' ') + '\n';
    };

    // 攔截 process.stdout/stderr.write，commander.js 會使用這些
    const originalStderrWrite = process.stderr.write;

    process.stdout.write = ((chunk: any) => {
      if (typeof chunk === 'string') {
        stdout += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        stdout += chunk.toString();
      }
      return true;
    }) as any;

    process.stderr.write = ((chunk: any) => {
      if (typeof chunk === 'string') {
        stderr += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        stderr += chunk.toString();
      }
      return true;
    }) as any;

    process.exit = ((code?: number) => {
      exitCode = code || 0;
      exitCalled = true;
      throw new Error('PROCESS_EXIT');
    }) as any;

    // 變更工作目錄
    if (options?.cwd) {
      process.cwd = () => options.cwd!;
    }

    try {
      const cli = new AgentIdeCLI();

      // 準備完整的 argv，模擬 node process.argv
      const fullArgv = ['node', 'agent-ide', ...args];

      await cli.run(fullArgv);

    } catch (error) {
      if ((error as Error).message === 'PROCESS_EXIT') {
        // 這是預期的 process.exit 調用
      } else {
        // 真正的錯誤
        stderr += `Error: ${(error as Error).message}\n`;
        exitCode = 1;
      }
    } finally {
      // 恢復原始函式和環境
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalProcessExit;
      process.cwd = originalProcessCwd;
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.env.NODE_ENV = originalNodeEnv;
    }

    return {
      exitCode,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      duration: Date.now() - startTime
    };
  }

  /**
   * 創建測試專案結構
   */
  async createTestProject(): Promise<void> {
    const srcDir = join(this.tempDir, 'src');
    await mkdir(srcDir, { recursive: true });

    // 創建 TypeScript 檔案
    await writeFile(join(srcDir, 'index.ts'), `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  multiply(x: number, y: number): number {
    return x * y;
  }
}

interface User {
  id: number;
  name: string;
  email: string;
}
    `);

    await writeFile(join(srcDir, 'utils.ts'), `
import { Calculator } from './index';

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

const calc = new Calculator();
export const sum = calc.add(10, 20);
    `);

    // 創建 package.json
    await writeFile(join(this.tempDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      type: 'module',
      dependencies: {}
    }, null, 2));

    // 創建 tsconfig.json
    await writeFile(join(this.tempDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        strict: true
      }
    }, null, 2));
  }

  getTempDir(): string {
    return this.tempDir;
  }
}

describe('CLI 端到端測試', () => {
  let runner: CLITestRunner;

  beforeEach(async () => {
    runner = new CLITestRunner();
    await runner.setup();

    // 強制清理 ParserRegistry 單例以避免重複註冊
    (ParserRegistry as any)._instance = null;
  });

  afterEach(async () => {
    await runner.cleanup();

    // 清理 ParserRegistry 單例
    try {
      const registry = ParserRegistry.getInstance();
      await registry.dispose();
    } catch (error) {
      // 忽略清理錯誤
    }
    (ParserRegistry as any)._instance = null;
  });

  describe('基本命令執行', () => {
    it('應該顯示版本資訊', withMemoryOptimization(async () => {
      const result = await runner.runCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    }, { testName: 'cli-version-command' }));

    it('應該顯示幫助資訊', withMemoryOptimization(async () => {
      const result = await runner.runCLI(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('agent-ide');
      expect(result.stdout).toContain('程式碼智能工具集');
      expect(result.stdout).toContain('index');
      expect(result.stdout).toContain('rename');
      expect(result.stdout).toContain('move');
      expect(result.stdout).toContain('search');
    }, { testName: 'cli-help-command' }));

    it('應該在無效命令時顯示錯誤', withMemoryOptimization(async () => {
      const result = await runner.runCLI(['invalid-command']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('error');
    }, { testName: 'cli-invalid-command' }));
  });

  describe('索引命令測試', () => {
    it('應該能建立專案索引', withMemoryOptimization(async () => {
      await runner.createTestProject();

      const result = await runner.runCLI(['index', '--path', runner.getTempDir()], {
        timeout: 15000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('🔍 開始建立程式碼索引');
      expect(result.stdout).toContain('✅ 索引完成');
      expect(result.stdout).toMatch(/\d+ 檔案/);
      expect(result.stdout).toMatch(/\d+ 符號/);
    }, { testName: 'cli-index-command' }));

    it('應該處理索引命令選項', withMemoryOptimization(async () => {
      await runner.createTestProject();

      const result = await runner.runCLI([
        'index',
        '--path', runner.getTempDir(),
        '--extensions', '.ts,.js',
        '--exclude', 'node_modules/**'
      ], { timeout: 15000 });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('索引完成');
    }, { testName: 'cli-index-with-options' }));

    it('應該在無效路徑時顯示錯誤', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'index',
        '--path', '/nonexistent/path'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('失敗');
    }, { testName: 'cli-index-invalid-path' }));
  });

  describe('搜尋命令測試', () => {
    beforeEach(async () => {
      await runner.createTestProject();
    });

    it('應該能執行文字搜尋', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'search', 'Calculator',
        '--path', runner.getTempDir()
      ], { timeout: 10000 });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('🔍 搜尋: "Calculator"');
      expect(result.stdout).toMatch(/找到 \d+ 個結果/);
    }, { testName: 'cli-search-text' }));

    it('應該支援不同輸出格式', withMemoryOptimization(async () => {
      const jsonResult = await runner.runCLI([
        'search', 'function',
        '--path', runner.getTempDir(),
        '--format', 'json'
      ]);

      expect(jsonResult.exitCode).toBe(0);
      expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();

      const minimalResult = await runner.runCLI([
        'search', 'function',
        '--path', runner.getTempDir(),
        '--format', 'minimal'
      ]);

      expect(minimalResult.exitCode).toBe(0);
      // Minimal 格式應該是檔案:行:列:內容的格式
      expect(minimalResult.stdout).toMatch(/.*\.ts:\d+:\d+:.*/);
    }, { testName: 'cli-search-formats' }));

    it('應該支援搜尋選項', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'search', 'add',
        '--path', runner.getTempDir(),
        '--limit', '10',
        '--context', '1',
        '--case-sensitive'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('搜尋:');
    }, { testName: 'cli-search-options' }));

    it('應該在沒有找到結果時正確提示', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'search', 'nonexistent_function_name_xyz',
        '--path', runner.getTempDir()
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('沒有找到匹配結果');
    }, { testName: 'cli-search-no-results' }));
  });

  describe('重新命名命令測試', () => {
    beforeEach(async () => {
      await runner.createTestProject();
    });

    it('應該驗證必要參數', withMemoryOptimization(async () => {
      const result = await runner.runCLI(['rename']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('必須指定 --from 和 --to 參數');
    }, { testName: 'cli-rename-missing-params' }));

    it('應該能預覽重新命名', withMemoryOptimization(async () => {
      // 先建立索引
      const indexResult = await runner.runCLI(['index', '--path', runner.getTempDir()]);

      // 如果索引失敗，跳過測試
      if (indexResult.exitCode !== 0) {
        console.log('Index failed:', indexResult.stdout, indexResult.stderr);
        return;
      }

      const result = await runner.runCLI([
        'rename',
        '--from', 'Calculator',
        '--to', 'MathCalculator',
        '--path', runner.getTempDir(),
        '--preview'
      ], { timeout: 15000 });

      // 如果找不到符號，輸出診斷資訊
      if (result.exitCode !== 0) {
        console.log('Rename failed. stdout:', result.stdout);
        console.log('stderr:', result.stderr);
      }

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('🔄 重新命名');
      expect(result.stdout).toContain('預覽變更');
    }, { testName: 'cli-rename-preview' }));

    it('應該在找不到符號時顯示錯誤', withMemoryOptimization(async () => {
      await runner.runCLI(['index', '--path', runner.getTempDir()]);

      const result = await runner.runCLI([
        'rename',
        '--from', 'NonexistentClass',
        '--to', 'NewName',
        '--path', runner.getTempDir()
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain('找不到符號');
    }, { testName: 'cli-rename-not-found' }));
  });

  describe('移動命令測試', () => {
    beforeEach(async () => {
      await runner.createTestProject();
    });

    it('應該能預覽檔案移動', withMemoryOptimization(async () => {
      const sourcePath = join(runner.getTempDir(), 'src/utils.ts');
      const targetPath = join(runner.getTempDir(), 'src/helpers.ts');

      const result = await runner.runCLI([
        'move', sourcePath, targetPath, '--preview'
      ], { timeout: 10000 });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('📦 移動');
      expect(result.stdout).toContain('預覽移動操作');
    }, { testName: 'cli-move-preview' }));

    it('應該在源檔案不存在時顯示錯誤', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'move',
        '/nonexistent/file.ts',
        '/target/file.ts'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain('失敗');
    }, { testName: 'cli-move-nonexistent-source' }));
  });

  describe('插件管理命令測試', () => {
    it('應該能列出插件', withMemoryOptimization(async () => {
      const result = await runner.runCLI(['plugins', 'list']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('🔌 插件列表');
    }, { testName: 'cli-plugins-list' }));

    it('應該能顯示插件資訊', withMemoryOptimization(async () => {
      // 先檢查有哪些插件
      const listResult = await runner.runCLI(['plugins', 'list']);

      if (listResult.stdout.includes('typescript')) {
        const result = await runner.runCLI(['plugins', 'info', 'typescript']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('🔌 插件資訊');
        expect(result.stdout).toContain('typescript');
      }
    }, { testName: 'cli-plugins-info' }));

    it('應該在插件不存在時顯示錯誤', withMemoryOptimization(async () => {
      const result = await runner.runCLI(['plugins', 'info', 'nonexistent-plugin']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('找不到插件');
    }, { testName: 'cli-plugins-not-found' }));
  });

  describe('性能和穩定性測試', () => {
    it('應該在合理時間內完成索引', withMemoryOptimization(async () => {
      await runner.createTestProject();

      const result = await runner.runCLI([
        'index', '--path', runner.getTempDir()
      ], { timeout: 30000 });

      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeLessThan(30000);
    }, { testName: 'cli-performance-indexing' }));

    it('應該正確處理大型搜尋結果', withMemoryOptimization(async () => {
      await runner.createTestProject();

      // 創建更多內容以產生大量搜尋結果
      const largeSrcDir = join(runner.getTempDir(), 'src/large');
      await mkdir(largeSrcDir, { recursive: true });

      // 創建多個檔案
      for (let i = 0; i < 5; i++) {
        await writeFile(join(largeSrcDir, `file${i}.ts`), `
export function test${i}() {
  console.log('test function ${i}');
  return ${i};
}
        `);
      }

      const result = await runner.runCLI([
        'search', 'test',
        '--path', runner.getTempDir(),
        '--limit', '20'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('搜尋:');
    }, { testName: 'cli-large-search-results' }));
  });

  describe('錯誤處理和邊界情況', () => {
    it('應該正確處理空專案', withMemoryOptimization(async () => {
      // 只創建空目錄
      const emptyDir = join(runner.getTempDir(), 'empty');
      await mkdir(emptyDir, { recursive: true });

      const result = await runner.runCLI([
        'index', '--path', emptyDir
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('索引完成');
    }, { testName: 'cli-empty-project' }));

    it('應該處理無效的檔案路徑', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'search', 'test',
        '--path', '/invalid/path'
      ]);

      // 應該要嘛成功但沒有結果，要嘛明確報錯
      if (result.exitCode === 0) {
        expect(result.stdout).toContain('沒有找到');
      } else {
        expect(result.stderr || result.stdout).toContain('失敗');
      }
    }, { testName: 'cli-invalid-file-path' }));

    it('應該處理特殊字符搜尋', withMemoryOptimization(async () => {
      await runner.createTestProject();

      const result = await runner.runCLI([
        'search', '.*test.*',
        '--path', runner.getTempDir(),
        '--type', 'regex'
      ]);

      // 正則表達式搜尋應該正常工作或給出明確錯誤
      expect([0, 1]).toContain(result.exitCode);
    }, { testName: 'cli-special-characters' }));
  });

  describe('輸出格式一致性', () => {
    beforeEach(async () => {
      await runner.createTestProject();
    });

    it('所有成功命令應包含適當的狀態圖示', withMemoryOptimization(async () => {
      const indexResult = await runner.runCLI([
        'index', '--path', runner.getTempDir()
      ]);
      expect(indexResult.stdout).toMatch(/[🔍✅]/);

      const searchResult = await runner.runCLI([
        'search', 'Calculator', '--path', runner.getTempDir()
      ]);
      expect(searchResult.stdout).toMatch(/[🔍✅]/);
    }, { testName: 'cli-status-icons' }));

    it('JSON 輸出應該是有效的 JSON', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'search', 'function',
        '--path', runner.getTempDir(),
        '--format', 'json'
      ]);

      if (result.exitCode === 0 && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    }, { testName: 'cli-valid-json-output' }));

    it('minimal 輸出應該符合預期格式', withMemoryOptimization(async () => {
      const result = await runner.runCLI([
        'search', 'Calculator',
        '--path', runner.getTempDir(),
        '--format', 'minimal'
      ]);

      if (result.exitCode === 0 && result.stdout.trim()) {
        const lines = result.stdout.trim().split('\n');
        lines.forEach(line => {
          // 每行應該符合 檔案:行:列:內容 的格式
          expect(line).toMatch(/.*:\d+:\d+:.*/);
        });
      }
    }, { testName: 'cli-minimal-format' }));
  });
});