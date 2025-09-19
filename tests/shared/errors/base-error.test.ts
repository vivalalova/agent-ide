import { describe, it, expect } from 'vitest';
import { 
  BaseError,
  ParserError,
  FileError,
  ValidationError,
  ConfigError,
  isBaseError,
  isParserError,
  isFileError,
  isValidationError,
  isConfigError,
  createError,
  formatError
} from '../../../src/shared/errors';
import { createPosition, createRange, createLocation } from '../../../src/shared/types/core';

describe('錯誤處理系統', () => {
  describe('BaseError 類別', () => {
    it('應該能建立基本錯誤', () => {
      const error = new BaseError('GENERIC_ERROR', '測試錯誤訊息');
      
      expect(error.name).toBe('BaseError');
      expect(error.code).toBe('GENERIC_ERROR');
      expect(error.message).toBe('測試錯誤訊息');
      expect(error.details).toBeUndefined();
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('應該能建立包含詳細資料的錯誤', () => {
      const details = { file: 'test.ts', line: 10 };
      const error = new BaseError('GENERIC_ERROR', '測試錯誤', details);
      
      expect(error.details).toEqual(details);
    });

    it('應該能序列化為 JSON', () => {
      const details = { context: 'test' };
      const error = new BaseError('GENERIC_ERROR', '測試錯誤', details);
      const json = error.toJSON();
      
      expect(json).toEqual({
        name: 'BaseError',
        code: 'GENERIC_ERROR',
        message: '測試錯誤',
        details: details,
        timestamp: error.timestamp.toISOString()
      });
    });

    it('應該能轉換為字串', () => {
      const error = new BaseError('GENERIC_ERROR', '測試錯誤');
      const str = error.toString();
      
      expect(str).toContain('BaseError');
      expect(str).toContain('GENERIC_ERROR');
      expect(str).toContain('測試錯誤');
    });

    it('isBaseError 型別守衛應該正確驗證', () => {
      const error = new BaseError('TEST', '測試');
      const regularError = new Error('普通錯誤');
      
      expect(isBaseError(error)).toBe(true);
      expect(isBaseError(regularError)).toBe(false);
      expect(isBaseError(null)).toBe(false);
    });
  });

  describe('ParserError 類別', () => {
    it('應該能建立解析錯誤', () => {
      const location = createLocation(
        'test.ts',
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      const error = new ParserError('語法錯誤', location, 'SYNTAX_ERROR');
      
      expect(error.name).toBe('ParserError');
      expect(error.code).toBe('SYNTAX_ERROR');
      expect(error.message).toBe('語法錯誤');
      expect(error.location).toEqual(location);
      expect(error.syntaxElement).toBeUndefined();
    });

    it('應該能建立包含語法元素的解析錯誤', () => {
      const location = createLocation(
        'test.ts', 
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      const error = new ParserError('語法錯誤', location, 'SYNTAX_ERROR', 'identifier');
      
      expect(error.syntaxElement).toBe('identifier');
    });

    it('應該繼承 BaseError 的功能', () => {
      const location = createLocation(
        'test.ts',
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      const error = new ParserError('語法錯誤', location);
      
      expect(error).toBeInstanceOf(BaseError);
      expect(error.toJSON().name).toBe('ParserError');
    });

    it('isParserError 型別守衛應該正確驗證', () => {
      const location = createLocation(
        'test.ts',
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      const parserError = new ParserError('語法錯誤', location);
      const baseError = new BaseError('TEST', '測試');
      
      expect(isParserError(parserError)).toBe(true);
      expect(isParserError(baseError)).toBe(false);
    });
  });

  describe('FileError 類別', () => {
    it('應該能建立檔案操作錯誤', () => {
      const error = new FileError('檔案不存在', '/path/to/file.ts', 'FILE_NOT_FOUND');
      
      expect(error.name).toBe('FileError');
      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.message).toBe('檔案不存在');
      expect(error.filePath).toBe('/path/to/file.ts');
      expect(error.operation).toBeUndefined();
    });

    it('應該能建立包含操作類型的檔案錯誤', () => {
      const error = new FileError('檔案不存在', '/path/to/file.ts', 'FILE_NOT_FOUND', 'read');
      
      expect(error.operation).toBe('read');
    });

    it('isFileError 型別守衛應該正確驗證', () => {
      const fileError = new FileError('檔案錯誤', '/path/file.ts');
      const baseError = new BaseError('TEST', '測試');
      
      expect(isFileError(fileError)).toBe(true);
      expect(isFileError(baseError)).toBe(false);
    });
  });

  describe('ValidationError 類別', () => {
    it('應該能建立驗證錯誤', () => {
      const error = new ValidationError('值無效', 'username', 'INVALID_VALUE');
      
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('INVALID_VALUE');
      expect(error.message).toBe('值無效');
      expect(error.field).toBe('username');
      expect(error.value).toBeUndefined();
    });

    it('應該能建立包含值的驗證錯誤', () => {
      const error = new ValidationError('值無效', 'username', 'INVALID_VALUE', 'invalid-user');
      
      expect(error.value).toBe('invalid-user');
    });

    it('isValidationError 型別守衛應該正確驗證', () => {
      const validationError = new ValidationError('驗證錯誤', 'field');
      const baseError = new BaseError('TEST', '測試');
      
      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(baseError)).toBe(false);
    });
  });

  describe('ConfigError 類別', () => {
    it('應該能建立配置錯誤', () => {
      const error = new ConfigError('配置無效', 'parser.typescript', 'INVALID_CONFIG');
      
      expect(error.name).toBe('ConfigError');
      expect(error.code).toBe('INVALID_CONFIG');
      expect(error.message).toBe('配置無效');
      expect(error.configPath).toBe('parser.typescript');
      expect(error.expectedType).toBeUndefined();
    });

    it('應該能建立包含預期類型的配置錯誤', () => {
      const error = new ConfigError('配置無效', 'parser.typescript', 'INVALID_CONFIG', 'boolean');
      
      expect(error.expectedType).toBe('boolean');
    });

    it('isConfigError 型別守衛應該正確驗證', () => {
      const configError = new ConfigError('配置錯誤', 'config.path');
      const baseError = new BaseError('TEST', '測試');
      
      expect(isConfigError(configError)).toBe(true);
      expect(isConfigError(baseError)).toBe(false);
    });
  });

  describe('錯誤工廠函式', () => {
    it('應該能根據類型建立對應的錯誤', () => {
      const location = createLocation(
        'test.ts',
        createRange(createPosition(1, 1), createPosition(1, 10))
      );
      
      const parserError = createError('parser', '語法錯誤', { location });
      const fileError = createError('file', '檔案不存在', { filePath: '/test.ts' });
      const validationError = createError('validation', '驗證失敗', { field: 'name' });
      const configError = createError('config', '配置無效', { configPath: 'app.parser' });
      
      expect(isParserError(parserError)).toBe(true);
      expect(isFileError(fileError)).toBe(true);
      expect(isValidationError(validationError)).toBe(true);
      expect(isConfigError(configError)).toBe(true);
    });

    it('應該拒絕無效的錯誤類型', () => {
      expect(() => createError('invalid' as any, '錯誤')).toThrow('未知的錯誤類型');
    });
  });

  describe('錯誤格式化功能', () => {
    it('應該能格式化錯誤訊息', () => {
      const location = createLocation(
        'test.ts',
        createRange(createPosition(5, 10), createPosition(5, 15))
      );
      const error = new ParserError('語法錯誤', location, 'SYNTAX_ERROR');
      
      const formatted = formatError(error);
      
      expect(formatted).toContain('ParserError');
      expect(formatted).toContain('SYNTAX_ERROR');
      expect(formatted).toContain('語法錯誤');
      expect(formatted).toContain('test.ts');
      expect(formatted).toContain('5:10');
    });

    it('應該能格式化不包含位置資訊的錯誤', () => {
      const error = new FileError('檔案不存在', '/test.ts');
      const formatted = formatError(error);
      
      expect(formatted).toContain('FileError');
      expect(formatted).toContain('檔案不存在');
      expect(formatted).toContain('/test.ts');
    });
  });

  describe('錯誤鏈與因果關係', () => {
    it('應該能建立錯誤鏈', () => {
      const rootError = new Error('根本原因');
      const fileError = new FileError('檔案讀取失敗', '/test.ts', 'FILE_READ_ERROR');
      fileError.cause = rootError;
      
      expect(fileError.cause).toBe(rootError);
    });

    it('應該能追蹤錯誤的完整鏈條', () => {
      const ioError = new Error('I/O 錯誤');
      const fileError = new FileError('檔案讀取失敗', '/test.ts', 'FILE_READ_ERROR');
      fileError.cause = ioError;
      
      const parserError = new ParserError(
        '無法解析檔案', 
        createLocation('/test.ts', createRange(createPosition(1, 1), createPosition(1, 1)))
      );
      parserError.cause = fileError;
      
      // 檢查錯誤鏈
      expect(parserError.cause).toBe(fileError);
      expect((parserError.cause as FileError).cause).toBe(ioError);
    });
  });
});

