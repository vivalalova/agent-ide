/**
 * MoveMemberEngine Unit 測試（回歸缺陷 #6）
 *
 * `collectImportExportStatement` 原本以「整行」為單位收集 import/export 語句：
 * 一行內若有兩條獨立的 import 語句（如
 * `import { moved, kept } from './source'; import { unrelated } from './other';`），
 * 第一次呼叫會把整行（含第二條語句）都當成第一條語句的文字，導致改寫第一條
 * 語句時把第二條語句的原文一併吞掉、覆蓋消失。
 */
import { describe, expect, it, vi } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockParserRegistry } from '../_helpers/mock-factories.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry, FileStats } from '@infrastructure/storage/types.js';
import * as path from 'path';

/**
 * 依一份「路徑 -> 內容」的扁平檔案表推算目錄結構，供 ReferenceUpdater 的
 * `getProjectFiles`（遞迴 readDirectory）掃描整個專案樹；固定回傳空陣列的
 * createMockFileSystem 無法測到需要實際掃描專案檔案的 updateReferences 情境。
 */
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

describe('MoveMemberEngine - 同一行兩筆 import 語句都應被正確辨識與保留', () => {
  it('搬移成員後，同行第二筆與搬移無關的 import 不應消失', async () => {
    const consumerContent =
      'import { moved, kept } from \'./source\';' +
      ' import { unrelated } from \'./other\';\n' +
      'kept(); unrelated(); moved();\n';

    const mockFs = createProjectFileSystem({
      '/src/source.ts': [
        'export function moved(): number { return 1; }',
        'export function kept(): number { return 2; }',
        ''
      ].join('\n'),
      '/src/target.ts': '',
      '/src/consumer.ts': consumerContent,
      '/src/other.ts': 'export function unrelated(): number { return 3; }\n'
    });
    const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

    const options: MoveMemberOptions = {
      sourceFile: '/src/source.ts',
      memberName: 'moved',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/target.ts'
      },
      projectRoot: '/src',
      preview: true,
      updateReferences: true
    };

    const result = await engine.moveMember(options);

    expect(result.success).toBe(true);
    if (!result.success) { return; }

    const consumerUpdates = result.referenceUpdates.filter(update => update.filePath === '/src/consumer.ts');
    expect(consumerUpdates).toHaveLength(1);
    const [update] = consumerUpdates;

    // 正確行為：originalImport 只精確涵蓋第一條語句本身，不含同行第二條
    // 「與搬移無關」的 import——若整行被當成一筆語句吞下，這裡會連
    // ` import { unrelated } from './other';` 一起出現，第一筆的改寫
    // 便會把第二筆的原文一併覆蓋消失。
    expect(update.originalImport).toBe('import { moved, kept } from \'./source\';');
    expect(update.originalImport).not.toContain('unrelated');
    // location 範圍的結尾欄位須精確停在第一條語句自己的分號之後，
    // 不可延伸到整行結尾（那會涵蓋並吃掉第二條語句的原文）
    expect(update.location.range.end.line).toBe(1);
    expect(update.location.range.end.column).toBe('import { moved, kept } from \'./source\';'.length + 1);

    // 第一筆語句應正確改寫為指向新目標檔（moved 已搬走），kept 仍留在來源檔
    expect(update.newImport).toContain('./target');
    expect(update.newImport).toContain('./source');

    // 套用這筆 location range 到原始那一行後，同行第二條 import 的原文
    // 應完整保留在該行未被取代的部分（模擬 ChangeApplicator 依 column 套用編輯）
    const originalLine = consumerContent.split('\n')[0];
    const untouchedTail = originalLine.slice(update.location.range.end.column - 1);
    expect(untouchedTail).toContain('import { unrelated } from \'./other\';');
  });

  it('preview: false 實際套用寫入後，同行第二筆 import 應完整保留在寫入檔案內容中', async () => {
    // 上一個測試只驗證 ReferenceUpdate 這筆「中繼資料」的欄位範圍是否精確；
    // 本測試改走 preview: false，透過 ChangeApplicator 實際套用 textChange 到
    // 檔案內容並呼叫 writeFile，直接斷言「寫入的檔案內容」本身，排除
    // calculateOffset 對 column 的處理在套用階段出現 off-by-one 等落實面問題。
    const consumerContent =
      'import { moved, kept } from \'./source\';' +
      ' import { unrelated } from \'./other\';\n' +
      'kept(); unrelated(); moved();\n';

    const mockFs = createProjectFileSystem({
      '/src/source.ts': [
        'export function moved(): number { return 1; }',
        'export function kept(): number { return 2; }',
        ''
      ].join('\n'),
      '/src/target.ts': '',
      '/src/consumer.ts': consumerContent,
      '/src/other.ts': 'export function unrelated(): number { return 3; }\n'
    });
    const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

    const options: MoveMemberOptions = {
      sourceFile: '/src/source.ts',
      memberName: 'moved',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/target.ts'
      },
      projectRoot: '/src',
      preview: false,
      updateReferences: true
    };

    const result = await engine.moveMember(options);

    expect(result.success).toBe(true);
    if (!result.success) { return; }
    expect(result.executed).toBe(true);

    const writeFileMock = mockFs.writeFile as unknown as {
      mock: { calls: unknown[][] };
    };
    const consumerWriteCall = writeFileMock.mock.calls.find(
      call => call[0] === '/src/consumer.ts'
    );
    expect(consumerWriteCall).toBeDefined();

    const writtenContent = consumerWriteCall![1] as string;
    // 第一筆 import 應已改寫為指向新目標檔（moved 搬走），kept 仍留在來源檔
    expect(writtenContent).toContain('./target');
    expect(writtenContent).toContain('./source');
    // 同行第二筆與搬移無關的 import 必須在實際寫入的檔案內容中完整存在，
    // 不能被第一筆語句的改寫覆蓋掉（這正是缺陷 #6 的落地驗證）
    expect(writtenContent).toContain('import { unrelated } from \'./other\';');
  });
});
