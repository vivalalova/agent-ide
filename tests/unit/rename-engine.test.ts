/**
 * RenameEngine 單元測試
 * 測試重命名引擎的核心功能，特別是 Unicode 識別符支援
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RenameEngine } from '../../src/core/rename/rename-engine.js';
import { createSymbol, createScope, SymbolType } from '../../src/shared/types/index.js';

describe('RenameEngine', () => {
  let renameEngine: RenameEngine;

  beforeEach(() => {
    // RenameEngine 不需要 IndexEngine，只需要可選的 ParserRegistry 和 FileSystem
    renameEngine = new RenameEngine();
  });

  describe('validateRename - Unicode 識別符驗證', () => {
    const testFilePath = '/test/file.py';

    const createTestSymbol = (name: string) => createSymbol(
      name,
      SymbolType.Variable,
      { filePath: testFilePath, range: { start: { line: 1, column: 0 }, end: { line: 1, column: name.length } } },
      createScope('module', testFilePath)
    );

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
        { name: 'משתנה_متغير', description: '希伯來文加阿拉伯文' },
        { name: 'ערך_قيمة_value', description: '希伯來文加阿拉伯文加英文' },

        // 數字（非開頭）
        { name: 'user1', description: '英文加數字' },
        { name: '用戶1', description: '中文加數字' },
        { name: 'a123', description: '多數字' },
        { name: '_1', description: '底線加數字' },
      ];

      it.each(validIdentifiers)('應該接受有效識別符: $name ($description)', async ({ name }) => {
        const symbol = createTestSymbol('original');
        const result = await renameEngine.validateRename({
          symbol,
          newName: name,
          filePaths: [testFilePath]
        });

        // 檢查沒有 invalid_identifier 類型的衝突
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
        { name: '', description: '空字串' },
        { name: ' ', description: '空白' },
        { name: 'user name', description: '包含空格' },
        { name: 'user-name', description: '包含連字號' },
        { name: 'user.name', description: '包含句點' },
        { name: 'user@name', description: '包含 @ 符號' },
        { name: 'user#name', description: '包含 # 符號' },
        { name: 'user!', description: '包含驚嘆號' },
        { name: '(user)', description: '包含括號' },
        { name: '[user]', description: '包含方括號' },
        { name: 'user+name', description: '包含加號' },
        { name: 'user=name', description: '包含等號' },
      ];

      it.each(invalidIdentifiers)('應該拒絕無效識別符: "$name" ($description)', async ({ name }) => {
        const symbol = createTestSymbol('original');

        // 空字串和空白會在 validateOptions 階段拋出錯誤
        if (name === '' || name === ' ') {
          await expect(renameEngine.validateRename({
            symbol,
            newName: name,
            filePaths: [testFilePath]
          })).rejects.toThrow('新名稱不能為空');
          return;
        }

        const result = await renameEngine.validateRename({
          symbol,
          newName: name,
          filePaths: [testFilePath]
        });

        // 檢查有 invalid_identifier 類型的衝突
        const invalidIdentifierConflicts = result.conflicts.filter(
          c => c.type === 'invalid_identifier'
        );
        expect(invalidIdentifierConflicts.length).toBeGreaterThan(0);
      });
    });

    describe('保留字檢查', () => {
      // 這些是 RenameEngine 中實際定義的保留字
      const reservedKeywords = [
        'function', 'var', 'let', 'const', 'if', 'else', 'for', 'while',
        'do', 'switch', 'case', 'break', 'continue', 'return', 'try',
        'catch', 'finally', 'throw', 'class', 'interface', 'enum',
        'import', 'export', 'default', 'from', 'as', 'type'
      ];

      it.each(reservedKeywords)('應該標記保留字 "%s" 為衝突', async (keyword) => {
        const symbol = createTestSymbol('original');
        const result = await renameEngine.validateRename({
          symbol,
          newName: keyword,
          filePaths: [testFilePath]
        });

        const reservedKeywordConflicts = result.conflicts.filter(
          c => c.type === 'reserved_keyword'
        );
        expect(reservedKeywordConflicts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('相同名稱重命名', () => {
    it('應該允許相同名稱的重命名（no-op）', async () => {
      const testFilePath = '/test/file.py';
      const symbol = createSymbol(
        'user_data',
        SymbolType.Variable,
        { filePath: testFilePath, range: { start: { line: 1, column: 0 }, end: { line: 1, column: 9 } } },
        createScope('module', testFilePath)
      );

      const result = await renameEngine.validateRename({
        symbol,
        newName: 'user_data',
        filePaths: [testFilePath]
      });

      // 相同名稱應該是有效的（只是 no-op）
      expect(result.isValid).toBe(true);
    });
  });
});
