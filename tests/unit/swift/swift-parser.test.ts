/**
 * SwiftParser 單元測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SwiftParser } from '@plugins/swift/parser.js';

describe('SwiftParser', () => {
  let parser: SwiftParser;

  beforeEach(() => {
    parser = new SwiftParser();
  });

  afterEach(async () => {
    await parser.dispose();
  });

  describe('基本屬性', () => {
    it('應該有正確的名稱', () => {
      expect(parser.name).toBe('swift');
    });

    it('應該有正確的版本', () => {
      expect(parser.version).toBe('1.0.0');
    });

    it('應該支援 .swift 副檔名', () => {
      expect(parser.supportedExtensions).toContain('.swift');
    });

    it('應該支援 swift 語言', () => {
      expect(parser.supportedLanguages).toContain('swift');
    });
  });

  describe('getDefaultExcludePatterns', () => {
    it('應該排除 .build 目錄', () => {
      const patterns = parser.getDefaultExcludePatterns?.() ?? [];
      expect(patterns.some(p => p.includes('.build'))).toBe(true);
    });

    it('應該排除 DerivedData 目錄', () => {
      const patterns = parser.getDefaultExcludePatterns?.() ?? [];
      expect(patterns.some(p => p.includes('DerivedData'))).toBe(true);
    });

    it('應該排除 Pods 目錄', () => {
      const patterns = parser.getDefaultExcludePatterns?.() ?? [];
      expect(patterns.some(p => p.includes('Pods'))).toBe(true);
    });
  });

  describe('isTestFile', () => {
    it('應該識別 Tests.swift 為測試檔案', () => {
      expect(parser.isTestFile?.('UserTests.swift')).toBe(true);
    });

    it('應該識別 Test.swift 為測試檔案', () => {
      expect(parser.isTestFile?.('UserTest.swift')).toBe(true);
    });

    it('應該識別 /Tests/ 路徑下的檔案為測試檔案', () => {
      expect(parser.isTestFile?.('/path/Tests/User.swift')).toBe(true);
    });

    it('應該識別 /XCTest/ 路徑下的檔案為測試檔案', () => {
      expect(parser.isTestFile?.('/path/XCTest/User.swift')).toBe(true);
    });

    it('不應該將一般檔案識別為測試檔案', () => {
      expect(parser.isTestFile?.('User.swift')).toBe(false);
    });
  });

  describe('validate', () => {
    it('應該返回 ValidationResult 結構', async () => {
      const result = await parser.validate();
      // 在 unit test 環境中 WASM 可能無法載入，所以只驗證返回結構
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });
  });
});
