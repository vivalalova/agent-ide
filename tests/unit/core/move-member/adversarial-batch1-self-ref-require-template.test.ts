/**
 * move-member Batch1 缺陷 reproduction（先紅後綠）
 *
 * F8：buildSourceSelfReferenceImport 用 calculateNewImportPath 不補 .js，
 *     與 file-change-preparer C10 的 ESM 副檔名慣例不一致。
 * F10：stripStringsAndComments 把 template 整段（含 ${member}）吃掉，
 *     來源只剩 template 內引用時漏插 self-import。
 * F11：isInsideStringOrComment 不辨 regex，`/'/` 後的真 import 被當字串內略過。
 * F30：consumer 的 require('./source') 不更新 path（只掃 import/export）。
 */

import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { isInsideStringOrComment } from '@core/move-member/utils/source-text.js';
import { createMockParserRegistry } from '../_helpers/mock-factories.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry, FileStats } from '@infrastructure/storage/types.js';

function createProjectFileSystem(files: Record<string, string>): IFileSystem {
  const stats = (): FileStats => ({
    isFile: true,
    isDirectory: false,
    size: 0,
    createdTime: new Date(),
    modifiedTime: new Date(),
    accessedTime: new Date(),
    mode: 0o644
  });
  const allPaths = Object.keys(files);

  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (!(filePath in files)) {
        throw new Error(`File not found: ${filePath}`);
      }
      return files[filePath];
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockImplementation(async (dirPath: string): Promise<DirectoryEntry[]> => {
      const normalizedDir = path.normalize(dirPath);
      const childNames = new Map<string, boolean>();

      for (const filePath of allPaths) {
        const relative = path.relative(normalizedDir, filePath);
        if (relative.startsWith('..') || relative === '') {continue;}
        const segments = relative.split(path.sep);
        const isDirectChild = segments.length === 1;
        childNames.set(segments[0], !isDirectChild || childNames.get(segments[0]) === true);
      }

      return [...childNames.entries()].map(([name, isDirectory]) => ({
        name,
        path: path.join(normalizedDir, name),
        isFile: !isDirectory,
        isDirectory
      }));
    }),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in files),
    getStats: vi.fn().mockImplementation(async () => stats()),
    isFile: vi.fn().mockImplementation(async (filePath: string) => filePath in files),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem;
}

function makeEngine(files: Record<string, string>): MoveMemberEngine {
  return new MoveMemberEngine(createMockParserRegistry(), createProjectFileSystem(files));
}

function baseOptions(overrides?: Partial<MoveMemberOptions>): MoveMemberOptions {
  return {
    sourceFile: '/src/source.ts',
    memberName: 'moved',
    target: {
      type: MoveTargetType.ExistingFile,
      filePath: '/src/target.ts'
    },
    projectRoot: '/src',
    preview: true,
    updateReferences: true,
    ...overrides
  };
}

describe('move-member Batch1 defects (F8/F10/F11/F30)', () => {
  it('F8：來源殘留引用時 self-import 路徑應帶 .js', async () => {
    const files = {
      '/src/source.ts': [
        'export function moved() {',
        '  return 1;',
        '}',
        '',
        'export function keep() {',
        '  return moved() + 1;',
        '}',
        ''
      ].join('\n'),
      '/src/target.ts': 'export const placeholder = true;\n'
    };
    const engine = makeEngine(files);

    const result = await engine.moveMember(baseOptions());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const selfImport = result.referenceUpdates.find(u => u.filePath === '/src/source.ts');
    expect(selfImport).toBeDefined();
    // 正確：與 C10 / NodeNext ESM 一致 → from './target.js'
    // 目前壞行為：from './target'（缺 .js）
    expect(selfImport!.newImport).toMatch(/from\s*['"]\.\/target\.js['"]/);
    expect(selfImport!.newImport).not.toMatch(/from\s*['"]\.\/target['"]/);
  });

  it('F10：來源只剩 template ${moved} 引用時仍應插入 self-import', async () => {
    const files = {
      '/src/source.ts': [
        'export function moved() {',
        '  return 1;',
        '}',
        '',
        'export function keep() {',
        '  return `value=${moved()}`;',
        '}',
        ''
      ].join('\n'),
      '/src/target.ts': 'export const placeholder = true;\n'
    };
    const engine = makeEngine(files);

    const result = await engine.moveMember(baseOptions());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const selfImport = result.referenceUpdates.find(u => u.filePath === '/src/source.ts');
    // 正確：template 內 moved() 是真實程式引用 → 必須 self-import
    // 目前壞行為：stripStringsAndComments 吃掉 `${moved()}`，誤判無殘留引用 → 無 update
    expect(selfImport).toBeDefined();
    expect(selfImport!.newImport).toMatch(/import\s*\{\s*moved\s*\}\s*from\s*['"]\.\/target(?:\.js)?['"]/);
  });

  it('F11：檔內有 /\'/ regex 後，真 import 仍應被更新', async () => {
    const files = {
      '/src/source.ts': [
        'export function moved() {',
        '  return 1;',
        '}',
        '',
        'export function kept() {',
        '  return 2;',
        '}',
        ''
      ].join('\n'),
      '/src/target.ts': 'export const placeholder = true;\n',
      '/src/consumer.ts': [
        'const quoteLike = /\'/;',
        'import { moved } from \'./source\';',
        'export const use = moved;',
        ''
      ].join('\n')
    };
    const engine = makeEngine(files);

    // 直接釘 predicate：import 關鍵字 offset 不應被判定為字串/註解內
    const consumer = files['/src/consumer.ts'];
    const importOffset = consumer.indexOf('import');
    expect(importOffset).toBeGreaterThan(0);
    expect(isInsideStringOrComment(consumer, importOffset)).toBe(false);

    const result = await engine.moveMember(baseOptions());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const consumerUpdate = result.referenceUpdates.find(u => u.filePath === '/src/consumer.ts');
    // 正確：真 import 必須改到 target
    // 目前壞行為：isInsideStringOrComment(offset of import) === true → 整筆略過
    expect(consumerUpdate).toBeDefined();
    expect(consumerUpdate!.newImport).toMatch(/from\s*['"]\.\/target(?:\.js)?['"]/);
  });

  it('F30：consumer require("./source") 路徑應隨成員搬走更新', async () => {
    const files = {
      '/src/source.ts': [
        'export function moved() {',
        '  return 1;',
        '}',
        ''
      ].join('\n'),
      '/src/target.ts': 'export const placeholder = true;\n',
      '/src/consumer.js': [
        'const { moved } = require(\'./source\');',
        'module.exports = { use: moved };',
        ''
      ].join('\n')
    };
    const engine = makeEngine(files);

    const result = await engine.moveMember(baseOptions());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const consumerUpdate = result.referenceUpdates.find(u => u.filePath === '/src/consumer.js');
    // 正確：require 路徑更新到 target
    // 目前壞行為：reference-updater 只掃 import/export，完全忽略 require
    expect(consumerUpdate).toBeDefined();
    expect(consumerUpdate!.newImport).toMatch(/require\s*\(\s*['"]\.\/target(?:\.js)?['"]\s*\)/);
  });
});
