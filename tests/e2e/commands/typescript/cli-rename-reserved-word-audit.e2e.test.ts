/**
 * CLI rename 命令 E2E 測試 - [audit-fix] F2-1
 *
 * 缺陷：src/core/rename/rename-engine.ts:109-113,276-280 用廣義
 * isTypeScriptReservedWord 擋掉 get/set/string/namespace/type/constructor
 * 等合法值空間識別符名，導致 rename --to 這些名稱時被誤擋。
 * TypeScript 的這些字只在特定語境（contextual keyword）才有特殊意義，
 * 在一般變數/函式名位置合法使用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename - 保留字檢查誤擋合法識別符 [audit-fix] F2-1', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[audit-fix] F2-1：rename --to get 應成功（get 是合法值空間識別符）', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-1-get.ts`;
    await fixture.memfs.writeFile(testFile, `
function computeCandidateF21Get(): number {
  return 1;
}

const resultF21Get = computeCandidateF21Get();
`.trim());

    const result = await executeCLI(
      ['rename', '--path', fixture.rootPath, '--from', 'computeCandidateF21Get', '--to', 'get', '--no-cache', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function get(): number');
    expect(updated).toContain('const resultF21Get = get();');
  });

  it('[audit-fix] F2-1：rename --to string 應成功（string 是合法值空間識別符）', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-1-string.ts`;
    await fixture.memfs.writeFile(testFile, `
function computeCandidateF21String(): number {
  return 2;
}

const resultF21String = computeCandidateF21String();
`.trim());

    const result = await executeCLI(
      ['rename', '--path', fixture.rootPath, '--from', 'computeCandidateF21String', '--to', 'string', '--no-cache', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function string(): number');
    expect(updated).toContain('const resultF21String = string();');
  });

  it('[audit-fix] F2-1：rename --to namespace 應成功（namespace 是合法值空間識別符）', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-1-namespace.ts`;
    await fixture.memfs.writeFile(testFile, `
function computeCandidateF21Namespace(): number {
  return 3;
}

const resultF21Namespace = computeCandidateF21Namespace();
`.trim());

    const result = await executeCLI(
      ['rename', '--path', fixture.rootPath, '--from', 'computeCandidateF21Namespace', '--to', 'namespace', '--no-cache', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function namespace(): number');
    expect(updated).toContain('const resultF21Namespace = namespace();');
  });

  describe('對照（保護性，現行應維持被擋）', () => {
    it('[audit-fix] F2-1：rename --to class 仍應被擋（class 是真正保留字）', async () => {
      const testFile = `${fixture.rootPath}/regression-f2-1-guard-class.ts`;
      await fixture.memfs.writeFile(testFile, `
function computeCandidateF21GuardClass(): number {
  return 4;
}

const resultF21GuardClass = computeCandidateF21GuardClass();
`.trim());

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'computeCandidateF21GuardClass', '--to', 'class', '--no-cache', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
    });

    it('[audit-fix] F2-1：rename --to await 仍應被擋（await 是真正保留字）', async () => {
      const testFile = `${fixture.rootPath}/regression-f2-1-guard-await.ts`;
      await fixture.memfs.writeFile(testFile, `
function computeCandidateF21GuardAwait(): number {
  return 5;
}

const resultF21GuardAwait = computeCandidateF21GuardAwait();
`.trim());

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'computeCandidateF21GuardAwait', '--to', 'await', '--no-cache', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
    });
  });
});
