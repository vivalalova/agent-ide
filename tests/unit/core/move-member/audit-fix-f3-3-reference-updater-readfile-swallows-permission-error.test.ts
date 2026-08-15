/**
 * [audit-fix] F3-3 先紅回歸
 *
 * src/core/move-member/reference-updater.ts:787-795 的私有 readFile()（供
 * prepareReferenceUpdates 主掃描迴圈逐一讀取專案內每個檔案以尋找需要更新的
 * import）一律把讀取失敗（含 EACCES 等真正的 I/O 錯誤）catch 後 warn + 回傳
 * null，呼叫端據此當成「這個檔案沒有內容可掃、跳過」。若實際是權限錯誤而非
 * 檔案已不存在，該檔案對來源符號的 import 引用就完全不會被掃描、更新，
 * move-member 卻仍回報成功，造成靜默漏改（與 move/file-scanner.ts、
 * move/path-calculator.ts 同型缺陷，該處已改用 isFileNotFoundError 分流）。
 *
 * 對照組：讀取失敗是檔案已不存在（ENOENT／FileNotFoundError）時，維持既有
 * 「視為沒有引用、繼續掃描其他檔案」的合理行為，不應被本次修復破壞。
 */
import { describe, expect, it } from 'vitest';
import { ReferenceUpdater } from '@core/move-member/reference-updater.js';
import { MemberType, MoveTargetType, type MemberDefinition, type MoveMemberOptions, type FileChange } from '@core/move-member/types.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

function createReadFailureFileSystem(
  inner: MemFileSystem,
  blockedFile: string,
  error: Error
): IFileSystem {
  const wrapped = Object.create(inner) as MemFileSystem;
  wrapped.readFile = async (filePath: string, encoding?: BufferEncoding) => {
    if (filePath === blockedFile) {
      throw error;
    }
    return inner.readFile(filePath, encoding);
  };
  return wrapped as unknown as IFileSystem;
}

function createMember(): MemberDefinition {
  return {
    name: 'helper',
    type: MemberType.Function,
    location: {
      filePath: '/src/source.ts',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 2 }
      }
    },
    sourceCode: 'export function helper() {\n  return 1;\n}',
    modifiers: ['export'],
    dependencies: []
  };
}

function createOptions(): MoveMemberOptions {
  return {
    sourceFile: '/src/source.ts',
    memberName: 'helper',
    target: {
      type: MoveTargetType.ExistingFile,
      filePath: '/src/target.ts'
    },
    projectRoot: '/src',
    preview: true,
    updateReferences: true
  };
}

function createSourceFileChange(): FileChange {
  return {
    filePath: '/src/source.ts',
    originalCode: 'export function helper() {\n  return 1;\n}\n',
    newCode: '\n'
  };
}

describe('ReferenceUpdater.readFile 不應把權限錯誤誤判為「檔案不存在」（audit-fix F3-3）', () => {
  it('引用檔讀取遇到權限錯誤時，prepareReferenceUpdates 應讓錯誤往外拋，而非靜默跳過該檔', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': 'export const existing = true;\n',
      '/src/consumer.ts': 'import { helper } from \'./source\';\nhelper();\n'
    });
    const fileSystem = createReadFailureFileSystem(
      memfs,
      '/src/consumer.ts',
      new Error('EACCES: permission denied, open \'/src/consumer.ts\'')
    );
    const updater = new ReferenceUpdater(fileSystem);

    await expect(
      updater.prepareReferenceUpdates(createOptions(), createMember(), createSourceFileChange())
    ).rejects.toThrow(/EACCES|permission/i);
  });

  it('對照組：引用檔已不存在（ENOENT）時，仍視為沒有引用、繼續掃描其他檔案', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': 'export const existing = true;\n',
      '/src/consumer.ts': 'import { helper } from \'./source\';\nhelper();\n'
    });
    const fileSystem = createReadFailureFileSystem(
      memfs,
      '/src/consumer.ts',
      Object.assign(new Error('ENOENT: no such file or directory, open \'/src/consumer.ts\''), { code: 'ENOENT' })
    );
    const updater = new ReferenceUpdater(fileSystem);

    await expect(
      updater.prepareReferenceUpdates(createOptions(), createMember(), createSourceFileChange())
    ).resolves.not.toThrow();
  });
});
