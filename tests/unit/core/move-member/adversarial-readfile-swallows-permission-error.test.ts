/**
 * P3: FileChangePreparer 私有的 readFile()（file-change-preparer.ts）過去把任何讀取
 * 失敗（含權限不足等真正的 I/O 錯誤）一律 catch 後轉成 null，呼叫端據此判斷「檔案
 * 不存在，視為新檔案」。若實際是權限錯誤而非真的不存在，move-member 會誤判為新
 * 檔案並可能覆蓋寫入，而非中止並回報錯誤——與 move/path-calculator.ts、
 * move/file-scanner.ts 同型缺陷（見 adversarial-scan-io-error-silent-empty.test.ts）。
 *
 * 對照組：目標檔案真的不存在（FileNotFoundError／ENOENT）時，維持「視為新檔案」
 * 的既有合理行為，不應被本次修復破壞。
 */
import { describe, expect, it } from 'vitest';
import { FileChangePreparer } from '@core/move-member/file-change-preparer.js';
import { MemberType, MoveTargetType, type MemberDefinition, type MoveMemberOptions } from '@core/move-member/types.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

function createReadFailureFileSystem(inner: MemFileSystem, blockedFile: string): IFileSystem {
  const wrapped = Object.create(inner) as MemFileSystem;
  wrapped.readFile = async (filePath: string, encoding?: BufferEncoding) => {
    if (filePath === blockedFile) {
      throw new Error(`EACCES: permission denied, open '${filePath}'`);
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
    preview: true
  };
}

describe('FileChangePreparer.readFile 不應把權限錯誤誤判為「檔案不存在」（adversarial）', () => {
  it('目標檔案讀取遇到權限錯誤時，應該讓錯誤往外拋，而不是當成新檔案處理', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': 'export const existing = true;\n'
    });
    const fileSystem = createReadFailureFileSystem(memfs, '/src/target.ts');
    const preparer = new FileChangePreparer(fileSystem);

    await expect(
      preparer.prepareTargetFileChange(createOptions(), createMember())
    ).rejects.toThrow(/EACCES|permission/i);
  });

  it('對照組：目標檔案真的不存在時，仍視為新檔案並正常產生內容', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n'
    });
    const preparer = new FileChangePreparer(memfs);

    const result = await preparer.prepareTargetFileChange(createOptions(), createMember());

    expect(result.isNewFile).toBe(true);
    expect(result.newCode).toContain('export function helper()');
  });
});
