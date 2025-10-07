/**
 * TypeScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */
import * as ts from 'typescript';
import { createValidationSuccess, createValidationFailure, createCodeEdit, createDefinition, createUsage } from '../../infrastructure/parser/index.js';
import { createAST, createASTMetadata, ReferenceType, SymbolType } from '../../shared/types/index.js';
import { DEFAULT_COMPILER_OPTIONS, TypeScriptParseError, createTypeScriptASTNode, createParseError, tsPositionToPosition, positionToTsPosition, tsNodeToRange, isValidIdentifier } from './types.js';
import { createSymbolExtractor } from './symbol-extractor.js';
import { createDependencyAnalyzer } from './dependency-analyzer.js';
import { MemoryMonitor } from '../../shared/utils/memory-monitor.js';
/**
 * TypeScript Parser 實作
 */
export class TypeScriptParser {
    name = 'typescript';
    version = '1.0.0';
    supportedExtensions = ['.ts', '.tsx', '.d.ts'];
    supportedLanguages = ['typescript', 'tsx'];
    symbolExtractor;
    dependencyAnalyzer;
    compilerOptions;
    languageService = null;
    languageServiceHost = null;
    files = new Map();
    constructor(compilerOptions) {
        this.symbolExtractor = createSymbolExtractor();
        this.dependencyAnalyzer = createDependencyAnalyzer();
        this.compilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ...compilerOptions };
        // 註冊到記憶體監控器
        MemoryMonitor.getInstance().register(this);
    }
    /**
     * 解析 TypeScript 程式碼
     */
    async parse(code, filePath) {
        this.validateInput(code, filePath);
        let program = null;
        try {
            // 使用 TypeScript Compiler API 解析程式碼
            const sourceFile = ts.createSourceFile(filePath, code, this.compilerOptions.target || ts.ScriptTarget.ES2020, true, // setParentNodes
            this.getScriptKind(filePath));
            // 檢查語法錯誤 - 使用 TypeScript Program 來檢查語法錯誤
            program = ts.createProgram([filePath], this.compilerOptions, {
                getSourceFile: (fileName) => fileName === filePath ? sourceFile : undefined,
                writeFile: () => { },
                getCurrentDirectory: () => process.cwd(),
                getDirectories: () => [],
                fileExists: () => true,
                readFile: () => code,
                getCanonicalFileName: (fileName) => fileName,
                useCaseSensitiveFileNames: () => true,
                getNewLine: () => '\n',
                getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options)
            });
            // 獲取語法診斷，但不拋出錯誤（TypeScript 能從語法錯誤中恢復）
            const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);
            // 建立我們的 AST 結構
            const rootNode = createTypeScriptASTNode(sourceFile, sourceFile);
            const metadata = createASTMetadata(this.getLanguageFromFilePath(filePath), this.version, { compilerOptions: this.compilerOptions }, Date.now(), 0 // 會在 createAST 中計算
            );
            const baseAST = createAST(filePath, rootNode, metadata);
            const ast = {
                ...baseAST,
                root: rootNode,
                tsSourceFile: sourceFile,
                diagnostics: [...syntacticDiagnostics]
            };
            // 立即清理 Program 以避免記憶體洩漏
            program = null;
            return ast;
        }
        catch (error) {
            // 確保在錯誤情況下也清理 Program
            program = null;
            if (error instanceof TypeScriptParseError) {
                throw error;
            }
            throw createParseError(`解析失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            // 最終清理，確保 Program 被釋放
            if (program) {
                program = null;
            }
            // 觸發垃圾回收（如果可用）
            if (typeof global !== 'undefined' && 'gc' in global && typeof global.gc === 'function') {
                global.gc();
            }
        }
    }
    /**
     * 提取符號
     */
    async extractSymbols(ast) {
        const typedAst = ast;
        return await this.symbolExtractor.extractSymbols(typedAst);
    }
    /**
     * 查找符號引用
     */
    async findReferences(ast, symbol) {
        const typedAst = ast;
        const typedSymbol = symbol;
        // 確保 Language Service 已初始化
        this.ensureLanguageServiceInitialized(typedAst.tsSourceFile);
        if (!this.languageService) {
            // 如果無法使用 Language Service，回退到原始方法
            return this.findReferencesBasic(ast, symbol);
        }
        const fileName = typedAst.tsSourceFile.fileName;
        // 取得符號位置
        const symbolPosition = this.getSymbolPosition(typedSymbol, typedAst.tsSourceFile);
        if (symbolPosition === undefined) {
            return [];
        }
        // 使用 Language Service 查找引用
        const referencesResult = this.languageService.findReferences(fileName, symbolPosition);
        if (!referencesResult) {
            return [];
        }
        const references = [];
        for (const refSymbol of referencesResult) {
            for (const ref of refSymbol.references) {
                const sourceFile = this.getSourceFileFromFileName(ref.fileName);
                if (!sourceFile) {
                    continue;
                }
                const range = {
                    start: tsPositionToPosition(sourceFile, ref.textSpan.start),
                    end: tsPositionToPosition(sourceFile, ref.textSpan.start + ref.textSpan.length)
                };
                const refType = ref.isDefinition
                    ? ReferenceType.Definition
                    : ReferenceType.Usage;
                references.push({
                    symbol,
                    location: {
                        filePath: ref.fileName,
                        range
                    },
                    type: refType
                });
            }
        }
        return references;
    }
    /**
     * 基本的符號引用查找（回退方法）
     */
    async findReferencesBasic(ast, symbol) {
        const typedAst = ast;
        const typedSymbol = symbol;
        const references = [];
        const symbolName = typedSymbol.name;
        // 獲取符號的標識符節點
        const symbolIdentifier = this.getIdentifierFromSymbolNode(typedSymbol.tsNode);
        if (!symbolIdentifier) {
            return references;
        }
        // 使用 TypeScript 原生的節點遍歷，收集所有標識符
        const collectIdentifiers = (node) => {
            if (ts.isIdentifier(node) && node.text === symbolName) {
                // 檢查這個標識符是否真的引用了我們的符號
                if (this.isReferenceToSymbol(node, typedSymbol)) {
                    const location = {
                        filePath: typedAst.tsSourceFile.fileName,
                        range: tsNodeToRange(node, typedAst.tsSourceFile)
                    };
                    const referenceType = this.getReferenceType(node, typedSymbol);
                    references.push({
                        symbol,
                        location,
                        type: referenceType
                    });
                }
            }
            // 遞歸處理所有子節點
            ts.forEachChild(node, collectIdentifiers);
        };
        // 從 SourceFile 開始遍歷
        collectIdentifiers(typedAst.tsSourceFile);
        return references;
    }
    /**
     * 提取依賴關係
     */
    async extractDependencies(ast) {
        const typedAst = ast;
        return await this.dependencyAnalyzer.extractDependencies(typedAst);
    }
    /**
     * 重新命名符號
     */
    async rename(ast, position, newName) {
        this.validateRenameInput(newName);
        const typedAst = ast;
        const tsPosition = positionToTsPosition(typedAst.tsSourceFile, position);
        // 查找位置上的節點
        const node = this.findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
        if (!node) {
            throw new Error('在指定位置找不到符號');
        }
        // 確保節點是標識符或可重新命名的宣告
        let targetIdentifier = null;
        if (ts.isIdentifier(node)) {
            targetIdentifier = node;
        }
        else if (this.isRenameableNode(node)) {
            targetIdentifier = this.getIdentifierFromSymbolNode(node);
        }
        if (!targetIdentifier) {
            throw new Error('該位置的符號不支援重新命名');
        }
        // 驗證位置確實在標識符上
        const identifierStart = targetIdentifier.getStart(typedAst.tsSourceFile);
        const identifierEnd = targetIdentifier.getEnd();
        if (tsPosition < identifierStart || tsPosition >= identifierEnd) {
            throw new Error('指定位置不在有效的符號標識符上');
        }
        // 查找所有引用
        const symbol = await this.findSymbolAtPosition(typedAst, position);
        if (!symbol) {
            throw new Error('無法找到符號定義');
        }
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
        const tsPosition = positionToTsPosition(typedAst.tsSourceFile, position);
        const node = this.findNodeAtPosition(typedAst.tsSourceFile, tsPosition);
        if (!node) {
            return null;
        }
        // 檢查節點是否有效
        if (!node.kind) {
            return null;
        }
        // 如果當前節點本身就是定義，返回它
        if (this.isDefinitionNode(node)) {
            const location = {
                filePath: typedAst.tsSourceFile.fileName,
                range: tsNodeToRange(node, typedAst.tsSourceFile)
            };
            return createDefinition(location, this.getDefinitionKind(node));
        }
        // 如果是標識符，查找它的定義
        if (ts.isIdentifier(node)) {
            const name = node.text;
            const symbols = await this.extractSymbols(ast);
            // 查找匹配名稱的符號定義
            for (const symbol of symbols) {
                if (symbol.name === name) {
                    // 直接返回符號的定義位置（不需要檢查 isReferenceToSymbol，因為我們是在查找定義）
                    return createDefinition(symbol.location, this.symbolTypeToDefinitionKind(symbol.type));
                }
            }
        }
        // 查找符號的定義
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
            .map(ref => createUsage(ref.location, this.getReferenceUsageKind(ref)));
    }
    /**
     * 驗證插件狀態
     */
    async validate() {
        try {
            // 檢查 TypeScript 編譯器是否可用
            const version = ts.version;
            if (!version) {
                return createValidationFailure([{
                        code: 'TS_UNAVAILABLE',
                        message: 'TypeScript 編譯器不可用',
                        location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
                    }]);
            }
            // 檢查編譯器選項
            const diagnostics = ts.getConfigFileParsingDiagnostics({
                options: this.compilerOptions,
                errors: []
            });
            if (diagnostics.length > 0) {
                return createValidationFailure([{
                        code: 'TS_CONFIG_ERROR',
                        message: '編譯器選項配置錯誤',
                        location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
                    }]);
            }
            return createValidationSuccess();
        }
        catch (error) {
            return createValidationFailure([{
                    code: 'TS_VALIDATION_ERROR',
                    message: `驗證失敗: ${error instanceof Error ? error.message : String(error)}`,
                    location: { filePath: '', range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } } }
                }]);
        }
    }
    /**
     * 清理資源
     */
    async dispose() {
        // 從記憶體監控器取消註冊
        MemoryMonitor.getInstance().unregister(this);
        // 清理 Language Service 和相關資源
        if (this.languageService) {
            this.languageService.dispose();
            this.languageService = null;
        }
        // 清理 Language Service Host
        this.languageServiceHost = null;
        // 清理檔案快取
        this.files.clear();
        // 清理編譯器選項參考（完全清空而非設為空物件）
        this.compilerOptions = null;
        // 清理符號提取器和依賴分析器（如果有 dispose 方法）
        if (this.symbolExtractor && 'dispose' in this.symbolExtractor && typeof this.symbolExtractor.dispose === 'function') {
            await this.symbolExtractor.dispose();
        }
        if (this.dependencyAnalyzer && 'dispose' in this.dependencyAnalyzer && typeof this.dependencyAnalyzer.dispose === 'function') {
            await this.dependencyAnalyzer.dispose();
        }
        // 清理其他參考
        this.symbolExtractor = null;
        this.dependencyAnalyzer = null;
        // 多次觸發垃圾收集以確保記憶體完全釋放
        if (typeof global !== 'undefined' && 'gc' in global && typeof global.gc === 'function') {
            // 進行多次垃圾回收以確保釋放所有 TypeScript 相關資源
            for (let i = 0; i < 3; i++) {
                global.gc();
            }
        }
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
            throw new Error('新名稱必須是有效的 TypeScript 識別符');
        }
    }
    getScriptKind(filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        switch (ext) {
            case '.tsx':
                return ts.ScriptKind.TSX;
            case '.d.ts':
                return ts.ScriptKind.TS;
            case '.ts':
            default:
                return ts.ScriptKind.TS;
        }
    }
    getLanguageFromFilePath(filePath) {
        const ext = filePath.substring(filePath.lastIndexOf('.'));
        return ext === '.tsx' ? 'tsx' : 'typescript';
    }
    getSyntacticDiagnostics(sourceFile) {
        // 對於獨立的 SourceFile，我們跳過語法診斷檢查
        // 在實際專案中，這通常由 Program 提供
        return [];
    }
    findNodeAtPosition(sourceFile, position) {
        function findNode(node) {
            if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
                // 先檢查子節點
                for (const child of node.getChildren(sourceFile)) {
                    const result = findNode(child);
                    if (result) {
                        return result;
                    }
                }
                // 如果子節點中沒找到，返回當前節點
                return node;
            }
            return undefined;
        }
        return findNode(sourceFile);
    }
    isReferenceToSymbol(node, symbol) {
        if (!ts.isIdentifier(node)) {
            return false;
        }
        const name = node.text;
        if (name !== symbol.name) {
            return false;
        }
        // 找到符號的標識符節點
        const symbolIdentifier = this.getIdentifierFromSymbolNode(symbol.tsNode);
        if (!symbolIdentifier) {
            return false;
        }
        // 檢查是否為相同符號的引用
        // 1. 如果是符號的定義位置本身
        if (node === symbolIdentifier) {
            return true;
        }
        // 2. 對於型別宣告（類別、介面、型別別名等），檢查是否在型別位置使用
        if (ts.isClassDeclaration(symbol.tsNode) ||
            ts.isInterfaceDeclaration(symbol.tsNode) ||
            ts.isTypeAliasDeclaration(symbol.tsNode) ||
            ts.isEnumDeclaration(symbol.tsNode)) {
            // 對於型別，只要名稱相同就是引用（在同一個檔案中）
            if (node.getSourceFile() === symbolIdentifier.getSourceFile()) {
                return true;
            }
        }
        // 3. 對於變數、函式和方法，使用作用域檢查
        const symbolScope = this.getScopeContainer(symbolIdentifier);
        const nodeScope = this.getScopeContainer(node);
        // 檢查是否在相同作用域或符號的子作用域內
        if (nodeScope === symbolScope || this.isInScopeChain(node, symbolScope)) {
            // 檢查是否被遮蔽（同名變數在更內層作用域）
            if (!this.isShadowed(node, symbolIdentifier)) {
                return true;
            }
        }
        return false;
    }
    getIdentifierFromSymbolNode(node) {
        // 如果本身就是 Identifier，直接返回
        if (ts.isIdentifier(node)) {
            return node;
        }
        // 對於變數宣告，標識符在 name 屬性中
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於函式宣告，標識符在 name 屬性中
        if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於類別宣告
        if (ts.isClassDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於方法宣告
        if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於屬性宣告
        if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於參數
        if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於介面宣告
        if (ts.isInterfaceDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於型別別名宣告
        if (ts.isTypeAliasDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於列舉宣告
        if (ts.isEnumDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於命名空間宣告
        if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於 Get/Set 存取器
        if ((ts.isGetAccessor(node) || ts.isSetAccessor(node)) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於型別參數（泛型）
        if (ts.isTypeParameterDeclaration(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於介面/型別的屬性簽名
        if (ts.isPropertySignature(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        // 對於方法簽名
        if (ts.isMethodSignature(node) && ts.isIdentifier(node.name)) {
            return node.name;
        }
        return null;
    }
    getNodeScope(node) {
        let current = node.parent;
        while (current) {
            if (ts.isFunctionDeclaration(current) ||
                ts.isMethodDeclaration(current) ||
                ts.isArrowFunction(current) ||
                ts.isFunctionExpression(current)) {
                return `function_${current.pos}_${current.end}`;
            }
            if (ts.isBlock(current) && current.parent &&
                (ts.isIfStatement(current.parent) ||
                    ts.isForStatement(current.parent) ||
                    ts.isWhileStatement(current.parent))) {
                return `block_${current.pos}_${current.end}`;
            }
            current = current.parent;
        }
        return 'global';
    }
    isInSameScope(node, symbolNode) {
        // 找到符號定義所在的作用域
        let symbolScope = symbolNode.parent;
        while (symbolScope && !this.isScopeNode(symbolScope)) {
            symbolScope = symbolScope.parent;
        }
        // 檢查節點是否在該作用域內
        let currentScope = node.parent;
        while (currentScope) {
            if (currentScope === symbolScope) {
                return true;
            }
            currentScope = currentScope.parent;
        }
        return false;
    }
    isScopeNode(node) {
        return ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isArrowFunction(node) ||
            ts.isFunctionExpression(node) ||
            ts.isBlock(node) ||
            ts.isSourceFile(node);
    }
    getReferenceType(node, symbol) {
        // 找到符號的標識符節點
        const symbolIdentifier = this.getIdentifierFromSymbolNode(symbol.tsNode);
        // 如果是符號的原始定義位置
        if (node === symbolIdentifier) {
            return ReferenceType.Definition;
        }
        // 檢查是否為宣告（例如函式參數、變數宣告等）
        if (this.isDeclarationNode(node.parent)) {
            return ReferenceType.Declaration;
        }
        // 否則為使用
        return ReferenceType.Usage;
    }
    isRenameableNode(node) {
        return (ts.isIdentifier(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isVariableDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isPropertyDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node) ||
            ts.isParameter(node) ||
            ts.isGetAccessor(node) ||
            ts.isSetAccessor(node) ||
            ts.isTypeParameterDeclaration(node) ||
            ts.isPropertySignature(node) ||
            ts.isMethodSignature(node));
    }
    isDefinitionNode(node) {
        return (ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isVariableDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isPropertyDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node));
    }
    isDeclarationNode(node) {
        return (ts.isParameter(node) ||
            ts.isVariableDeclaration(node) ||
            ts.isBindingElement(node));
    }
    getDefinitionKind(node) {
        if (ts.isClassDeclaration(node)) {
            return 'class';
        }
        if (ts.isInterfaceDeclaration(node)) {
            return 'interface';
        }
        if (ts.isFunctionDeclaration(node)) {
            return 'function';
        }
        if (ts.isMethodDeclaration(node)) {
            return 'method';
        }
        if (ts.isVariableDeclaration(node)) {
            return 'variable';
        }
        if (ts.isPropertyDeclaration(node)) {
            return 'variable';
        }
        if (ts.isTypeAliasDeclaration(node)) {
            return 'type';
        }
        if (ts.isEnumDeclaration(node)) {
            return 'enum';
        }
        if (ts.isModuleDeclaration(node)) {
            return 'module';
        }
        return 'variable';
    }
    symbolTypeToDefinitionKind(symbolType) {
        // 將 SymbolType 映射到 DefinitionKind
        switch (symbolType) {
            case SymbolType.Class:
                return 'class';
            case SymbolType.Interface:
                return 'interface';
            case SymbolType.Function:
                return 'function';
            case SymbolType.Variable:
                return 'variable';
            case SymbolType.Constant:
                return 'constant';
            case SymbolType.Type:
                return 'type';
            case SymbolType.Enum:
                return 'enum';
            case SymbolType.Module:
                return 'module';
            case SymbolType.Namespace:
                return 'namespace';
            default:
                return 'variable'; // 預設為變數
        }
    }
    getReferenceUsageKind(reference) {
        // 基於上下文判斷使用類型
        return 'reference'; // 簡化實作
    }
    async findSymbolAtPosition(ast, position) {
        const symbols = await this.extractSymbols(ast);
        const tsPosition = positionToTsPosition(ast.tsSourceFile, position);
        // 查找最精確匹配該位置的符號
        let bestMatch = null;
        let bestMatchSize = Number.MAX_SAFE_INTEGER;
        for (const symbol of symbols) {
            const typedSymbol = symbol;
            // 獲取符號的標識符節點
            const identifier = this.getIdentifierFromSymbolNode(typedSymbol.tsNode);
            if (!identifier) {
                continue;
            }
            // 檢查位置是否在標識符範圍內
            const identifierStart = identifier.getStart(ast.tsSourceFile);
            const identifierEnd = identifier.getEnd();
            if (tsPosition >= identifierStart && tsPosition < identifierEnd) {
                // 找到最小的匹配範圍（最精確的符號）
                const size = identifierEnd - identifierStart;
                if (size < bestMatchSize) {
                    bestMatch = symbol;
                    bestMatchSize = size;
                }
            }
        }
        return bestMatch;
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
    /**
     * 初始化 Language Service
     */
    ensureLanguageServiceInitialized(sourceFile) {
        if (this.languageService) {
            // 更新檔案內容
            this.updateFile(sourceFile.fileName, sourceFile.text);
            return;
        }
        // 添加當前檔案到檔案列表
        this.updateFile(sourceFile.fileName, sourceFile.text);
        // 建立 Language Service Host
        this.languageServiceHost = {
            getScriptFileNames: () => {
                const fileNames = Array.from(this.files.keys());
                // 確保包含當前檔案
                if (!fileNames.includes(sourceFile.fileName)) {
                    fileNames.push(sourceFile.fileName);
                }
                return fileNames;
            },
            getScriptVersion: (fileName) => {
                const file = this.files.get(fileName);
                return file ? String(file.version) : '0';
            },
            getScriptSnapshot: (fileName) => {
                const file = this.files.get(fileName);
                if (file) {
                    return ts.ScriptSnapshot.fromString(file.content);
                }
                // 嘗試讀取實際檔案
                try {
                    const content = ts.sys.readFile(fileName);
                    if (content) {
                        return ts.ScriptSnapshot.fromString(content);
                    }
                }
                catch {
                    // 忽略錯誤
                }
                return undefined;
            },
            getCurrentDirectory: () => process.cwd(),
            getCompilationSettings: () => ({
                ...this.compilerOptions,
                // 確保啟用必要的選項
                allowNonTsExtensions: true,
                noResolve: false,
                noLib: false,
                lib: this.compilerOptions.lib || ['lib.es2020.d.ts']
            }),
            getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
            fileExists: (fileName) => {
                return this.files.has(fileName) || (ts.sys.fileExists ? ts.sys.fileExists(fileName) : false);
            },
            readFile: (fileName) => {
                const file = this.files.get(fileName);
                if (file) {
                    return file.content;
                }
                return ts.sys.readFile ? ts.sys.readFile(fileName) : undefined;
            },
            readDirectory: ts.sys.readDirectory ? ts.sys.readDirectory : () => [],
            getDirectories: ts.sys.getDirectories ? ts.sys.getDirectories : () => [],
            directoryExists: ts.sys.directoryExists ? ts.sys.directoryExists : () => false,
            realpath: ts.sys.realpath ? ts.sys.realpath : (path) => path,
            getNewLine: () => '\n'
        };
        // 建立 Language Service
        this.languageService = ts.createLanguageService(this.languageServiceHost, ts.createDocumentRegistry());
    }
    /**
     * 更新檔案內容
     */
    updateFile(fileName, content) {
        const existing = this.files.get(fileName);
        if (existing && existing.content === content) {
            return;
        }
        this.files.set(fileName, {
            version: existing ? existing.version + 1 : 0,
            content
        });
    }
    /**
     * 取得符號在檔案中的位置
     */
    getSymbolPosition(symbol, sourceFile) {
        const identifier = this.getIdentifierFromSymbolNode(symbol.tsNode);
        if (!identifier) {
            return undefined;
        }
        return identifier.getStart(sourceFile);
    }
    /**
     * 根據檔案名稱取得 SourceFile
     */
    getSourceFileFromFileName(fileName) {
        if (!this.languageService) {
            return undefined;
        }
        const program = this.languageService.getProgram();
        return program?.getSourceFile(fileName);
    }
    /**
     * 取得節點的作用域容器
     */
    getScopeContainer(node) {
        let current = node.parent;
        while (current) {
            if (ts.isFunctionDeclaration(current) ||
                ts.isFunctionExpression(current) ||
                ts.isArrowFunction(current) ||
                ts.isMethodDeclaration(current) ||
                ts.isConstructorDeclaration(current) ||
                ts.isBlock(current) ||
                ts.isSourceFile(current)) {
                return current;
            }
            current = current.parent;
        }
        return node.getSourceFile();
    }
    /**
     * 檢查節點是否在指定作用域鏈內
     */
    isInScopeChain(node, scopeContainer) {
        let current = node.parent;
        while (current) {
            if (current === scopeContainer) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }
    /**
     * 檢查符號是否被遮蔽
     */
    isShadowed(node, originalIdentifier) {
        const name = originalIdentifier.text;
        let current = node.parent;
        // 從 node 向上遍歷到 originalIdentifier 的作用域
        while (current && current !== originalIdentifier.parent) {
            // 檢查當前作用域是否有同名的宣告
            if (ts.isFunctionDeclaration(current) ||
                ts.isFunctionExpression(current) ||
                ts.isArrowFunction(current) ||
                ts.isMethodDeclaration(current)) {
                // 檢查參數
                if (current.parameters) {
                    for (const param of current.parameters) {
                        if (ts.isIdentifier(param.name) && param.name.text === name) {
                            return true; // 被參數遮蔽
                        }
                    }
                }
            }
            // 檢查區塊作用域中的宣告
            if (ts.isBlock(current)) {
                for (const statement of current.statements) {
                    if (ts.isVariableStatement(statement)) {
                        for (const decl of statement.declarationList.declarations) {
                            if (ts.isIdentifier(decl.name) && decl.name.text === name) {
                                // 確認這個宣告在 node 之前
                                if (decl.pos < node.pos) {
                                    return true; // 被區域變數遮蔽
                                }
                            }
                        }
                    }
                }
            }
            current = current.parent;
        }
        return false;
    }
}
//# sourceMappingURL=parser.js.map