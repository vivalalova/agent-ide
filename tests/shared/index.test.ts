import { describe, it, expect } from 'vitest';

describe('Shared 模組統一匯出測試', () => {
  it('應該能從統一匯出中使用所有核心功能', async () => {
    // 動態匯入以避免循環依賴問題
    const shared = await import('../../src/shared');
    
    // 測試核心型別創建函式
    const position = shared.createPosition(1, 1);
    const range = shared.createRange(position, shared.createPosition(1, 10));
    const location = shared.createLocation('test.ts', range);
    
    expect(shared.isPosition(position)).toBe(true);
    expect(shared.isRange(range)).toBe(true);
    expect(shared.isLocation(location)).toBe(true);
    
    // 測試 Symbol 功能
    const scope = shared.createScope('global');
    const symbol = shared.createSymbol('test', shared.SymbolType.Function, location);
    
    expect(shared.isScope(scope)).toBe(true);
    expect(shared.isSymbol(symbol)).toBe(true);
    
    // 測試 AST 功能
    const astNode = shared.createASTNode('identifier', range);
    const metadata = shared.createASTMetadata('typescript', '5.0.0');
    const ast = shared.createAST('test.ts', astNode, metadata);
    
    expect(shared.isASTNode(astNode)).toBe(true);
    expect(shared.isASTMetadata(metadata)).toBe(true);
    expect(shared.isAST(ast)).toBe(true);
    
    // 測試錯誤處理
    const error = new shared.BaseError('TEST_ERROR', '測試錯誤');
    const parserError = new shared.ParserError('語法錯誤', location);
    const fileError = new shared.FileError('檔案錯誤', '/test.ts');
    const validationError = new shared.ValidationError('驗證錯誤', 'field');
    const configError = new shared.ConfigError('配置錯誤', 'config.path');
    
    expect(shared.isBaseError(error)).toBe(true);
    expect(shared.isParserError(parserError)).toBe(true);
    expect(shared.isFileError(fileError)).toBe(true);
    expect(shared.isValidationError(validationError)).toBe(true);
    expect(shared.isConfigError(configError)).toBe(true);
    
    // 測試錯誤工廠函式
    const factoryError = shared.createError('file', '檔案不存在', { filePath: '/test.ts' });
    expect(shared.isFileError(factoryError)).toBe(true);
    
    // 測試錯誤格式化
    const formatted = shared.formatError(error);
    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('TEST_ERROR');
    
    // 測試錯誤代碼常量
    expect(shared.ErrorCodes.SYNTAX_ERROR).toBe('SYNTAX_ERROR');
    expect(shared.ErrorCodes.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
  });
  
  it('應該能使用型別列舉', async () => {
    const shared = await import('../../src/shared');
    
    expect(shared.SymbolType.Class).toBe('class');
    expect(shared.SymbolType.Function).toBe('function');
    expect(shared.ReferenceType.Definition).toBe('definition');
    expect(shared.DependencyType.Import).toBe('import');
  });
});