/**
 * Shared Errors 單元測試
 */
import { describe, it, expect } from 'vitest';

import {
  BaseError,
  isBaseError
} from '@shared/errors/base-error.js';

import {
  ConfigError,
  isConfigError
} from '@shared/errors/config-error.js';

import {
  FileError,
  isFileError
} from '@shared/errors/file-error.js';

import {
  ParserError,
  DuplicateParserError,
  ParserNotFoundError,
  IncompatibleVersionError,
  ParserInitializationError,
  ParserFactoryError,
  isParserError,
  isDuplicateParserError,
  isParserNotFoundError,
  isIncompatibleVersionError,
  isParserInitializationError,
  isParserFactoryError
} from '@shared/errors/parser-error.js';

import {
  ValidationError,
  isValidationError
} from '@shared/errors/validation-error.js';

// ============================================
// BaseError Tests
// ============================================

describe('BaseError', () => {
  describe('constructor', () => {
    it('should create error with required properties', () => {
      const error = new BaseError('TEST_ERROR', 'Test message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('BaseError');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create error with optional details', () => {
      const details = { key: 'value' };
      const error = new BaseError('TEST_ERROR', 'Test message', details);
      expect(error.details).toEqual(details);
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new BaseError('TEST_ERROR', 'Test message', undefined, cause);
      expect(error.cause).toBe(cause);
    });

    it('should set undefined for missing optional properties', () => {
      const error = new BaseError('TEST_ERROR', 'Test message');
      expect(error.details).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new BaseError('TEST_ERROR', 'Test message', { key: 'value' });
      const json = error.toJSON();
      expect(json.name).toBe('BaseError');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.message).toBe('Test message');
      expect(json.details).toEqual({ key: 'value' });
      expect(json.timestamp).toBeDefined();
    });

    it('should include cause message in JSON', () => {
      const cause = new Error('Original error');
      const error = new BaseError('TEST_ERROR', 'Test message', undefined, cause);
      const json = error.toJSON();
      expect(json.cause).toBe('Original error');
    });

    it('should not include cause if not present', () => {
      const error = new BaseError('TEST_ERROR', 'Test message');
      const json = error.toJSON();
      expect(json.cause).toBeUndefined();
    });
  });

  describe('toString', () => {
    it('should format error as string', () => {
      const error = new BaseError('TEST_ERROR', 'Test message');
      const str = error.toString();
      expect(str).toContain('BaseError');
      expect(str).toContain('TEST_ERROR');
      expect(str).toContain('Test message');
    });

    it('should include details in string', () => {
      const error = new BaseError('TEST_ERROR', 'Test message', { key: 'value' });
      const str = error.toString();
      expect(str).toContain('詳細資料');
      expect(str).toContain('key');
      expect(str).toContain('value');
    });

    it('should include cause in string', () => {
      const cause = new Error('Original error');
      const error = new BaseError('TEST_ERROR', 'Test message', undefined, cause);
      const str = error.toString();
      expect(str).toContain('原因');
      expect(str).toContain('Original error');
    });
  });
});

describe('isBaseError', () => {
  it('should return true for BaseError', () => {
    expect(isBaseError(new BaseError('TEST', 'test'))).toBe(true);
  });

  it('should return false for regular Error', () => {
    expect(isBaseError(new Error('test'))).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isBaseError(null)).toBe(false);
    expect(isBaseError('error')).toBe(false);
    expect(isBaseError({ code: 'TEST' })).toBe(false);
  });
});

// ============================================
// ConfigError Tests
// ============================================

describe('ConfigError', () => {
  describe('constructor', () => {
    it('should create error with config path', () => {
      const error = new ConfigError('Invalid config', '/path/to/config.json');
      expect(error.configPath).toBe('/path/to/config.json');
      expect(error.message).toBe('Invalid config');
      expect(error.code).toBe('CONFIG_ERROR');
    });

    it('should create error with custom code', () => {
      const error = new ConfigError('Invalid config', '/path', 'CUSTOM_CODE');
      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should create error with expected type', () => {
      const error = new ConfigError('Invalid config', '/path', 'CONFIG_ERROR', 'object');
      expect(error.expectedType).toBe('object');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original');
      const error = new ConfigError('Invalid config', '/path', 'CONFIG_ERROR', undefined, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('toString', () => {
    it('should include config path', () => {
      const error = new ConfigError('Invalid config', '/path/to/config.json');
      const str = error.toString();
      expect(str).toContain('配置路徑');
      expect(str).toContain('/path/to/config.json');
    });

    it('should include expected type when provided', () => {
      const error = new ConfigError('Invalid config', '/path', 'CONFIG_ERROR', 'object');
      const str = error.toString();
      expect(str).toContain('預期類型');
      expect(str).toContain('object');
    });
  });
});

describe('isConfigError', () => {
  it('should return true for ConfigError', () => {
    expect(isConfigError(new ConfigError('test', '/path'))).toBe(true);
  });

  it('should return false for BaseError', () => {
    expect(isConfigError(new BaseError('TEST', 'test'))).toBe(false);
  });
});

// ============================================
// FileError Tests
// ============================================

describe('FileError', () => {
  describe('constructor', () => {
    it('should create error with file path', () => {
      const error = new FileError('File not found', '/path/to/file.ts');
      expect(error.filePath).toBe('/path/to/file.ts');
      expect(error.message).toBe('File not found');
      expect(error.code).toBe('FILE_ERROR');
    });

    it('should create error with custom code', () => {
      const error = new FileError('File not found', '/path', 'FILE_NOT_FOUND');
      expect(error.code).toBe('FILE_NOT_FOUND');
    });

    it('should create error with operation', () => {
      const error = new FileError('Permission denied', '/path', 'FILE_ERROR', 'read');
      expect(error.operation).toBe('read');
    });

    it('should create error with cause', () => {
      const cause = new Error('ENOENT');
      const error = new FileError('File not found', '/path', 'FILE_ERROR', undefined, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('toString', () => {
    it('should include file path', () => {
      const error = new FileError('File not found', '/path/to/file.ts');
      const str = error.toString();
      expect(str).toContain('檔案');
      expect(str).toContain('/path/to/file.ts');
    });

    it('should include operation when provided', () => {
      const error = new FileError('Permission denied', '/path', 'FILE_ERROR', 'write');
      const str = error.toString();
      expect(str).toContain('操作');
      expect(str).toContain('write');
    });
  });
});

describe('isFileError', () => {
  it('should return true for FileError', () => {
    expect(isFileError(new FileError('test', '/path'))).toBe(true);
  });

  it('should return false for BaseError', () => {
    expect(isFileError(new BaseError('TEST', 'test'))).toBe(false);
  });
});

// ============================================
// ParserError Tests
// ============================================

describe('ParserError', () => {
  const mockLocation = {
    filePath: '/path/to/file.ts',
    range: {
      start: { line: 10, column: 5, offset: undefined },
      end: { line: 10, column: 20, offset: undefined }
    }
  };

  describe('constructor', () => {
    it('should create error with location', () => {
      const error = new ParserError('Syntax error', mockLocation);
      expect(error.location).toEqual(mockLocation);
      expect(error.message).toBe('Syntax error');
      expect(error.code).toBe('PARSER_ERROR');
    });

    it('should create error with custom code', () => {
      const error = new ParserError('Syntax error', mockLocation, 'SYNTAX_ERROR');
      expect(error.code).toBe('SYNTAX_ERROR');
    });

    it('should create error with syntax element', () => {
      const error = new ParserError('Syntax error', mockLocation, 'PARSER_ERROR', 'function');
      expect(error.syntaxElement).toBe('function');
    });
  });

  describe('toString', () => {
    it('should include location', () => {
      const error = new ParserError('Syntax error', mockLocation);
      const str = error.toString();
      expect(str).toContain('位置');
      expect(str).toContain('/path/to/file.ts:10:5');
    });

    it('should include syntax element when provided', () => {
      const error = new ParserError('Syntax error', mockLocation, 'PARSER_ERROR', 'class');
      const str = error.toString();
      expect(str).toContain('語法元素');
      expect(str).toContain('class');
    });
  });
});

describe('DuplicateParserError', () => {
  it('should create error with parser name', () => {
    const error = new DuplicateParserError('TypeScript');
    expect(error.message).toContain("Parser 'TypeScript' 已經註冊");
    expect(error.code).toBe('DUPLICATE_PARSER_ERROR');
  });

  it('should accept cause', () => {
    const cause = new Error('Original');
    const error = new DuplicateParserError('TypeScript', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('ParserNotFoundError', () => {
  it('should create error for parser name', () => {
    const error = new ParserNotFoundError('TypeScript', 'name');
    expect(error.message).toContain("找不到 Parser 'TypeScript' 的 Parser");
    expect(error.code).toBe('PARSER_NOT_FOUND_ERROR');
  });

  it('should create error for extension', () => {
    const error = new ParserNotFoundError('.ts', 'extension');
    expect(error.message).toContain("支援副檔名 '.ts'");
  });

  it('should create error for language', () => {
    const error = new ParserNotFoundError('typescript', 'language');
    expect(error.message).toContain("支援語言 'typescript'");
  });
});

describe('IncompatibleVersionError', () => {
  it('should create error with version info', () => {
    const error = new IncompatibleVersionError('TypeScript', '5.0', '4.0');
    expect(error.message).toContain("Parser 'TypeScript' 版本不相容");
    expect(error.message).toContain('期望 5.0');
    expect(error.message).toContain('實際 4.0');
    expect(error.code).toBe('INCOMPATIBLE_VERSION_ERROR');
  });
});

describe('ParserInitializationError', () => {
  it('should create error with reason', () => {
    const error = new ParserInitializationError('TypeScript', 'Missing dependency');
    expect(error.message).toContain("Parser 'TypeScript' 初始化失敗");
    expect(error.message).toContain('Missing dependency');
    expect(error.code).toBe('PARSER_INITIALIZATION_ERROR');
  });
});

describe('ParserFactoryError', () => {
  it('should create error with message', () => {
    const error = new ParserFactoryError('Factory failed');
    expect(error.message).toBe('Factory failed');
    expect(error.code).toBe('PARSER_FACTORY_ERROR');
  });
});

describe('Parser error type guards', () => {
  const mockLocation = {
    filePath: '/path',
    range: {
      start: { line: 1, column: 1, offset: undefined },
      end: { line: 1, column: 1, offset: undefined }
    }
  };

  it('isParserError should return true for ParserError and subclasses', () => {
    expect(isParserError(new ParserError('test', mockLocation))).toBe(true);
    expect(isParserError(new DuplicateParserError('test'))).toBe(true);
    expect(isParserError(new ParserNotFoundError('test', 'name'))).toBe(true);
    expect(isParserError(new IncompatibleVersionError('test', '1', '2'))).toBe(true);
    expect(isParserError(new ParserInitializationError('test', 'reason'))).toBe(true);
    expect(isParserError(new ParserFactoryError('test'))).toBe(true);
  });

  it('isDuplicateParserError should return true only for DuplicateParserError', () => {
    expect(isDuplicateParserError(new DuplicateParserError('test'))).toBe(true);
    expect(isDuplicateParserError(new ParserError('test', mockLocation))).toBe(false);
  });

  it('isParserNotFoundError should return true only for ParserNotFoundError', () => {
    expect(isParserNotFoundError(new ParserNotFoundError('test', 'name'))).toBe(true);
    expect(isParserNotFoundError(new ParserError('test', mockLocation))).toBe(false);
  });

  it('isIncompatibleVersionError should return true only for IncompatibleVersionError', () => {
    expect(isIncompatibleVersionError(new IncompatibleVersionError('test', '1', '2'))).toBe(true);
    expect(isIncompatibleVersionError(new ParserError('test', mockLocation))).toBe(false);
  });

  it('isParserInitializationError should return true only for ParserInitializationError', () => {
    expect(isParserInitializationError(new ParserInitializationError('test', 'reason'))).toBe(true);
    expect(isParserInitializationError(new ParserError('test', mockLocation))).toBe(false);
  });

  it('isParserFactoryError should return true only for ParserFactoryError', () => {
    expect(isParserFactoryError(new ParserFactoryError('test'))).toBe(true);
    expect(isParserFactoryError(new ParserError('test', mockLocation))).toBe(false);
  });
});

// ============================================
// ValidationError Tests
// ============================================

describe('ValidationError', () => {
  describe('constructor', () => {
    it('should create error with field', () => {
      const error = new ValidationError('Invalid value', 'email');
      expect(error.field).toBe('email');
      expect(error.message).toBe('Invalid value');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create error with custom code', () => {
      const error = new ValidationError('Invalid value', 'email', 'INVALID_EMAIL');
      expect(error.code).toBe('INVALID_EMAIL');
    });

    it('should create error with value', () => {
      const error = new ValidationError('Invalid value', 'email', 'VALIDATION_ERROR', 'invalid@');
      expect(error.value).toBe('invalid@');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original');
      const error = new ValidationError('Invalid value', 'email', 'VALIDATION_ERROR', undefined, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('toString', () => {
    it('should include field', () => {
      const error = new ValidationError('Invalid value', 'email');
      const str = error.toString();
      expect(str).toContain('欄位');
      expect(str).toContain('email');
    });

    it('should include value when provided', () => {
      const error = new ValidationError('Invalid value', 'email', 'VALIDATION_ERROR', 'bad-value');
      const str = error.toString();
      expect(str).toContain('值');
      expect(str).toContain('bad-value');
    });

    it('should not include value when undefined', () => {
      const error = new ValidationError('Invalid value', 'email');
      const str = error.toString();
      expect(str).not.toContain('值:');
    });
  });
});

describe('isValidationError', () => {
  it('should return true for ValidationError', () => {
    expect(isValidationError(new ValidationError('test', 'field'))).toBe(true);
  });

  it('should return false for BaseError', () => {
    expect(isValidationError(new BaseError('TEST', 'test'))).toBe(false);
  });
});
