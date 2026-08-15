/**
 * CLI change-signature 命令 E2E 測試
 * 基於 sample-project fixture 測試函式簽章修改功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ts from 'typescript';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  function expectValidTypeScript(sourceText: string): void {
    const sourceFile = ts.createSourceFile('generated.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(sourceFile.parseDiagnostics).toEqual([]);
  }

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('參數重排序 - 基本功能', () => {
    it('應該支援文件宣告的 --file 和 --function 形式', async () => {
      await fixture.writeFile('src/doc-option-form.ts', `
function calculate(a: number, b: number): number {
  return a - b;
}

const result = calculate(10, 5);
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', 'src/doc-option-form.ts',
          '--function', 'calculate',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.files.length).toBeGreaterThan(0);
    });

    it('應該成功重排序兩個參數', async () => {
      const testFile = `${fixture.rootPath}/test-reorder.ts`;
      await fixture.memfs.writeFile(testFile, `
function calculate(a: number, b: number): number {
  return a - b;
}

const result = calculate(10, 5);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'calculate', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式驗證（change-signature 映射到 refactor）
        expect(output.command).toBe('refactor');
        expect(output.files.length).toBeGreaterThan(0);
      }
    });

    it('應該成功重排序三個參數', async () => {
      const testFile = `${fixture.rootPath}/test-reorder-three.ts`;
      await fixture.memfs.writeFile(testFile, `
function format(prefix: string, value: number, suffix: string): string {
  return prefix + value + suffix;
}

const text = format('[', 42, ']');
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

    it('應該更新所有呼叫點的參數順序', async () => {
      const testFile = `${fixture.rootPath}/test-reorder-calls.ts`;
      await fixture.memfs.writeFile(testFile, `
function add(x: number, y: number): number {
  return x + y;
}

const a = add(1, 2);
const b = add(3, 4);
const c = add(5, 6);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'y,x', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式：summary.totalChanges 代表變更數
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('新增參數 - 基本功能', () => {
    it('應該成功新增有預設值的參數', async () => {
      const testFile = `${fixture.rootPath}/test-add-param.ts`;
      await fixture.memfs.writeFile(testFile, `
function greet(name: string): string {
  return 'Hello, ' + name;
}

const msg = greet('World');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'greet', '-p', fixture.rootPath, '--add', 'greeting:string=Hello', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功新增多個參數', async () => {
      const testFile = `${fixture.rootPath}/test-add-multi.ts`;
      await fixture.memfs.writeFile(testFile, `
function log(message: string): void {
  console.log(message);
}

log('test');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'log', '-p', fixture.rootPath, '--add', 'level:string=info', '--add', 'timestamp:boolean=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該正確更新多行函式簽名', async () => {
      const testFile = `${fixture.rootPath}/test-add-multiline-signature.ts`;
      await fixture.memfs.writeFile(testFile, `
function log(
  message: string,
): void {
  console.log(message);
}

log('test');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'log', '-p', fixture.rootPath, '--add', 'level:string=info', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      expect(updated).toContain('function log(message: string, level: string = \'info\'): void {');
      expect(updated).not.toContain('  message: string,\n): void');
    });

    it('應該忽略參數預設字串中的右括號', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-string-paren.ts`;
      await fixture.memfs.writeFile(testFile, `
function log(
  message: string = ")",
): void {
  console.log(message);
}

log();
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'log', '-p', fixture.rootPath, '--add', 'level:string=info', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      expect(updated).toContain('message: string = ")"');
      expect(updated).toContain('level: string = \'info\'');
    });

    it('應該忽略參數預設 regex literal 中的右括號', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-regex-paren.ts`;
      await fixture.memfs.writeFile(testFile, `
function match(
  pattern: RegExp = /\\)/,
): boolean {
  return pattern.test(')');
}

match();
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'match', '-p', fixture.rootPath, '--add', 'strict:boolean=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      expect(updated).toContain('pattern: RegExp = /\\)/');
      expect(updated).toContain('strict: boolean = true');
    });

    it('應該忽略 arrow function 預設值回傳 regex literal 中的右括號', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-arrow-regex-paren.ts`;
      await fixture.memfs.writeFile(testFile, `
function match(
  getPattern = () => /\\)/,
): boolean {
  return getPattern().test(')');
}

match();
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'match', '-p', fixture.rootPath, '--add', 'strict:boolean=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      expect(updated).toContain('getPattern = () => /\\)/');
      expect(updated).toContain('strict: boolean = true');
    });

    it('應該用 AST 範圍處理 template literal interpolation 中的右括號', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-template-interpolation-paren.ts`;
      await fixture.memfs.writeFile(testFile, [
        'function format(input: string): string {',
        '  return input;',
        '}',
        '',
        'function render(',
        '  value: string = `${format(")")}`,',
        '): string {',
        '  return value;',
        '}',
        '',
        'render();',
        ''
      ].join('\n'));

      const result = await executeCLI(
        ['change-signature', testFile, 'render', '-p', fixture.rootPath, '--add', 'strict:boolean=true', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      expect(updated).toContain('value: string = `${format(")")}`');
      expect(updated).toContain('strict: boolean = true');
    });

    it('應該把未加引號的 string 預設值輸出為字串 literal', async () => {
      const testFile = `${fixture.rootPath}/test-add-string-default.ts`;
      await fixture.memfs.writeFile(testFile, `
function formatAmount(amount: number): string {
  return String(amount);
}

const text = formatAmount(42);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'formatAmount', '-p', fixture.rootPath, '--add', 'locale:string=en-US', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updatedContent = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expect(updatedContent).toContain('locale: string = \'en-US\'');
      expect(updatedContent).toContain('formatAmount(42, \'en-US\')');
      expect(updatedContent).not.toContain('formatAmount(42, en-US)');
    });

    it('應該使用 explicit call-site value 而不是 function default', async () => {
      const testFile = `${fixture.rootPath}/test-add-call-site-value.ts`;
      await fixture.memfs.writeFile(testFile, `
interface RequestOptions {
  cache: boolean;
}

function fetchData(url: string): string {
  return url;
}

const runtimeOptions = { cache: true };
const response = fetchData('/api');
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'fetchData',
          '-p', fixture.rootPath,
          '--add', 'options:RequestOptions={ cache: false }',
          '--call-site-value', 'options=runtimeOptions',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updatedContent = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expect(updatedContent).toContain('function fetchData(url: string, options: RequestOptions = { cache: false }): string');
      expect(updatedContent).toContain('const response = fetchData(\'/api\', runtimeOptions);');
      expect(updatedContent).not.toContain('fetchData(\'/api\', { cache: false })');
      expectValidTypeScript(updatedContent);
    });

    it('應該保留 explicit call-site expressions 的有效 TS 語法', async () => {
      const testFile = `${fixture.rootPath}/test-add-call-site-expressions.ts`;
      await fixture.memfs.writeFile(testFile, `
interface Options {
  cache: boolean;
  retries: number;
}

const runtimeLocale = 'zh-TW';

function configure(id: string): string {
  return id;
}

const result = configure('profile');
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'configure',
          '-p', fixture.rootPath,
          '--add',
          [
            'label:string=\'default\'',
            'enabled:boolean=false',
            'nullable:string=\'fallback\'',
            'missing:string=\'fallback\'',
            'options:Options={ cache: false, retries: 0 }',
            'locale:string=\'en-US\''
          ].join(','),
          '--call-site-value', 'label=\'runtime\'',
          '--call-site-value', 'enabled=true',
          '--call-site-value', 'nullable=null',
          '--call-site-value', 'missing=undefined',
          '--call-site-value', 'options={ cache: true, retries: 2 }',
          '--call-site-value', 'locale=runtimeLocale',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updatedContent = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expect(updatedContent).toContain(
        'configure(\'profile\', \'runtime\', true, null, undefined, { cache: true, retries: 2 }, runtimeLocale)'
      );
      expectValidTypeScript(updatedContent);
    });

    it('無效 call-site value mapping 應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-call-site-value.ts`;
      const originalContent = `
function render(name: string): string {
  return name;
}

const output = render('home');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', 'label:string=default',
          '--call-site-value', 'label',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('--call-site-value');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('無效 --add 語法應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-add-syntax.ts`;
      const originalContent = `
function render(name: string): string {
  return name;
}

const output = render('home');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', ':string=default',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('--add');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('缺少 function default 的 explicit call-site value 應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-missing-default-with-call-site-value.ts`;
      const originalContent = `
function render(name?: string): string {
  return name ?? 'home';
}

const output = render();
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', 'label:string',
          '--call-site-value', 'label=runtimeLabel',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('function default');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('無效 --add default expression 應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-add-default-expression.ts`;
      const originalContent = `
function render(name: string): string {
  return name;
}

const output = render('home');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', 'options:Options={ cache: true',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('--add');
      expect(output.error).toContain('default');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('--add default 引用同函式其他參數且未給 --call-site-value 應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-references-param-no-call-site-value.ts`;
      const originalContent = `
function fn(a: number, b: number): number {
  return a + b;
}

const result = fn(1, 2);
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'fn',
          '-p', fixture.rootPath,
          '--add', 'extra:number=a+1',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('--call-site-value');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('--add 純常數預設值（未引用其他參數）應照常成功', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-constant-no-call-site-value.ts`;
      const originalContent = `
function fn(a: number, b: number): number {
  return a + b;
}

const result = fn(1, 2);
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'fn',
          '-p', fixture.rootPath,
          '--add', 'extra:number=5',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updatedContent = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expect(updatedContent).toContain('function fn(a: number, b: number, extra: number = 5): number');
      expect(updatedContent).toContain('const result = fn(1, 2, 5);');
      expectValidTypeScript(updatedContent);
    });

    it('--add default 引用其他參數但有給 --call-site-value 應照常成功', async () => {
      const testFile = `${fixture.rootPath}/test-add-default-references-param-with-call-site-value.ts`;
      const originalContent = `
function fn(a: number, b: number): number {
  return a + b;
}

const result = fn(1, 2);
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'fn',
          '-p', fixture.rootPath,
          '--add', 'extra:number=a+1',
          '--call-site-value', 'extra=99',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updatedContent = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expect(updatedContent).toContain('function fn(a: number, b: number, extra: number = a+1): number');
      expect(updatedContent).toContain('const result = fn(1, 2, 99);');
      expectValidTypeScript(updatedContent);
    });

    it('無效 --add 參數名稱應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-add-name.ts`;
      const originalContent = `
function render(name: string): string {
  return name;
}

const output = render('home');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', 'bad-name:string=default',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('參數名稱');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('rest syntax 不能當作 --add 參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-add-rest-name.ts`;
      const originalContent = `
function render(name: string): string {
  return name;
}

const output = render('home');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', '...labels=[]',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('參數名稱');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('無效 --add TypeScript type 應 fast-fail 且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-add-type.ts`;
      const originalContent = `
function render(name: string): string {
  return name;
}

const output = render('home');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature',
          testFile,
          'render',
          '-p', fixture.rootPath,
          '--add', 'label:bad type=default',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('type');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });
  });

  describe('刪除參數 - 基本功能', () => {
    it('應該成功刪除未使用的參數', async () => {
      const testFile = `${fixture.rootPath}/test-remove-param.ts`;
      await fixture.memfs.writeFile(testFile, `
function process(data: string, unused: number): string {
  return data.toUpperCase();
}

const result = process('test', 123);
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

    it('刪除仍在函式 body 使用的參數應該失敗且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/test-remove-used-param.ts`;
      const originalContent = `
function process(data: string, suffix: string): string {
  return data + suffix;
}

const result = process('a', 'b');
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        ['change-signature', testFile, 'process', '-p', fixture.rootPath, '--remove', 'suffix', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('仍在函式 body 中使用');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });
  });

  describe('修改參數類型 - 基本功能', () => {
    it('應該成功修改參數類型', async () => {
      const testFile = `${fixture.rootPath}/test-change-type.ts`;
      await fixture.memfs.writeFile(testFile, `
function count(value: number): number {
  return value;
}

const n = count(42);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'count', '-p', fixture.rootPath, '--change-type', 'value:bigint', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('重命名參數 - 基本功能', () => {
    it('應該同步更新函式 body 內的參數引用', async () => {
      const testFile = `${fixture.rootPath}/test-rename-param-body.ts`;
      await fixture.memfs.writeFile(testFile, `
function describeUser(userId: string): string {
  const normalized = userId.trim();
  return 'User: ' + userId + ' (' + normalized + ')';
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'describeUser', '-p', fixture.rootPath, '--rename', 'userId:accountId', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updatedContent = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expect(updatedContent).toContain('function describeUser(accountId: string): string');
      expect(updatedContent).toContain('const normalized = accountId.trim();');
      expect(updatedContent).toContain('\'User: \' + accountId');
      expect(updatedContent).not.toContain('userId');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的函式', async () => {
      const testFile = `${fixture.rootPath}/test-nonexistent.ts`;
      await fixture.memfs.writeFile(testFile, 'const x = 1;');

      const result = await executeCLI(
        ['change-signature', testFile, 'nonExistent', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error).toContain('找不到函式');
    });

    it('應該處理無效的參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-invalid-param.ts`;
      await fixture.memfs.writeFile(testFile, `
function test(a: number): number {
  return a;
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath, '--reorder', 'x,y', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error).toContain('找不到參數');
    });

    it('應該處理不存在的檔案', async () => {
      const result = await executeCLI(
        ['change-signature', '/nonexistent/file.ts', 'test', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error.length).toBeGreaterThan(0);
    });

    it('應該處理語法錯誤的檔案', async () => {
      const testFile = `${fixture.rootPath}/test-syntax-error.ts`;
      await fixture.memfs.writeFile(testFile, 'function broken( { return; }');

      const result = await executeCLI(
        ['change-signature', testFile, 'broken', '-p', fixture.rootPath, '--reorder', 'a,b', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.command).toBe('change-signature');
      expect(output.error.length).toBeGreaterThan(0);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-json.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b: number): number { return a + b; }
const x = fn(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('refactor');
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(2);
      expect(output.files.length).toBe(1);

      const changedContent = output.files
        .flatMap((file: { hunks: Array<{ lines: Array<{ content: string }> }> }) => file.hunks)
        .flatMap((hunk: { lines: Array<{ content: string }> }) => hunk.lines)
        .map((line: { content: string }) => line.content)
        .join('\n');
      expect(changedContent).toContain('function fn(b: number, a: number): number');
      expect(changedContent).toContain('const x = fn(2, 1);');
    });

    it('應該支援 summary 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-summary.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b: number): number { return a + b; }
const x = fn(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Files: 1');
      expect(result.stdout).toContain('Changes:');
      expect(result.stdout).toContain('test-format-summary.ts');
    });

    it('應該支援 diff 格式輸出', async () => {
      const testFile = `${fixture.rootPath}/test-format-diff.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b: number): number { return a + b; }
const x = fn(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'fn', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--- a/');
      expect(result.stdout).toContain('+++ b/');
      expect(result.stdout).toContain('function fn(b: number, a: number): number');
      expect(result.stdout).toContain('const x = fn(2, 1);');
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const testFile = `${fixture.rootPath}/test-dry-run.ts`;
      const originalContent = `
function calc(a: number, b: number): number {
  return a - b;
}
const result = calc(10, 5);
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

    it('dry-run JSON 應正確呈現多行呼叫點更新', async () => {
      const testFile = `${fixture.rootPath}/test-dry-run-multiline-call.ts`;
      const originalContent = [
        'function calc(a: number, b: number): number {',
        '  return a - b;',
        '}',
        '',
        'const result = calc(',
        '  10,',
        '  5,',
        ');',
        ''
      ].join('\n');
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        ['change-signature', testFile, 'calc', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const fileContent = await fixture.memfs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe(originalContent);

      const output = JSON.parse(result.stdout);
      const changedLines = output.files.flatMap((file: any) =>
        file.hunks.flatMap((hunk: any) => hunk.lines)
      );
      // 多行呼叫的引數應在預覽中正確對調；未變更的函式名行與 `);` 行應呈現為 context，
      // 不得出現假的 delete+add
      expect(changedLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'delete', content: '  10,' }),
          expect.objectContaining({ type: 'delete', content: '  5,' }),
          expect.objectContaining({ type: 'add', content: '  5,' }),
          expect.objectContaining({ type: 'add', content: '  10,' })
        ])
      );
      const addDelContents = changedLines
        .filter((l: any) => l.type === 'delete' || l.type === 'add')
        .map((l: any) => l.content);
      expect(addDelContents).not.toContain('const result = calc(');
      expect(addDelContents).not.toContain(');');
    });
  });

  describe('極端測試標準 - 大量參數（50+ 個）', () => {
    it('應該處理 55 個參數的函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-many-params.ts`;
      const params = Array.from({ length: 55 }, (_, i) => `p${i}: number`).join(', ');
      const paramNames = Array.from({ length: 55 }, (_, i) => `p${i}`);
      const args = Array.from({ length: 55 }, (_, i) => i).join(', ');

      await fixture.memfs.writeFile(testFile, `
function manyParams(${params}): number {
  return ${paramNames.join(' + ')};
}

const result = manyParams(${args});
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
    it('應該處理有 60+ 呼叫點的函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-many-calls.ts`;
      const calls = Array.from({ length: 65 }, (_, i) => `const r${i} = add(${i}, ${i + 1});`).join('\n');

      await fixture.memfs.writeFile(testFile, `
function add(x: number, y: number): number {
  return x + y;
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
        // 使用新的 PreviewResult 格式：summary.totalChanges 代表變更數
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(65);
      }
    });
  });

  describe('極端測試標準 - 深層巢狀（10+ 層）', () => {
    it('應該處理 12 層巢狀結構中的函式簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-deep-nested.ts`;
      const nestOpen = Array.from({ length: 12 }, (_, i) => `${'  '.repeat(i)}function level${i}() {`).join('\n');
      const nestClose = Array.from({ length: 12 }, (_, i) => `${'  '.repeat(11 - i)}}`).join('\n');

      await fixture.memfs.writeFile(testFile, `
function target(a: number, b: string): string {
  return b + a;
}

${nestOpen}
${'  '.repeat(12)}const x = target(1, 'test');
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
    it('應該處理 500+ 行函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-long-function.ts`;
      const longBody = Array.from({ length: 500 }, (_, i) => `  const v${i} = a + b + ${i};`).join('\n');

      await fixture.memfs.writeFile(testFile, `
function longFunction(a: number, b: number): number {
${longBody}
  return v499;
}

const result = longFunction(1, 2);
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

  describe('極端測試標準 - 跨檔案呼叫（50+ 檔案）', () => {
    it('應該處理被 60 個檔案引用的函式簽章修改', async () => {
      // 創建主檔案
      await fixture.writeFile('src/utils.ts', `
export function sharedFn(x: number, y: string): string {
  return y + x;
}
`);

      // 創建 60 個引用檔案
      for (let i = 0; i < 60; i++) {
        await fixture.writeFile(`src/consumers/file${i}.ts`, `
import { sharedFn } from '../utils';
export const result${i} = sharedFn(${i}, 'value');
`);
      }

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/utils.ts'), 'sharedFn', '--reorder', 'y,x', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
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
    it('應該處理超長參數名稱', async () => {
      const testFile = `${fixture.rootPath}/test-long-names.ts`;
      const longName1 = 'a'.repeat(100);
      const longName2 = 'b'.repeat(100);

      await fixture.memfs.writeFile(testFile, `
function test(${longName1}: number, ${longName2}: string): string {
  return ${longName2} + ${longName1};
}

const r = test(1, 'x');
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
    it('應該同時支援重排序和新增參數', async () => {
      const testFile = `${fixture.rootPath}/test-combo.ts`;
      await fixture.memfs.writeFile(testFile, `
function combo(a: number, b: string): string {
  return b + a;
}

const r = combo(1, 'x');
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'combo', '-p', fixture.rootPath, '--reorder', 'b,a', '--add', 'c:boolean=true', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('回歸: 呼叫點與 body 編輯正確性', () => {
    it('--add 與 --reorder 併用時不得丟棄新增的參數', async () => {
      const testFile = `${fixture.rootPath}/regression-add-reorder.ts`;
      await fixture.memfs.writeFile(testFile, `
function add(a: number, b: number): number {
  return a + b;
}

const result = add(1, 2);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--add', 'c:boolean=true', '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      // 新增的參數 c 必須保留（重排不得吃掉它）
      expect(updated).toContain('c: boolean = true');
      // 定義順序應為 b, a, c
      expect(updated).toMatch(/function add\(\s*b: number,\s*a: number,\s*c: boolean = true\s*\): number/);
      // 呼叫點應同時重排並補上新增參數的值
      expect(updated).toContain('add(2, 1, true)');
    });

    it('同一行多個（含巢狀）呼叫點應各自正確重排', async () => {
      const testFile = `${fixture.rootPath}/regression-multi-call.ts`;
      await fixture.memfs.writeFile(testFile, `
function add(a: number, b: number): number {
  return a + b;
}

const sum = add(1, 2) + add(3, 4);
const nested = add(add(5, 6), 7);
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'b,a', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      // 同一行兩個獨立呼叫各自重排，不得互相覆寫
      expect(updated).toContain('const sum = add(2, 1) + add(4, 3);');
      // 巢狀呼叫：內外層都重排，且不得遺失任何引數
      expect(updated).toContain('const nested = add(7, add(6, 5));');
    });

    it('--rename 不得改動物件 shorthand 屬性鍵（應展開保留鍵）', async () => {
      const testFile = `${fixture.rootPath}/regression-rename-shorthand.ts`;
      await fixture.memfs.writeFile(testFile, `
function build(userId: string): { userId: string } {
  return { userId };
}
`.trim());

      const result = await executeCLI(
        ['change-signature', testFile, 'build', '-p', fixture.rootPath, '--rename', 'userId:accountId', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
      expectValidTypeScript(updated);
      // 參數本身重命名
      expect(updated).toContain('function build(accountId: string)');
      // shorthand 須展開成 key: value，保留對外屬性鍵 userId
      expect(updated).toContain('return { userId: accountId };');
      // 不得把屬性鍵一起改名
      expect(updated).not.toContain('{ accountId }');
      // 回傳型別註解的屬性鍵不受影響
      expect(updated).toContain('{ userId: string }');
    });
  });

  describe('Class 方法', () => {
    it('存在方法呼叫點時應拒絕 class 方法的簽章修改（無 receiver 型別解析，重寫不安全）', async () => {
      const testFile = `${fixture.rootPath}/test-class-method.ts`;
      const source = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}

const calc = new Calculator();
const result = calc.add(1, 2);
`.trim();
      await fixture.memfs.writeFile(testFile, source);

      const result = await executeCLI(
        ['change-signature', testFile, 'add', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // T1 修復後語意：偵測到方法呼叫點（calc.add(1, 2)）即拒絕，非零 exit 且檔案不變，
      // 不得成功執行卻靜默跳過方法呼叫點造成定義與呼叫點不一致
      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(source);
    });
  });

  describe('Arrow Function', () => {
    it('應該處理 arrow function 的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-arrow.ts`;
      await fixture.memfs.writeFile(testFile, `
const multiply = (x: number, y: number): number => x * y;

const result = multiply(3, 4);
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

  describe('Async Function', () => {
    it('應該處理 async function 的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-async.ts`;
      await fixture.memfs.writeFile(testFile, `
async function fetchData(url: string, timeout: number): Promise<string> {
  return url;
}

const data = await fetchData('/api', 5000);
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
  });

  describe('Generic Function', () => {
    it('應該處理泛型函式的簽章修改', async () => {
      const testFile = `${fixture.rootPath}/test-generic.ts`;
      await fixture.memfs.writeFile(testFile, `
function identity<T>(value: T, label: string): T {
  console.log(label);
  return value;
}

const num = identity(42, 'number');
const str = identity('hello', 'string');
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

  describe('效能優化 - 同檔案多呼叫點快取', () => {
    it('應該正確處理同一檔案中的多個呼叫點（檔案只讀取一次）', async () => {
      const testFile = 'test-same-file-calls.ts';
      // 20 個呼叫點都在同一檔案
      const calls = Array.from({ length: 20 }, (_, i) => `const r${i} = calculate(${i * 10}, ${i * 5});`).join('\n');

      await fixture.writeFile(testFile, `
function calculate(a: number, b: number): number {
  return a - b;
}

${calls}
`.trim());

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath(testFile), 'calculate', '-p', fixture.rootPath, '--reorder', 'b,a', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式
        // 20 個呼叫點（函式定義不算）
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(19);
        // 所有更新都在同一檔案
        expect(output.summary.totalFiles).toBe(1);
      }
    });

    it('應該正確處理混合場景（同檔案多呼叫 + 跨檔案）', async () => {
      // 主檔案：定義 + 5 個呼叫
      await fixture.writeFile('src/main.ts', `
export function sharedCalc(x: number, y: string): string {
  return y + x;
}

const a1 = sharedCalc(1, 'a');
const a2 = sharedCalc(2, 'b');
const a3 = sharedCalc(3, 'c');
const a4 = sharedCalc(4, 'd');
const a5 = sharedCalc(5, 'e');
`);

      // 5 個跨檔案引用，每個檔案 3 個呼叫
      for (let i = 0; i < 5; i++) {
        await fixture.writeFile(`src/caller${i}.ts`, `
import { sharedCalc } from './main';

const b${i}_1 = sharedCalc(${i * 10 + 1}, 'x');
const b${i}_2 = sharedCalc(${i * 10 + 2}, 'y');
const b${i}_3 = sharedCalc(${i * 10 + 3}, 'z');
`);
      }

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/main.ts'), 'sharedCalc', '--reorder', 'y,x', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式
        // 5 呼叫在 main.ts + 15 呼叫在 5 個 caller 檔案
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(20);
        // 1 個 main.ts + 5 個 caller 檔案
        expect(output.summary.totalFiles).toBe(6);
      }
    });

    it('應該正確處理超多呼叫在少量檔案的場景', async () => {
      // 3 個檔案，每個檔案 30 個呼叫（共 90 個呼叫）
      await fixture.writeFile('src/target.ts', `
export function targetFn(a: number, b: number): number {
  return a * b;
}
`);

      for (let f = 0; f < 3; f++) {
        const calls = Array.from({ length: 30 }, (_, i) => `const v${f}_${i} = targetFn(${i}, ${i + 1});`).join('\n');
        await fixture.writeFile(`src/consumer${f}.ts`, `
import { targetFn } from './target';

${calls}
`);
      }

      const result = await executeCLI(
        ['change-signature', fixture.getFilePath('src/target.ts'), 'targetFn', '--reorder', 'b,a', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新的 PreviewResult 格式
        // 應有 90 個呼叫點
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(90);
        // 只有 4 個檔案（1 個 target + 3 個 consumer）
        expect(output.summary.totalFiles).toBe(4);
      }
    });
  });

  describe('缺少參數處理', () => {
    it('應該處理缺少檔案參數', async () => {
      const result = await executeCLI(
        ['change-signature'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('請指定檔案與函式名稱');
    });

    it('應該處理缺少函式名稱參數', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'const x = 1;');

      const result = await executeCLI(
        ['change-signature', testFile],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('請指定檔案與函式名稱');
    });

    it('應該處理缺少操作參數', async () => {
      const testFile = `${fixture.rootPath}/test.ts`;
      await fixture.memfs.writeFile(testFile, 'function test(a: number) { return a; }');

      const result = await executeCLI(
        ['change-signature', testFile, 'test', '-p', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('請指定至少一個變更操作');
    });
  });
});
