/**
 * 提取函式重構器
 * 將選取的程式碼片段提取為獨立函式
 */
/**
 * 函式提取分析器
 * 分析選取的程式碼是否適合提取為函式
 */
export class ExtractionAnalyzer {
    /**
     * 分析程式碼片段的可提取性
     */
    analyze(code, selection) {
        const issues = [];
        const variables = [];
        const dependencies = [];
        // 基本驗證
        if (!code || code.trim().length === 0) {
            issues.push('選取的程式碼為空');
            return { canExtract: false, issues, variables, dependencies };
        }
        // 解析 AST
        const ast = this.parseCode(code);
        if (!ast) {
            issues.push('程式碼解析失敗');
            return { canExtract: false, issues, variables, dependencies };
        }
        // 分析變數使用
        const variableAnalysis = this.analyzeVariables(ast);
        variables.push(...variableAnalysis.variables);
        // 檢查提取限制
        this.checkExtractionConstraints(ast, selection, issues);
        // 分析依賴
        dependencies.push(...this.findDependencies(ast));
        return {
            canExtract: issues.length === 0,
            issues,
            variables,
            dependencies
        };
    }
    /**
     * 檢查提取限制
     */
    checkExtractionConstraints(ast, selection, issues) {
        // 檢查是否包含 return 語句
        const hasReturn = this.containsReturn(ast);
        // 檢查是否包含 break/continue
        if (this.containsJumpStatement(ast)) {
            issues.push('選取範圍包含 break 或 continue 語句');
        }
        // 檢查是否跨越語句邊界
        if (!this.isCompleteStatements(ast)) {
            issues.push('選取範圍不是完整的語句');
        }
        // 檢查巢狀函式定義
        if (this.containsFunctionDefinition(ast)) {
            issues.push('選取範圍包含函式定義');
        }
        // 檢查外部變數修改
        if (ast.code) {
            // 尋找所有變數賦值
            const assignmentPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
            const assignments = [];
            let match;
            // 先找出所有宣告的變數
            const declaredVars = new Set();
            const declarationPattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
            while ((match = declarationPattern.exec(ast.code)) !== null) {
                declaredVars.add(match[1]);
            }
            // 然後找出所有賦值
            assignmentPattern.lastIndex = 0; // 重置正則表達式
            const uniqueAssignments = new Set();
            while ((match = assignmentPattern.exec(ast.code)) !== null) {
                const varName = match[1];
                // 檢查是否為外部變數（沒有在程式碼中宣告）
                if (!declaredVars.has(varName) &&
                    !['return', 'function', 'if', 'else', 'for', 'while'].includes(varName)) {
                    // 確認這不是變數宣告的一部分
                    const position = match.index || 0;
                    const beforeAssignment = ast.code.substring(Math.max(0, position - 10), position);
                    if (!/(?:const|let|var)\s+$/.test(beforeAssignment)) {
                        uniqueAssignments.add(varName); // 使用 Set 來避免重複
                    }
                }
            }
            // 如果有多個不同的外部變數修改，不能提取
            const uniqueCount = uniqueAssignments.size;
            if (uniqueCount > 1) {
                issues.push('無法提取：函式有多個返回值');
            }
            else if (uniqueCount === 1 && hasReturn) {
                // 特殊情況：如果外部變數最後被 return，是允許的
                const assignedVar = Array.from(uniqueAssignments)[0];
                const returnPattern = new RegExp(`return\\s+${assignedVar}\\s*;?\\s*$`);
                if (!returnPattern.test(ast.code)) {
                    // 只有當 return 的不是同一個變數時才拒絕
                    issues.push('無法提取：混合了返回語句和外部變數修改');
                }
            }
        }
    }
    /**
     * 分析變數使用情況
     */
    analyzeVariables(ast) {
        const variables = [];
        const definedVars = new Set();
        const usedVars = new Set();
        // 簡化實作：使用正規表達式解析變數
        if (ast.code) {
            // 找出程式碼中的變數使用
            const variableMatches = ast.code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
            // 過濾出真正的變數（排除關鍵字）
            const keywords = new Set(['if', 'else', 'for', 'while', 'do', 'break', 'continue',
                'function', 'return', 'var', 'let', 'const', 'true', 'false', 'null',
                'undefined', 'new', 'this', 'typeof', 'instanceof', 'console', 'log',
                'map', 'filter', 'reduce', 'forEach', 'length', 'push', 'pop', 'item', 'i']);
            for (const match of variableMatches) {
                if (!keywords.has(match) && !definedVars.has(match)) {
                    usedVars.add(match);
                }
            }
            // 檢查本地定義的變數
            const localDeclarations = ast.code.match(/(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g) || [];
            for (const decl of localDeclarations) {
                const varName = decl.replace(/(?:let|const|var)\s+/, '');
                definedVars.add(varName);
                usedVars.delete(varName); // 移除本地定義的變數
            }
            // 檢查函式參數
            const functionParams = ast.code.match(/function\s*\w*\s*\(([^)]*)\)/);
            if (functionParams && functionParams[1]) {
                const params = functionParams[1].split(',').map(p => p.trim().replace(/:\s*\w+/, ''));
                for (const param of params) {
                    if (param) {
                        definedVars.add(param);
                        usedVars.delete(param);
                    }
                }
            }
        }
        // 建立變數資訊
        for (const varName of usedVars) {
            variables.push({
                name: varName,
                type: 'any', // 簡化實作
                isParameter: true,
                isReturned: false,
                scope: 'closure',
                usages: []
            });
        }
        return { variables };
    }
    /**
     * 簡化的 AST 解析
     */
    parseCode(code) {
        try {
            // 簡化實作：建立模擬 AST，包含程式碼內容
            return {
                type: 'Program',
                start: 0,
                end: code.length,
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: code.split('\n').length, column: 0 }
                },
                children: [],
                code // 添加程式碼內容以便分析
            };
        }
        catch (error) {
            return null;
        }
    }
    /**
     * 遍歷 AST
     */
    traverse(node, visitor) {
        visitor(node);
        if (node.children) {
            for (const child of node.children) {
                this.traverse(child, visitor);
            }
        }
    }
    /**
     * 檢查是否包含 return 語句
     */
    containsReturn(ast) {
        let hasReturn = false;
        this.traverse(ast, (node) => {
            if (node.type === 'ReturnStatement') {
                hasReturn = true;
            }
        });
        return hasReturn;
    }
    /**
     * 檢查是否包含跳躍語句
     */
    containsJumpStatement(ast) {
        let hasJump = false;
        this.traverse(ast, (node) => {
            if (node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
                hasJump = true;
            }
        });
        return hasJump;
    }
    /**
     * 檢查是否為完整語句
     */
    isCompleteStatements(ast) {
        // 簡化實作：假設總是完整的
        return true;
    }
    /**
     * 檢查是否包含函式定義
     */
    containsFunctionDefinition(ast) {
        let hasFunction = false;
        this.traverse(ast, (node) => {
            if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                hasFunction = true;
            }
        });
        return hasFunction;
    }
    /**
     * 找出依賴項
     */
    findDependencies(ast) {
        const dependencies = [];
        // 簡化實作
        return dependencies;
    }
}
/**
 * 函式提取器主類
 */
export class FunctionExtractor {
    analyzer = new ExtractionAnalyzer();
    /**
     * 提取函式 (別名，保持向後相容)
     * 支援兩種呼叫方式：
     * 1. extractFunction(code, selection, config)
     * 2. extractFunction(code, start, end, name) - 舊格式
     */
    async extractFunction(code, selectionOrStart, configOrEnd, nameOrUndefined) {
        // 檢查是否為舊格式呼叫 (4 個參數)
        if (typeof selectionOrStart === 'number' && typeof configOrEnd === 'number') {
            // 將行號轉換為 Range 格式
            const startLine = selectionOrStart;
            const endLine = configOrEnd;
            const selection = {
                start: { line: startLine, column: 0 },
                end: { line: endLine, column: 0 }
            };
            const config = {
                functionName: nameOrUndefined,
                generateComments: true,
                preserveFormatting: true,
                validateExtraction: true
            };
            return this.extract(code, selection, config);
        }
        // 新格式呼叫
        return this.extract(code, selectionOrStart, configOrEnd);
    }
    /**
     * 提取函式
     */
    async extract(code, selection, config = {
        generateComments: true,
        preserveFormatting: true,
        validateExtraction: true,
        insertionPoint: 'before'
    }) {
        // 輸入驗證
        if (typeof code !== 'string') {
            throw new Error('程式碼必須是字串');
        }
        if (!selection || !this.isValidRange(selection)) {
            throw new Error('選取範圍無效');
        }
        // 分析可提取性
        const analysis = this.analyzer.analyze(code, selection);
        if (!analysis.canExtract) {
            return {
                success: false,
                functionName: '',
                edits: [],
                parameters: [],
                errors: analysis.issues,
                warnings: []
            };
        }
        // 提取選取的程式碼
        const selectedCode = this.extractSelectedCode(code, selection);
        // 產生函式名稱
        const functionName = config.functionName || this.generateFunctionName(selectedCode);
        // 產生函式程式碼
        const functionCode = this.generateFunction(functionName, selectedCode, analysis.variables, config);
        // 產生編輯操作
        const edits = this.generateEdits(code, selection, functionName, functionCode, analysis.variables);
        return {
            success: true,
            functionName,
            edits,
            parameters: analysis.variables,
            errors: [],
            warnings: []
        };
    }
    /**
     * 驗證範圍格式
     */
    isValidRange(range) {
        return range.start && range.end &&
            typeof range.start.line === 'number' &&
            typeof range.start.column === 'number' &&
            typeof range.end.line === 'number' &&
            typeof range.end.column === 'number' &&
            (range.start.line < range.end.line ||
                (range.start.line === range.end.line && range.start.column < range.end.column));
    }
    /**
     * 提取選取的程式碼
     */
    extractSelectedCode(code, selection) {
        const lines = code.split('\n');
        const selectedLines = [];
        for (let i = selection.start.line - 1; i < selection.end.line; i++) {
            if (i < 0 || i >= lines.length) {
                continue;
            }
            let line = lines[i];
            // 處理開始行
            if (i === selection.start.line - 1) {
                line = line.substring(selection.start.column);
            }
            // 處理結束行
            if (i === selection.end.line - 1) {
                line = line.substring(0, selection.end.column - (i === selection.start.line - 1 ? selection.start.column : 0));
            }
            selectedLines.push(line);
        }
        return selectedLines.join('\n');
    }
    /**
     * 產生函式名稱
     */
    generateFunctionName(code) {
        // 簡單的函式名稱生成邏輯
        const words = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
        const uniqueWords = [...new Set(words)].filter(word => !['const', 'let', 'var', 'if', 'else', 'for', 'while', 'function', 'return'].includes(word));
        if (uniqueWords.length > 0) {
            return `extracted${uniqueWords[0].charAt(0).toUpperCase()}${uniqueWords[0].slice(1)}`;
        }
        return 'extractedFunction';
    }
    /**
     * 產生函式程式碼
     */
    generateFunction(functionName, code, parameters, config) {
        // 生成帶型別的參數列表
        const params = parameters
            .filter(p => p.isParameter)
            .map(p => `${p.name}: ${p.type}`)
            .join(', ');
        const returnVars = parameters.filter(p => p.isReturned);
        const returnStatement = returnVars.length > 0
            ? `\n  return ${returnVars.map(v => v.name).join(', ')};`
            : '';
        // 推導返回型別
        const hasReturn = code.includes('return') || returnVars.length > 0;
        const returnType = hasReturn ? ': any' : ': any';
        const comment = config.generateComments
            ? `/**\n * 提取的函式\n * @param ${params.split(', ').map(p => `${p.split(':')[0]} 參數`).join('\n * @param ')}\n */\n`
            : '';
        // 縮排程式碼
        const indentedCode = code.split('\n').map(line => `  ${line}`).join('\n');
        return `${comment}function ${functionName}(${params})${returnType} {${indentedCode}${returnStatement}\n}`;
    }
    /**
     * 產生編輯操作
     */
    generateEdits(originalCode, selection, functionName, functionCode, parameters) {
        const edits = [];
        // 1. 替換選取的程式碼為函式呼叫
        const callParams = parameters
            .filter(p => p.isParameter)
            .map(p => p.name)
            .join(', ');
        const returnVars = parameters.filter(p => p.isReturned);
        const assignment = returnVars.length > 0
            ? `${returnVars.map(v => v.name).join(', ')} = `
            : '';
        const functionCall = `${assignment}${functionName}(${callParams});`;
        edits.push({
            range: selection,
            newText: functionCall,
            type: 'replace'
        });
        // 2. 插入函式定義
        // 簡化實作：在檔案開頭插入
        edits.push({
            range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            newText: functionCode + '\n\n',
            type: 'insert'
        });
        return edits;
    }
    /**
     * 批次提取
     */
    async extractMultiple(extractions) {
        const results = await Promise.all(extractions.map(({ code, selection, config }) => this.extract(code, selection, config)));
        return results;
    }
    /**
     * 預覽提取結果
     */
    async preview(code, selection, config) {
        const result = await this.extract(code, selection, config);
        if (!result.success) {
            throw new Error(`提取預覽失敗: ${result.errors.join(', ')}`);
        }
        // 應用編輯操作
        let modifiedCode = code;
        for (const edit of result.edits.reverse()) { // 反向應用避免位置偏移
            modifiedCode = this.applyEdit(modifiedCode, edit);
        }
        return {
            originalCode: code,
            modifiedCode,
            functionCode: result.edits.find(edit => edit.type === 'insert')?.newText || ''
        };
    }
    /**
     * 應用編輯操作
     */
    applyEdit(code, edit) {
        const lines = code.split('\n');
        switch (edit.type) {
            case 'replace':
                // 簡化實作
                return code.substring(0, this.rangeToOffset(code, edit.range.start)) +
                    edit.newText +
                    code.substring(this.rangeToOffset(code, edit.range.end));
            case 'insert':
                const offset = this.rangeToOffset(code, edit.range.start);
                return code.substring(0, offset) + edit.newText + code.substring(offset);
            case 'delete':
                return code.substring(0, this.rangeToOffset(code, edit.range.start)) +
                    code.substring(this.rangeToOffset(code, edit.range.end));
            default:
                return code;
        }
    }
    /**
     * 將範圍轉換為偏移量
     */
    rangeToOffset(code, position) {
        const lines = code.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for newline
        }
        offset += position.column;
        return Math.min(offset, code.length);
    }
}
//# sourceMappingURL=extract-function.js.map