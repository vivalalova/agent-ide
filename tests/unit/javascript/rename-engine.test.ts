/**
 * JavaScript RenameEngine 單元測試
 * 測試重命名引擎的驗證功能，特別是 Unicode 識別符支援和保留字檢查
 *
 * 注意：實際的跨檔案重命名和引用更新測試位於 E2E 測試中
 * 這裡專注於單元級別的驗證邏輯測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RenameEngine } from '@core/rename/rename-engine.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createSymbol, createScope, SymbolType, createRange, createPosition } from '@shared/types/index.js';

describe('JavaScript RenameEngine', () => {
  let renameEngine: RenameEngine;
  let parserRegistry: ParserRegistry;
  let memfs: MemFileSystem;

  beforeEach(() => {
    memfs = new MemFileSystem();
    parserRegistry = new ParserRegistry();
    parserRegistry.register(new JavaScriptParser());
    renameEngine = new RenameEngine(parserRegistry, memfs);
  });

  afterEach(() => {
    memfs.reset();
  });

  // MARK: - Test Fixtures

  const createTestSymbol = (
    name: string,
    filePath = '/test/file.js',
    type = SymbolType.Variable
  ) => createSymbol(
    name,
    type,
    {
      filePath,
      range: createRange(createPosition(1, 7), createPosition(1, 7 + name.length))
    },
    createScope('module', filePath)
  );

  // MARK: - Unicode 識別符驗證

  describe('validateRename - Unicode 識別符驗證', () => {
    describe('有效的 Unicode 識別符', () => {
      const validIdentifiers = [
        // 基本 ASCII
        { name: 'user_data', description: '標準 snake_case' },
        { name: 'UserData', description: '標準 PascalCase' },
        { name: 'userData', description: '標準 camelCase' },
        { name: '_private', description: '底線開頭（私有）' },
        { name: '__dunder__', description: '雙底線（dunder）' },
        { name: 'x', description: '單字母' },
        { name: 'x1', description: '字母加數字' },
        { name: '_', description: '單底線' },
        { name: '$var', description: 'JavaScript $ 前綴' },
        { name: '$$', description: 'jQuery 風格' },

        // 中文
        { name: '用戶資料', description: '繁體中文' },
        { name: '用户数据', description: '簡體中文' },
        { name: '用戶_資料', description: '中文加底線' },
        { name: '用戶Data', description: '中文加英文' },
        { name: '_用戶', description: '底線加中文' },

        // 日文
        { name: '会社名', description: '日文漢字' },
        { name: 'ユーザー', description: '日文片假名' },
        { name: 'ひらがな', description: '日文平假名' },

        // 韓文
        { name: '테마', description: '韓文' },
        { name: '사용자', description: '韓文' },

        // 其他語言
        { name: 'données', description: '法文（含重音符號）' },
        { name: 'größe', description: '德文（含變音符號）' },
        { name: 'переменная', description: '俄文（西里爾字母）' },
        { name: 'μεταβλητή', description: '希臘文' },
        { name: 'משתנה', description: '希伯來文' },
        { name: 'متغير', description: '阿拉伯文' },

        // 混合語言
        { name: '工廠name', description: '中文加英文' },
        { name: 'user用戶', description: '英文加中文' },
        { name: '用戶_データ', description: '中文加日文' },
        { name: 'Test測試テスト', description: '英文加中文加日文' },

        // RTL 語言混合（希伯來文、阿拉伯文與 LTR 混合）
        { name: 'data_משתנה', description: '英文加希伯來文' },
        { name: 'משתנה_data', description: '希伯來文加英文' },
        { name: 'بيانات_user', description: '阿拉伯文加英文' },
        { name: 'config_متغير', description: '英文加阿拉伯文' },

        // 數字（非開頭）
        { name: 'user1', description: '英文加數字' },
        { name: '用戶1', description: '中文加數字' },
        { name: 'a123', description: '多數字' },
        { name: '_1', description: '底線加數字' }
      ];

      it.each(validIdentifiers)('應該接受有效識別符: $name ($description)', async ({ name }) => {
        await memfs.fromJSON({ '/test/file.js': 'const original = \'value\';' });

        const symbol = createTestSymbol('original');
        const result = await renameEngine.validateRename({
          symbol,
          newName: name,
          filePaths: ['/test/file.js']
        });

        const invalidIdentifierConflicts = result.conflicts.filter(
          c => c.type === 'invalid_identifier'
        );
        expect(invalidIdentifierConflicts).toEqual([]);
      });
    });

    describe('無效的識別符', () => {
      const invalidIdentifiers = [
        { name: '123', description: '純數字' },
        { name: '1user', description: '數字開頭' },
        { name: '123資料', description: '數字開頭（混合語言）' },
        { name: 'user name', description: '包含空格' },
        { name: 'user-name', description: '包含連字號' },
        { name: 'user.name', description: '包含句點' },
        { name: 'user@name', description: '包含 @ 符號' },
        { name: 'user#name', description: '包含 # 符號' },
        { name: 'user!', description: '包含驚嘆號' },
        { name: '(user)', description: '包含括號' },
        { name: '[user]', description: '包含方括號' },
        { name: 'user+name', description: '包含加號' },
        { name: 'user=name', description: '包含等號' }
      ];

      it.each(invalidIdentifiers)('應該拒絕無效識別符: "$name" ($description)', async ({ name }) => {
        await memfs.fromJSON({ '/test/file.js': 'const original = \'value\';' });

        const symbol = createTestSymbol('original');
        const result = await renameEngine.validateRename({
          symbol,
          newName: name,
          filePaths: ['/test/file.js']
        });

        const invalidIdentifierConflicts = result.conflicts.filter(
          c => c.type === 'invalid_identifier'
        );
        expect(invalidIdentifierConflicts.length).toBeGreaterThan(0);
      });

      it('空字串應該拋出錯誤', async () => {
        await memfs.fromJSON({ '/test/file.js': 'const original = \'value\';' });

        const symbol = createTestSymbol('original');
        await expect(renameEngine.validateRename({
          symbol,
          newName: '',
          filePaths: ['/test/file.js']
        })).rejects.toThrow('新名稱不能為空');
      });

      it('空白應該拋出錯誤', async () => {
        await memfs.fromJSON({ '/test/file.js': 'const original = \'value\';' });

        const symbol = createTestSymbol('original');
        await expect(renameEngine.validateRename({
          symbol,
          newName: '   ',
          filePaths: ['/test/file.js']
        })).rejects.toThrow('新名稱不能為空');
      });
    });
  });

  // MARK: - 保留字檢查

  describe('validateRename - 保留字檢查', () => {
    const jsReservedKeywords = [
      'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while',
      'do', 'switch', 'case', 'break', 'continue', 'return', 'try',
      'catch', 'finally', 'throw', 'class', 'interface', 'enum',
      'import', 'export', 'default', 'from', 'as', 'type'
    ];

    it.each(jsReservedKeywords)('應該標記保留字 "%s" 為衝突', async (keyword) => {
      await memfs.fromJSON({ '/test/file.js': 'const original = \'value\';' });

      const symbol = createTestSymbol('original');
      const result = await renameEngine.validateRename({
        symbol,
        newName: keyword,
        filePaths: ['/test/file.js']
      });

      const reservedKeywordConflicts = result.conflicts.filter(
        c => c.type === 'reserved_keyword'
      );
      expect(reservedKeywordConflicts.length).toBeGreaterThan(0);
    });
  });

  // MARK: - 相同名稱重命名

  describe('validateRename - 相同名稱重命名', () => {
    it('應該允許相同名稱的重命名（no-op）', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const userData = \'test\';' });

      const symbol = createTestSymbol('userData');
      const result = await renameEngine.validateRename({
        symbol,
        newName: 'userData',
        filePaths: ['/test/file.js']
      });

      expect(result.isValid).toBe(true);
    });
  });

  // MARK: - 錯誤處理

  describe('錯誤處理', () => {
    it('validateRename: 空名稱應該拋出錯誤', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const test = 1;' });

      const symbol = createTestSymbol('test');
      await expect(renameEngine.validateRename({
        symbol,
        newName: '',
        filePaths: ['/test/file.js']
      })).rejects.toThrow('新名稱不能為空');
    });

    it('validateRename: 空白名稱應該拋出錯誤', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const test = 1;' });

      const symbol = createTestSymbol('test');
      await expect(renameEngine.validateRename({
        symbol,
        newName: '   ',
        filePaths: ['/test/file.js']
      })).rejects.toThrow('新名稱不能為空');
    });

    it('validateRename: 空檔案路徑應該拋出錯誤', async () => {
      const symbol = createTestSymbol('test');

      await expect(renameEngine.validateRename({
        symbol,
        newName: 'newName',
        filePaths: []
      })).rejects.toThrow('必須指定至少一個檔案路徑');
    });
  });

  // MARK: - 預覽功能

  describe('previewRename', () => {
    it('應該回傳預覽資訊', async () => {
      const code = `
const counter = 0;
console.log(counter);
`;
      await memfs.fromJSON({ '/test/file.js': code });

      const symbol = createSymbol(
        'counter',
        SymbolType.Variable,
        {
          filePath: '/test/file.js',
          range: createRange(createPosition(2, 7), createPosition(2, 14))
        },
        createScope('module', '/test/file.js')
      );

      const preview = await renameEngine.previewRename({
        symbol,
        newName: 'count',
        filePaths: ['/test/file.js']
      });

      // 驗證預覽結構
      expect(preview.operations).toBeDefined();
      expect(preview.affectedFiles).toBeDefined();
      expect(preview.summary).toBeDefined();
      expect(preview.summary.totalReferences).toBeGreaterThanOrEqual(0);
      expect(preview.summary.totalFiles).toBeGreaterThanOrEqual(0);
    });

    it('無效的新名稱應該回傳衝突', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const test = 1;' });

      const symbol = createTestSymbol('test');
      const preview = await renameEngine.previewRename({
        symbol,
        newName: 'function', // 保留字
        filePaths: ['/test/file.js']
      });

      expect(preview.conflicts.length).toBeGreaterThan(0);
      expect(preview.conflicts[0].type).toBe('reserved_keyword');
    });
  });

  // MARK: - 衝突檢測

  describe('detectConflicts', () => {
    it('應該檢測保留字衝突', () => {
      const conflicts = renameEngine.detectConflicts('const', undefined);

      expect(conflicts.some(c => c.type === 'reserved_keyword')).toBe(true);
    });

    it('應該檢測無效識別符', () => {
      const conflicts = renameEngine.detectConflicts('123invalid', undefined);

      expect(conflicts.some(c => c.type === 'invalid_identifier')).toBe(true);
    });

    it('有效名稱不應該有衝突', () => {
      const conflicts = renameEngine.detectConflicts('validName', undefined);

      expect(conflicts).toEqual([]);
    });
  });

  // MARK: - JavaScript 特定語法支援

  describe('JavaScript 特定語法支援', () => {
    it('應該接受 $ 開頭的識別符', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const $element = \'test\';' });

      const symbol = createTestSymbol('original');
      const result = await renameEngine.validateRename({
        symbol,
        newName: '$newElement',
        filePaths: ['/test/file.js']
      });

      expect(result.isValid).toBe(true);
    });

    it('應該接受 _ 開頭的識別符', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const _private = \'test\';' });

      const symbol = createTestSymbol('original');
      const result = await renameEngine.validateRename({
        symbol,
        newName: '_newPrivate',
        filePaths: ['/test/file.js']
      });

      expect(result.isValid).toBe(true);
    });

    it('應該拒絕包含連字號的識別符', async () => {
      await memfs.fromJSON({ '/test/file.js': 'const test = \'value\';' });

      const symbol = createTestSymbol('original');
      const result = await renameEngine.validateRename({
        symbol,
        newName: 'kebab-case',
        filePaths: ['/test/file.js']
      });

      const invalidIdentifierConflicts = result.conflicts.filter(
        c => c.type === 'invalid_identifier'
      );
      expect(invalidIdentifierConflicts.length).toBeGreaterThan(0);
    });
  });

  // MARK: - 符號類型支援

  describe('不同符號類型的驗證', () => {
    const symbolTypes = [
      { type: SymbolType.Variable, description: '變數' },
      { type: SymbolType.Function, description: '函式' },
      { type: SymbolType.Class, description: '類別' },
      { type: SymbolType.Constant, description: '常數' }
    ];

    it.each(symbolTypes)('應該驗證 $description 類型的重命名', async ({ type }) => {
      await memfs.fromJSON({ '/test/file.js': 'const test = 1;' });

      const symbol = createTestSymbol('original', '/test/file.js', type);
      const result = await renameEngine.validateRename({
        symbol,
        newName: 'newValidName',
        filePaths: ['/test/file.js']
      });

      expect(result.isValid).toBe(true);
    });

    it.each(symbolTypes)('$description 類型應該拒絕保留字', async ({ type }) => {
      await memfs.fromJSON({ '/test/file.js': 'const test = 1;' });

      const symbol = createTestSymbol('original', '/test/file.js', type);
      const result = await renameEngine.validateRename({
        symbol,
        newName: 'class',
        filePaths: ['/test/file.js']
      });

      expect(result.isValid).toBe(false);
      expect(result.conflicts.some(c => c.type === 'reserved_keyword')).toBe(true);
    });
  });
});
