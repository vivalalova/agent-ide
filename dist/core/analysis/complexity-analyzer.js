/**
 * 程式碼複雜度分析器
 * 提供循環複雜度和認知複雜度分析功能
 */
/**
 * 循環複雜度分析器
 * 基於 McCabe 複雜度計算方法
 */
export class CyclomaticComplexityAnalyzer {
    /**
     * 計算循環複雜度
     * @param ast AST 節點
     * @returns 複雜度數值
     */
    calculate(ast) {
        let complexity = 1; // 基礎路徑
        const traverse = (node) => {
            switch (node.type) {
                case 'IfStatement':
                case 'ConditionalExpression':
                case 'ForStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                case 'CatchClause':
                    complexity++;
                    break;
                case 'SwitchCase':
                    if (!node.default) {
                        complexity++;
                    }
                    break;
                case 'LogicalExpression':
                    if (node.operator === '||' || node.operator === '&&') {
                        complexity++;
                    }
                    break;
            }
            // 遍歷子節點
            if (node.children) {
                node.children.forEach(traverse);
            }
        };
        traverse(ast);
        return complexity;
    }
    /**
     * 評估複雜度等級
     * @param complexity 複雜度數值
     * @returns 複雜度等級
     */
    evaluate(complexity) {
        if (complexity <= 5) {
            return 'simple';
        }
        else if (complexity <= 10) {
            return 'moderate';
        }
        else if (complexity <= 20) {
            return 'complex';
        }
        else {
            return 'very-complex';
        }
    }
}
/**
 * 認知複雜度分析器
 * 考慮巢狀深度對程式碼理解難度的影響
 */
export class CognitiveComplexityAnalyzer {
    nestingLevel = 0;
    /**
     * 計算認知複雜度
     * @param ast AST 節點
     * @returns 認知複雜度數值
     */
    calculate(ast) {
        let complexity = 0;
        this.nestingLevel = 0;
        const traverse = (node) => {
            switch (node.type) {
                case 'IfStatement':
                case 'ForStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                    complexity += 1 + this.nestingLevel;
                    this.nestingLevel++;
                    if (node.children) {
                        node.children.forEach(traverse);
                    }
                    this.nestingLevel--;
                    return; // 避免重複遍歷子節點
                case 'CallExpression':
                    if (this.isRecursive(node)) {
                        complexity += 1;
                    }
                    break;
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    this.nestingLevel++;
                    if (node.children) {
                        node.children.forEach(traverse);
                    }
                    this.nestingLevel--;
                    return;
                case 'CatchClause':
                    complexity += 1 + this.nestingLevel;
                    break;
                case 'SwitchStatement':
                    complexity += 1 + this.nestingLevel;
                    this.nestingLevel++;
                    if (node.children) {
                        node.children.forEach(traverse);
                    }
                    this.nestingLevel--;
                    return;
                case 'ConditionalExpression':
                case 'LogicalExpression':
                    if (node.operator === '&&' || node.operator === '||') {
                        complexity += 1;
                    }
                    break;
            }
            // 遍歷子節點
            if (node.children) {
                node.children.forEach(traverse);
            }
        };
        traverse(ast);
        return complexity;
    }
    /**
     * 檢查是否為遞歸調用
     */
    isRecursive(node) {
        // 簡化實作，實際應該檢查調用的函式名稱
        return false;
    }
    /**
     * 評估認知複雜度等級
     */
    evaluate(complexity) {
        if (complexity <= 5) {
            return 'simple';
        }
        else if (complexity <= 10) {
            return 'moderate';
        }
        else if (complexity <= 15) {
            return 'complex';
        }
        else {
            return 'very-complex';
        }
    }
}
/**
 * 綜合複雜度分析器
 * 整合循環複雜度和認知複雜度分析
 */
export class ComplexityAnalyzer {
    cyclomaticAnalyzer = new CyclomaticComplexityAnalyzer();
    cognitiveAnalyzer = new CognitiveComplexityAnalyzer();
    /**
     * 分析程式碼複雜度
     * @param code 程式碼字串
     * @returns 複雜度分析結果
     */
    async analyzeCode(code) {
        // 輸入驗證
        if (typeof code !== 'string') {
            throw new Error('程式碼必須是字串類型');
        }
        if (code.length === 0) {
            return {
                cyclomaticComplexity: 1,
                cognitiveComplexity: 0,
                evaluation: 'simple'
            };
        }
        // 簡化的 AST 生成（實際應該使用真正的 parser）
        const ast = this.parseCodeToAST(code);
        const cyclomaticComplexity = this.cyclomaticAnalyzer.calculate(ast);
        const cognitiveComplexity = this.cognitiveAnalyzer.calculate(ast);
        return {
            cyclomaticComplexity,
            cognitiveComplexity,
            evaluation: this.cyclomaticAnalyzer.evaluate(cyclomaticComplexity)
        };
    }
    /**
     * 簡化的程式碼解析為 AST
     * 實際實作中應該使用完整的 TypeScript 或 JavaScript parser
     */
    parseCodeToAST(code) {
        // 簡化實作：根據程式碼內容建立模擬的 AST
        const children = [];
        // 檢測條件語句
        const ifMatches = code.match(/if\s*\(/g) || [];
        ifMatches.forEach(() => {
            children.push({ type: 'IfStatement', children: [] });
        });
        // 檢測迴圈
        const forMatches = code.match(/for\s*\(/g) || [];
        forMatches.forEach(() => {
            children.push({ type: 'ForStatement', children: [] });
        });
        const whileMatches = code.match(/while\s*\(/g) || [];
        whileMatches.forEach(() => {
            children.push({ type: 'WhileStatement', children: [] });
        });
        // 檢測邏輯運算子
        const logicalMatches = code.match(/(\|\||&&)/g) || [];
        logicalMatches.forEach((operator) => {
            children.push({
                type: 'LogicalExpression',
                operator: operator,
                children: []
            });
        });
        return {
            type: 'Program',
            children
        };
    }
    /**
     * 批次分析多個檔案的複雜度
     */
    async analyzeFiles(files) {
        if (!Array.isArray(files)) {
            throw new Error('檔案列表必須是陣列');
        }
        const results = await Promise.all(files.map(async (file) => {
            try {
                // 實際實作中應該讀取檔案內容
                const code = ''; // 簡化實作
                const complexity = await this.analyzeCode(code);
                return { file, complexity };
            }
            catch (error) {
                return {
                    file,
                    complexity: {
                        cyclomaticComplexity: 0,
                        cognitiveComplexity: 0,
                        evaluation: 'error'
                    }
                };
            }
        }));
        return results;
    }
}
//# sourceMappingURL=complexity-analyzer.js.map