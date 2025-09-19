/**
 * Parser 插件型別定義測試
 * 使用 TDD 紅-綠-重構循環
 */

import { describe, it, expect } from 'vitest';
import type {
  CodeEdit,
  Definition,
  Usage,
  ValidationResult,
  ParserOptions,
  ParserCapabilities,
  ParserError
} from '../../../src/infrastructure/parser/types';

describe('Parser Types', () => {
  describe('CodeEdit 型別', () => {
    it('應該正確定義程式碼編輯操作的介面', () => {
      // 測試 CodeEdit 介面的基本結構
      const codeEdit: CodeEdit = {
        filePath: '/path/to/file.ts',
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        },
        newText: 'newVariableName'
      };

      expect(codeEdit.filePath).toBe('/path/to/file.ts');
      expect(codeEdit.range.start.line).toBe(1);
      expect(codeEdit.newText).toBe('newVariableName');
    });

    it('應該支援可選的編輯類型', () => {
      const codeEdit: CodeEdit = {
        filePath: '/path/to/file.ts',
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        },
        newText: 'newVariableName',
        editType: 'rename'
      };

      expect(codeEdit.editType).toBe('rename');
    });
  });

  describe('Definition 型別', () => {
    it('應該正確定義定義位置資訊的介面', () => {
      const definition: Definition = {
        location: {
          filePath: '/path/to/definition.ts',
          range: {
            start: { line: 5, column: 10 },
            end: { line: 5, column: 20 }
          }
        },
        kind: 'function'
      };

      expect(definition.location.filePath).toBe('/path/to/definition.ts');
      expect(definition.kind).toBe('function');
    });

    it('應該支援可選的容器名稱', () => {
      const definition: Definition = {
        location: {
          filePath: '/path/to/definition.ts',
          range: {
            start: { line: 5, column: 10 },
            end: { line: 5, column: 20 }
          }
        },
        kind: 'method',
        containerName: 'MyClass'
      };

      expect(definition.containerName).toBe('MyClass');
    });
  });

  describe('Usage 型別', () => {
    it('應該正確定義使用位置資訊的介面', () => {
      const usage: Usage = {
        location: {
          filePath: '/path/to/usage.ts',
          range: {
            start: { line: 10, column: 5 },
            end: { line: 10, column: 15 }
          }
        },
        kind: 'read'
      };

      expect(usage.location.filePath).toBe('/path/to/usage.ts');
      expect(usage.kind).toBe('read');
    });

    it('應該支援不同的使用類型', () => {
      const writeUsage: Usage = {
        location: {
          filePath: '/path/to/usage.ts',
          range: {
            start: { line: 10, column: 5 },
            end: { line: 10, column: 15 }
          }
        },
        kind: 'write'
      };

      expect(writeUsage.kind).toBe('write');
    });
  });

  describe('ValidationResult 型別', () => {
    it('應該正確定義驗證結果的介面', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: []
      };

      expect(result.valid).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('應該支援驗證失敗的情況', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [{
          code: 'SYNTAX_ERROR',
          message: '語法錯誤',
          location: {
            filePath: '/path/to/file.ts',
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 5 }
            }
          }
        }],
        warnings: []
      };

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].code).toBe('SYNTAX_ERROR');
    });
  });

  describe('ParserOptions 型別', () => {
    it('應該正確定義解析器配置選項的介面', () => {
      const options: ParserOptions = {
        strictMode: true,
        allowExperimentalFeatures: false,
        targetVersion: 'ES2022'
      };

      expect(options.strictMode).toBe(true);
      expect(options.allowExperimentalFeatures).toBe(false);
      expect(options.targetVersion).toBe('ES2022');
    });

    it('應該支援自定義選項', () => {
      const options: ParserOptions = {
        strictMode: true,
        customOptions: {
          enableDecorators: true,
          jsx: 'react'
        }
      };

      expect(options.customOptions?.enableDecorators).toBe(true);
      expect(options.customOptions?.jsx).toBe('react');
    });
  });

  describe('ParserCapabilities 型別', () => {
    it('應該正確定義解析器能力聲明的介面', () => {
      const capabilities: ParserCapabilities = {
        supportsRename: true,
        supportsExtractFunction: true,
        supportsGoToDefinition: true,
        supportsFindUsages: true,
        supportsCodeActions: false
      };

      expect(capabilities.supportsRename).toBe(true);
      expect(capabilities.supportsExtractFunction).toBe(true);
      expect(capabilities.supportsGoToDefinition).toBe(true);
      expect(capabilities.supportsFindUsages).toBe(true);
      expect(capabilities.supportsCodeActions).toBe(false);
    });
  });

  describe('ParserError 型別', () => {
    it('應該繼承自基礎 Error 並擴展額外屬性', () => {
      const error: ParserError = {
        name: 'ParseError',
        message: '解析失敗',
        code: 'PARSE_ERROR',
        location: {
          filePath: '/path/to/file.ts',
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 5 }
          }
        }
      };

      expect(error.name).toBe('ParseError');
      expect(error.message).toBe('解析失敗');
      expect(error.code).toBe('PARSE_ERROR');
      expect(error.location.filePath).toBe('/path/to/file.ts');
    });

    it('應該支援可選的語法元素資訊', () => {
      const error: ParserError = {
        name: 'UnsupportedSyntaxError',
        message: '不支援的語法',
        code: 'UNSUPPORTED_SYNTAX',
        location: {
          filePath: '/path/to/file.ts',
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 5 }
          }
        },
        syntaxElement: 'async generator'
      };

      expect(error.syntaxElement).toBe('async generator');
    });
  });
});