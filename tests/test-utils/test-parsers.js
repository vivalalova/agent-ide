/**
 * 測試用 Parser 插件
 * 為所有測試提供統一的 Mock Parser 實作
 */
import { SymbolType, ReferenceType, DependencyType } from '../../src/shared/types';
import { ParserRegistry } from '../../src/infrastructure/parser/registry';
/**
 * 基礎測試 Parser
 */
class BaseTestParser {
    async extractDependencies(ast) {
        const dependencies = [];
        const content = ast.root.children || [];
        for (const node of content) {
            if (node.type === 'ImportStatement' && node.value) {
                dependencies.push({
                    path: node.properties?.value || node.value,
                    type: DependencyType.Import,
                    isRelative: (node.properties?.value || node.value).startsWith('./'),
                    importedSymbols: []
                });
            }
        }
        return dependencies;
    }
    async findReferences(ast, symbol) {
        return [{
                symbol,
                location: symbol.location,
                type: ReferenceType.Definition
            }];
    }
    async rename(ast, position, newName) {
        return [{
                filePath: '',
                startOffset: position.offset || 0,
                oldText: '',
                newText: newName
            }];
    }
    async extractFunction(ast, selection) {
        return [{
                type: 'replace',
                range: selection,
                text: 'function extracted() { /* extracted */ }'
            }];
    }
    async findDefinition(ast, position) {
        return {
            symbol: {
                name: 'testSymbol',
                type: 'function',
                position,
                scope: { type: 'global' },
                modifiers: []
            },
            position,
            filePath: ast.sourceFile
        };
    }
    async findUsages(ast, symbol) {
        return [{
                symbol,
                position: symbol.position,
                filePath: ast.sourceFile,
                context: 'test context'
            }];
    }
    async validate() {
        return { isValid: true, errors: [], warnings: [] };
    }
    async dispose() {
        // 清理資源
    }
}
/**
 * 測試用 TypeScript Parser
 */
export class TestTypeScriptParser extends BaseTestParser {
    name = 'typescript';
    version = '1.0.0-test';
    supportedExtensions = ['.ts', '.tsx'];
    supportedLanguages = ['typescript'];
    async parse(code, filePath) {
        const hasClass = code.includes('class ');
        const hasFunction = code.includes('function ');
        const hasInterface = code.includes('interface ');
        const hasExport = code.includes('export ');
        const hasImport = code.includes('import ');
        const children = [];
        if (hasImport) {
            const importMatch = code.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
            if (importMatch) {
                children.push({
                    type: 'ImportStatement',
                    range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                    properties: { value: importMatch[1] },
                    children: []
                });
            }
        }
        if (hasClass) {
            const classMatch = code.match(/class\s+(\w+)/);
            children.push({
                type: 'ClassDeclaration',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                properties: { value: classMatch ? classMatch[1] : 'TestClass' },
                children: []
            });
        }
        if (hasFunction) {
            const funcMatch = code.match(/function\s+(\w+)/);
            children.push({
                type: 'FunctionDeclaration',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                properties: { value: funcMatch ? funcMatch[1] : 'testFunction' },
                children: []
            });
        }
        if (hasInterface) {
            const intMatch = code.match(/interface\s+(\w+)/);
            children.push({
                type: 'InterfaceDeclaration',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                properties: { value: intMatch ? intMatch[1] : 'TestInterface' },
                children: []
            });
        }
        return {
            type: 'Program',
            root: {
                type: 'Program',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 100 } },
                properties: {},
                children
            },
            sourceFile: filePath,
            metadata: {
                language: 'typescript',
                parsed: true,
                parserVersion: this.version
            }
        };
    }
    async extractSymbols(ast) {
        const symbols = [];
        for (const child of ast.root.children || []) {
            const position = { line: 1, column: 1 };
            const scope = { type: 'global' };
            switch (child.type) {
                case 'ClassDeclaration':
                    symbols.push({
                        name: (child.properties?.value || child.value),
                        type: SymbolType.Class,
                        position,
                        scope: { type: 'global', name: 'global', parent: null },
                        modifiers: ['export']
                    });
                    break;
                case 'FunctionDeclaration':
                    symbols.push({
                        name: (child.properties?.value || child.value),
                        type: SymbolType.Function,
                        position,
                        scope: { type: 'global', name: 'global', parent: null },
                        modifiers: []
                    });
                    break;
                case 'InterfaceDeclaration':
                    symbols.push({
                        name: (child.properties?.value || child.value),
                        type: SymbolType.Interface,
                        position,
                        scope: { type: 'global', name: 'global', parent: null },
                        modifiers: ['export']
                    });
                    break;
            }
        }
        return symbols;
    }
}
/**
 * 測試用 JavaScript Parser
 */
export class TestJavaScriptParser extends BaseTestParser {
    name = 'javascript';
    version = '1.0.0-test';
    supportedExtensions = ['.js', '.jsx'];
    supportedLanguages = ['javascript'];
    async parse(code, filePath) {
        const hasFunction = code.includes('function ');
        const hasClass = code.includes('class ');
        const hasConst = code.includes('const ');
        const hasLet = code.includes('let ');
        const children = [];
        if (hasFunction) {
            const funcMatch = code.match(/function\s+(\w+)/);
            children.push({
                type: 'FunctionDeclaration',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                properties: { value: funcMatch ? funcMatch[1] : 'jsFunction' },
                children: []
            });
        }
        if (hasClass) {
            const classMatch = code.match(/class\s+(\w+)/);
            children.push({
                type: 'ClassDeclaration',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                properties: { value: classMatch ? classMatch[1] : 'JSClass' },
                children: []
            });
        }
        if (hasConst) {
            const constMatch = code.match(/const\s+(\w+)/);
            children.push({
                type: 'VariableDeclaration',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
                properties: { value: constMatch ? constMatch[1] : 'jsConst' },
                children: []
            });
        }
        return {
            type: 'Program',
            root: {
                type: 'Program',
                range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 100 } },
                properties: {},
                children
            },
            sourceFile: filePath,
            metadata: {
                language: 'javascript',
                parsed: true,
                parserVersion: this.version
            }
        };
    }
    async extractSymbols(ast) {
        const symbols = [];
        for (const child of ast.root.children || []) {
            const position = { line: 1, column: 1 };
            const scope = { type: 'global' };
            switch (child.type) {
                case 'FunctionDeclaration':
                    symbols.push({
                        name: (child.properties?.value || child.value),
                        type: SymbolType.Function,
                        position,
                        scope: { type: 'global', name: 'global', parent: null },
                        modifiers: []
                    });
                    break;
                case 'ClassDeclaration':
                    symbols.push({
                        name: (child.properties?.value || child.value),
                        type: SymbolType.Class,
                        position,
                        scope: { type: 'global', name: 'global', parent: null },
                        modifiers: []
                    });
                    break;
                case 'VariableDeclaration':
                    symbols.push({
                        name: (child.properties?.value || child.value),
                        type: SymbolType.Variable,
                        position,
                        scope: { type: 'global', name: 'global', parent: null },
                        modifiers: []
                    });
                    break;
            }
        }
        return symbols;
    }
}
/**
 * 註冊測試 Parsers
 */
export function registerTestParsers() {
    const registry = ParserRegistry.getInstance();
    // 檢查是否已經註冊過
    if (registry.isDisposed) {
        ParserRegistry.resetInstance();
    }
    const newRegistry = ParserRegistry.getInstance();
    try {
        // 註冊 TypeScript Parser
        if (!newRegistry.getParserByName('typescript')) {
            newRegistry.register(new TestTypeScriptParser());
        }
        // 註冊 JavaScript Parser
        if (!newRegistry.getParserByName('javascript')) {
            newRegistry.register(new TestJavaScriptParser());
        }
    }
    catch (error) {
        // 如果已經註冊過就忽略錯誤
        if (!(error instanceof Error && error.message.includes('已存在'))) {
            throw error;
        }
    }
}
/**
 * 清理測試 Parsers
 */
export function cleanupTestParsers() {
    ParserRegistry.resetInstance();
}
//# sourceMappingURL=test-parsers.js.map