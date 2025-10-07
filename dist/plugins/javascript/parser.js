/**
 * JavaScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */
import { parse as babelParse } from '@babel/parser';
import * as babel from '@babel/types';
import babelTraverse from '@babel/traverse';
import babelGenerate from '@babel/generator';
// Handle both ESM and CJS module formats
const traverse = babelTraverse.default || babelTraverse;
const generate = babelGenerate.default || babelGenerate;
import { createValidationSuccess, createValidationFailure, createCodeEdit, createDefinition, createUsage } from '../../infrastructure/parser/index.js';
import { createAST, createASTMetadata, ReferenceType, SymbolType, DependencyType, createSymbol, createReference, createDependency } from '../../shared/types/index.js';
import { DEFAULT_PARSE_OPTIONS, JavaScriptParseError, createJavaScriptASTNode, createParseError, babelLocationToPosition, isValidIdentifier, isRelativePath, getImportedSymbols, getPluginsForFile } from './types.js';
/**
 * JavaScript Parser 實作
 */
export class JavaScriptParser {
    name = 'javascript';
    version = '1.0.0';
    supportedExtensions = ['.js', '.jsx', '.mjs', '.cjs'];
    supportedLanguages = ['javascript', 'jsx'];
    parseOptions;
    constructor(parseOptions) {
        this.parseOptions = { ...DEFAULT_PARSE_OPTIONS, ...parseOptions };
    }
    /**
     * 解析 JavaScript 程式碼
     */
    async parse(code, filePath) {
        this.validateInput(code, filePath);
        try {
            // 根據檔案類型調整解析選項
            const options = this.getParseOptionsForFile(filePath);
            // 使用 Babel parser 解析程式碼
            const babelAST = babelParse(code, options);
            // 建立我們的 AST 結構
            const rootNode = createJavaScriptASTNode(babelAST, filePath);
            const metadata = createASTMetadata(this.getLanguageFromFilePath(filePath), this.version, { babelOptions: options }, Date.now(), 0 // 會在 createAST 中計算
            );
            const baseAST = createAST(filePath, rootNode, metadata);
            const ast = {
                ...baseAST,
                root: rootNode,
                babelAST,
                sourceCode: code
            };
            return ast;
        }
        catch (error) {
            if (error instanceof JavaScriptParseError) {
                throw error;
            }
            // 包裝 Babel 解析錯誤
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw createParseError(`解析失敗: ${errorMessage}`, error instanceof Error ? error : undefined);
        }
    }
    /**
     * 提取符號
     */
    async extractSymbols(ast) {
        const typedAst = ast;
        const symbols = [];
        // 使用 Babel traverse 遍歷 AST
        traverse(typedAst.babelAST, {
            // 處理各種宣告節點
            FunctionDeclaration: (path) => {
                this.extractFunctionSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ClassDeclaration: (path) => {
                this.extractClassSymbol(path.node, symbols, typedAst.sourceFile);
            },
            VariableDeclarator: (path) => {
                this.extractVariableSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ImportDefaultSpecifier: (path) => {
                this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ImportSpecifier: (path) => {
                this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ImportNamespaceSpecifier: (path) => {
                this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ClassMethod: (path) => {
                this.extractMethodSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ClassProperty: (path) => {
                this.extractPropertySymbol(path.node, symbols, typedAst.sourceFile);
            },
            ObjectMethod: (path) => {
                this.extractObjectMethodSymbol(path.node, symbols, typedAst.sourceFile);
            },
            ObjectProperty: (path) => {
                this.extractObjectPropertySymbol(path.node, symbols, typedAst.sourceFile);
            }
        });
        return symbols;
    }
    /**
     * 查找符號引用
     */
    async findReferences(ast, symbol) {
        const typedAst = ast;
        const typedSymbol = symbol;
        const references = [];
        // 使用 Babel traverse 查找引用
        traverse(typedAst.babelAST, {
            Identifier: (path) => {
                if (path.node.name === typedSymbol.name) {
                    // 檢查是否為真正的引用
                    if (this.isReferenceToSymbol(path, typedSymbol)) {
                        const location = {
                            filePath: typedAst.sourceFile,
                            range: this.getNodeRange(path.node)
                        };
                        const referenceType = this.getReferenceType(path, typedSymbol);
                        references.push(createReference(symbol, location, referenceType));
                    }
                }
            },
            JSXIdentifier: (path) => {
                // 處理 JSX 中的識別符
                if (path.node.name === typedSymbol.name) {
                    const location = {
                        filePath: typedAst.sourceFile,
                        range: this.getNodeRange(path.node)
                    };
                    references.push(createReference(symbol, location, ReferenceType.Usage));
                }
            }
        });
        return references;
    }
    /**
     * 提取依賴關係
     */
    async extractDependencies(ast) {
        const typedAst = ast;
        const dependencies = [];
        traverse(typedAst.babelAST, {
            ImportDeclaration: (path) => {
                this.extractImportDependency(path.node, dependencies, typedAst.sourceFile);
            },
            ExportNamedDeclaration: (path) => {
                this.extractExportDependency(path.node, dependencies, typedAst.sourceFile);
            },
            ExportAllDeclaration: (path) => {
                this.extractExportDependency(path.node, dependencies, typedAst.sourceFile);
            },
            CallExpression: (path) => {
                // 處理 require() 和動態 import()
                this.extractCallExpressionDependency(path.node, dependencies, typedAst.sourceFile);
            }
        });
        return dependencies;
    }
    /**
     * 重新命名符號
     */
    async rename(ast, position, newName) {
        this.validateRenameInput(newName);
        const typedAst = ast;
        // 查找位置上的符號
        const symbol = await this.findSymbolAtPosition(typedAst, position);
        if (!symbol) {
            throw new Error('在指定位置找不到符號');
        }
        // 查找所有引用
        const references = await this.findReferences(ast, symbol);
        // 建立編輯操作
        const edits = [];
        for (const reference of references) {
            const edit = createCodeEdit(reference.location.filePath, reference.location.range, newName, 'rename');
            edits.push(edit);
        }
        return edits;
    }
    /**
     * 提取函式重構
     */
    async extractFunction(ast, selection) {
        // 這是一個複雜的重構操作，目前提供基本實作
        throw new Error('提取函式重構尚未實作');
    }
    /**
     * 查找定義
     */
    async findDefinition(ast, position) {
        const typedAst = ast;
        const symbol = await this.findSymbolAtPosition(typedAst, position);
        if (symbol) {
            return createDefinition(symbol.location, this.symbolTypeToDefinitionKind(symbol.type));
        }
        return null;
    }
    /**
     * 查找使用位置
     */
    async findUsages(ast, symbol) {
        const references = await this.findReferences(ast, symbol);
        // 過濾出使用位置（排除定義）
        return references
            .filter(ref => ref.type === ReferenceType.Usage)
            .map(ref => createUsage(ref.location, 'reference'));
    }
    /**
     * 驗證插件狀態
     */
    async validate() {
        try {
            // 檢查 Babel 是否可用
            const testCode = 'const test = true;';
            babelParse(testCode, { sourceType: 'module' });
            return createValidationSuccess();
        }
        catch (error) {
            return createValidationFailure([{
                    code: 'BABEL_UNAVAILABLE',
                    message: `Babel 解析器不可用: ${error instanceof Error ? error.message : String(error)}`,
                    location: {
                        filePath: '',
                        range: {
                            start: { line: 0, column: 0, offset: 0 },
                            end: { line: 0, column: 0, offset: 0 }
                        }
                    }
                }]);
        }
    }
    /**
     * 清理資源
     */
    async dispose() {
        // JavaScript Parser 沒有需要清理的資源
        // 但提供介面供將來擴展使用
    }
    // 私有輔助方法
    validateInput(code, filePath) {
        if (!code.trim()) {
            throw new Error('程式碼內容不能為空');
        }
        if (!filePath.trim()) {
            throw new Error('檔案路徑不能為空');
        }
    }
    validateRenameInput(newName) {
        if (!newName.trim()) {
            throw new Error('新名稱不能為空');
        }
        if (!isValidIdentifier(newName)) {
            throw new Error('新名稱必須是有效的 JavaScript 識別符');
        }
    }
    getParseOptionsForFile(filePath) {
        const options = { ...this.parseOptions };
        options.plugins = getPluginsForFile(filePath);
        // 根據副檔名調整 sourceType
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        if (ext === '.mjs') {
            options.sourceType = 'module';
        }
        else if (ext === '.cjs') {
            options.sourceType = 'script';
        }
        return options;
    }
    getLanguageFromFilePath(filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        return ext === '.jsx' ? 'jsx' : 'javascript';
    }
    getNodeRange(node) {
        if (node.loc) {
            return babelLocationToPosition(node.loc);
        }
        // 如果沒有位置資訊，返回預設範圍
        return {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 0, offset: 0 }
        };
    }
    extractFunctionSymbol(node, symbols, sourceFile) {
        if (node.id) {
            const symbol = this.createSymbolFromNode(node, node.id.name, SymbolType.Function, sourceFile);
            symbols.push(symbol);
        }
    }
    extractClassSymbol(node, symbols, sourceFile) {
        if (node.id) {
            const symbol = this.createSymbolFromNode(node, node.id.name, SymbolType.Class, sourceFile);
            symbols.push(symbol);
        }
    }
    extractVariableSymbol(node, symbols, sourceFile) {
        if (babel.isIdentifier(node.id)) {
            const symbol = this.createSymbolFromNode(node, node.id.name, SymbolType.Variable, sourceFile);
            symbols.push(symbol);
        }
    }
    extractImportSymbol(node, symbols, sourceFile) {
        const symbol = this.createSymbolFromNode(node, node.local.name, SymbolType.Variable, sourceFile, { isImported: true });
        symbols.push(symbol);
    }
    extractMethodSymbol(node, symbols, sourceFile) {
        if (babel.isIdentifier(node.key)) {
            const symbol = this.createSymbolFromNode(node, node.key.name, SymbolType.Function, sourceFile);
            symbols.push(symbol);
        }
    }
    extractPropertySymbol(node, symbols, sourceFile) {
        if (babel.isIdentifier(node.key)) {
            const symbol = this.createSymbolFromNode(node, node.key.name, SymbolType.Variable, sourceFile);
            symbols.push(symbol);
        }
    }
    extractObjectMethodSymbol(node, symbols, sourceFile) {
        if (babel.isIdentifier(node.key)) {
            const symbol = this.createSymbolFromNode(node, node.key.name, SymbolType.Function, sourceFile);
            symbols.push(symbol);
        }
    }
    extractObjectPropertySymbol(node, symbols, sourceFile) {
        if (babel.isIdentifier(node.key)) {
            const symbol = this.createSymbolFromNode(node, node.key.name, SymbolType.Variable, sourceFile);
            symbols.push(symbol);
        }
    }
    createSymbolFromNode(node, name, type, sourceFile, options = {}) {
        const range = this.getNodeRange(node);
        const location = { filePath: sourceFile, range };
        const baseSymbol = createSymbol(name, type, location, undefined, []);
        return {
            ...baseSymbol,
            babelNode: node,
            isImported: options.isImported,
            isExported: options.isExported
        };
    }
    extractImportDependency(node, dependencies, sourceFile) {
        const target = node.source.value;
        const range = this.getNodeRange(node);
        const location = { filePath: sourceFile, range };
        const dependency = createDependency(target, DependencyType.Import, isRelativePath(target), getImportedSymbols(node));
        dependencies.push(dependency);
    }
    extractExportDependency(node, dependencies, sourceFile) {
        if (node.source) {
            const target = node.source.value;
            const range = this.getNodeRange(node);
            const location = { filePath: sourceFile, range };
            const dependency = createDependency(target, DependencyType.Import, isRelativePath(target), []);
            dependencies.push(dependency);
        }
    }
    extractCallExpressionDependency(node, dependencies, sourceFile) {
        // 處理 require() 呼叫
        if (babel.isIdentifier(node.callee) && node.callee.name === 'require') {
            const firstArg = node.arguments[0];
            if (babel.isStringLiteral(firstArg)) {
                const target = firstArg.value;
                const range = this.getNodeRange(node);
                const location = { filePath: sourceFile, range };
                const dependency = createDependency(target, DependencyType.Require, isRelativePath(target), []);
                dependencies.push(dependency);
            }
        }
        // 處理動態 import()
        if (babel.isImport(node.callee)) {
            const firstArg = node.arguments[0];
            if (babel.isStringLiteral(firstArg)) {
                const target = firstArg.value;
                const range = this.getNodeRange(node);
                const location = { filePath: sourceFile, range };
                const dependency = createDependency(target, DependencyType.Import, isRelativePath(target), []);
                dependencies.push(dependency);
            }
        }
    }
    isReferenceToSymbol(path, // Babel traverse path
    symbol) {
        // 簡化實作：檢查名稱是否相同且在合理的作用域內
        const node = path.node;
        if (!babel.isIdentifier(node)) {
            return false;
        }
        if (node.name !== symbol.name) {
            return false;
        }
        // 基本的作用域檢查
        // 這裡可以擴展更複雜的作用域分析
        return true;
    }
    getReferenceType(path, // Babel traverse path
    symbol) {
        const node = path.node;
        // 如果是符號的原始定義位置
        if (node === symbol.babelNode) {
            return ReferenceType.Definition;
        }
        // 檢查是否為宣告上下文
        if (path.isReferencedIdentifier()) {
            return ReferenceType.Usage;
        }
        if (path.isBindingIdentifier()) {
            return ReferenceType.Declaration;
        }
        return ReferenceType.Usage;
    }
    symbolTypeToDefinitionKind(symbolType) {
        switch (symbolType) {
            case SymbolType.Class:
                return 'class';
            case SymbolType.Function:
                return 'function';
            case SymbolType.Variable:
                return 'variable';
            case SymbolType.Constant:
                return 'constant';
            case SymbolType.Type:
                return 'type';
            case SymbolType.Interface:
                return 'interface';
            case SymbolType.Enum:
                return 'enum';
            case SymbolType.Module:
                return 'module';
            case SymbolType.Namespace:
                return 'namespace';
            default:
                return 'variable';
        }
    }
    async findSymbolAtPosition(ast, position) {
        const symbols = await this.extractSymbols(ast);
        // 查找包含該位置的符號
        for (const symbol of symbols) {
            if (this.isPositionInRange(position, symbol.location.range)) {
                return symbol;
            }
        }
        return null;
    }
    isPositionInRange(position, range) {
        if (position.line < range.start.line || position.line > range.end.line) {
            return false;
        }
        if (position.line === range.start.line && position.column < range.start.column) {
            return false;
        }
        if (position.line === range.end.line && position.column > range.end.column) {
            return false;
        }
        return true;
    }
}
//# sourceMappingURL=parser.js.map