/**
 * 程式碼品質評估器
 * 提供可維護性指數計算、程式碼異味檢測等功能
 */
/**
 * 可維護性指數計算器
 * 基於 Microsoft Visual Studio 公式
 */
export class MaintainabilityIndex {
    /**
     * 計算可維護性指數
     * @param metrics 程式碼度量
     * @returns 可維護性指數 (0-171)
     */
    calculate(metrics) {
        const { halsteadVolume, cyclomaticComplexity, linesOfCode } = metrics;
        // 防止對數計算錯誤
        const safeLog = (value) => Math.log(Math.max(1, value));
        // Microsoft Visual Studio 公式
        const mi = Math.max(0, 171 -
            5.2 * safeLog(halsteadVolume) -
            0.23 * cyclomaticComplexity -
            16.2 * safeLog(linesOfCode));
        return Math.round(mi * 100) / 100; // 保留兩位小數
    }
    /**
     * 將可維護性指數轉換為等級
     */
    getGrade(maintainabilityIndex) {
        if (maintainabilityIndex >= 85) {
            return 'A';
        }
        if (maintainabilityIndex >= 70) {
            return 'B';
        }
        if (maintainabilityIndex >= 50) {
            return 'C';
        }
        if (maintainabilityIndex >= 25) {
            return 'D';
        }
        return 'F';
    }
    /**
     * 獲取可維護性描述
     */
    getDescription(grade) {
        switch (grade) {
            case 'A': return '優秀 - 易於維護';
            case 'B': return '良好 - 相對易於維護';
            case 'C': return '一般 - 中等維護難度';
            case 'D': return '差 - 維護困難';
            case 'F': return '非常差 - 極難維護';
            default: return '未知等級';
        }
    }
}
/**
 * Halstead 複雜度計算器
 */
export class HalsteadComplexity {
    /**
     * 計算 Halstead 複雜度
     * @param code 程式碼字串
     * @returns Halstead 複雜度指標
     */
    calculate(code) {
        const operators = this.extractOperators(code);
        const operands = this.extractOperands(code);
        const n1 = new Set(operators).size; // 不同運算子數量
        const n2 = new Set(operands).size; // 不同操作數數量
        const N1 = operators.length; // 總運算子數量
        const N2 = operands.length; // 總操作數數量
        const vocabulary = n1 + n2; // 詞彙量
        const length = N1 + N2; // 程式長度
        // Halstead 指標
        const volume = length * Math.log2(Math.max(1, vocabulary));
        const difficulty = (n1 / 2) * (N2 / Math.max(1, n2));
        const effort = difficulty * volume;
        const timeToProgram = effort / 18; // 秒
        const bugsEstimate = volume / 3000;
        return {
            volume: Math.round(volume * 100) / 100,
            difficulty: Math.round(difficulty * 100) / 100,
            effort: Math.round(effort * 100) / 100,
            timeToProgram: Math.round(timeToProgram * 100) / 100,
            bugsEstimate: Math.round(bugsEstimate * 100) / 100
        };
    }
    /**
     * 提取運算子
     */
    extractOperators(code) {
        const operatorPatterns = [
            /\+\+|--|\+=|-=|\*=|\/=|%=|&&|\|\||==|!=|<=|>=|===|!==|<<|>>|>>>/g,
            /[+\-*/%=<>!&|^~?:.,;(){}[\]]/g
        ];
        const operators = [];
        for (const pattern of operatorPatterns) {
            const matches = code.match(pattern);
            if (matches) {
                operators.push(...matches);
            }
        }
        return operators;
    }
    /**
     * 提取操作數
     */
    extractOperands(code) {
        const operands = [];
        // 變數名和函式名
        const identifiers = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
        operands.push(...identifiers);
        // 數字字面值
        const numbers = code.match(/\b\d+(\.\d+)?\b/g) || [];
        operands.push(...numbers);
        // 字串字面值
        const strings = code.match(/(["'`])(?:(?!\1)[^\\]|\\.)*()\1/g) || [];
        operands.push(...strings);
        return operands;
    }
}
/**
 * 程式碼異味檢測器
 */
export class CodeSmellDetector {
    /**
     * 檢測程式碼異味
     * @param code 程式碼字串
     * @param metrics 程式碼度量
     * @returns 程式碼異味列表
     */
    detect(code, metrics) {
        const smells = [];
        // 檢測長方法
        smells.push(...this.detectLongMethod(code, metrics));
        // 檢測大類
        smells.push(...this.detectLargeClass(code, metrics));
        // 檢測長參數列表
        smells.push(...this.detectLongParameterList(code, metrics));
        // 檢測重複程式碼
        smells.push(...this.detectDuplicateCode(code));
        // 檢測複雜條件
        smells.push(...this.detectComplexConditionals(code));
        // 檢測魔術數字
        smells.push(...this.detectMagicNumbers(code));
        return smells;
    }
    /**
     * 檢測長方法
     */
    detectLongMethod(code, metrics) {
        const smells = [];
        const lines = code.split('\n');
        if (metrics.linesOfCode > 50) {
            smells.push({
                type: 'LongMethod',
                location: { line: 1, column: 1 },
                severity: metrics.linesOfCode > 100 ? 'high' : 'medium',
                message: `方法過長：${metrics.linesOfCode} 行`,
                suggestion: '考慮將方法分解為較小的方法'
            });
        }
        return smells;
    }
    /**
     * 檢測大類
     */
    detectLargeClass(code, metrics) {
        const smells = [];
        if (metrics.methodCount > 20 || metrics.fieldCount > 15) {
            smells.push({
                type: 'LargeClass',
                location: { line: 1, column: 1 },
                severity: 'high',
                message: `類別過大：${metrics.methodCount} 個方法，${metrics.fieldCount} 個欄位`,
                suggestion: '考慮將類別分解為多個較小的類別'
            });
        }
        return smells;
    }
    /**
     * 檢測長參數列表
     */
    detectLongParameterList(code, metrics) {
        const smells = [];
        if (metrics.parameterCount > 5) {
            smells.push({
                type: 'LongParameterList',
                location: { line: 1, column: 1 },
                severity: metrics.parameterCount > 8 ? 'high' : 'medium',
                message: `參數列表過長：${metrics.parameterCount} 個參數`,
                suggestion: '考慮使用參數物件或建造者模式'
            });
        }
        return smells;
    }
    /**
     * 檢測重複程式碼
     */
    detectDuplicateCode(code) {
        const smells = [];
        const lines = code.split('\n');
        // 簡化實作：檢測連續重複的行
        for (let i = 0; i < lines.length - 2; i++) {
            const line1 = lines[i].trim();
            const line2 = lines[i + 1].trim();
            const line3 = lines[i + 2].trim();
            if (line1.length > 10 && line1 === line2 && line2 === line3) {
                smells.push({
                    type: 'DuplicateCode',
                    location: { line: i + 1, column: 1 },
                    severity: 'medium',
                    message: '檢測到重複程式碼',
                    suggestion: '提取重複的程式碼為方法'
                });
            }
        }
        return smells;
    }
    /**
     * 檢測複雜條件
     */
    detectComplexConditionals(code) {
        const smells = [];
        const lines = code.split('\n');
        lines.forEach((line, index) => {
            const logicalOperators = (line.match(/&&|\|\|/g) || []).length;
            if (logicalOperators >= 3) {
                smells.push({
                    type: 'ComplexConditional',
                    location: { line: index + 1, column: 1 },
                    severity: logicalOperators >= 5 ? 'high' : 'medium',
                    message: `複雜條件：包含 ${logicalOperators} 個邏輯運算子`,
                    suggestion: '考慮將複雜條件提取為方法'
                });
            }
        });
        return smells;
    }
    /**
     * 檢測魔術數字
     */
    detectMagicNumbers(code) {
        const smells = [];
        const lines = code.split('\n');
        lines.forEach((line, index) => {
            // 檢測數字字面值（排除 0, 1, -1）
            const magicNumbers = line.match(/\b(?!0\b|1\b|-1\b)\d{2,}\b/g);
            if (magicNumbers) {
                smells.push({
                    type: 'MagicNumber',
                    location: { line: index + 1, column: 1 },
                    severity: 'low',
                    message: `魔術數字：${magicNumbers.join(', ')}`,
                    suggestion: '使用命名常數取代魔術數字'
                });
            }
        });
        return smells;
    }
}
/**
 * 程式碼品質評估器主類
 */
export class QualityMetricsAnalyzer {
    maintainabilityIndex = new MaintainabilityIndex();
    halsteadComplexity = new HalsteadComplexity();
    codeSmellDetector = new CodeSmellDetector();
    /**
     * 評估程式碼品質
     * @param code 程式碼字串
     * @returns 品質評估結果
     */
    async assess(code) {
        // 輸入驗證
        if (typeof code !== 'string') {
            throw new Error('程式碼必須是字串類型');
        }
        // 計算程式碼度量
        const metrics = this.calculateMetrics(code);
        // 計算可維護性指數
        const maintainabilityIndex = this.maintainabilityIndex.calculate(metrics);
        const grade = this.maintainabilityIndex.getGrade(maintainabilityIndex);
        // 檢測程式碼異味
        const codeSmells = this.codeSmellDetector.detect(code, metrics);
        // 計算綜合評分
        const overallScore = this.calculateOverallScore(maintainabilityIndex, codeSmells);
        return {
            maintainabilityIndex,
            grade,
            codeSmells,
            metrics,
            overallScore
        };
    }
    /**
     * 計算程式碼度量
     */
    calculateMetrics(code) {
        const lines = code.split('\n');
        const halstead = this.halsteadComplexity.calculate(code);
        // 簡化實作
        const methodCount = (code.match(/function\s+\w+|=>\s*{|\w+\s*\(/g) || []).length;
        const fieldCount = (code.match(/(?:const|let|var)\s+\w+/g) || []).length;
        const parameterCount = this.calculateAverageParameterCount(code);
        return {
            halsteadVolume: halstead.volume,
            cyclomaticComplexity: this.calculateCyclomaticComplexity(code),
            linesOfCode: lines.filter(line => line.trim().length > 0).length,
            methodCount,
            fieldCount,
            parameterCount
        };
    }
    /**
     * 計算循環複雜度
     */
    calculateCyclomaticComplexity(code) {
        const decisionPoints = [
            /\bif\s*\(/g,
            /\belse\s+if\s*\(/g,
            /\bwhile\s*\(/g,
            /\bfor\s*\(/g,
            /\bcase\s+/g,
            /\bcatch\s*\(/g,
            /&&|\|\|/g
        ];
        let complexity = 1; // 基礎路徑
        for (const pattern of decisionPoints) {
            const matches = code.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        }
        return complexity;
    }
    /**
     * 計算平均參數數量
     */
    calculateAverageParameterCount(code) {
        const functionMatches = code.match(/\([^)]*\)/g);
        if (!functionMatches || functionMatches.length === 0) {
            return 0;
        }
        const totalParams = functionMatches.reduce((sum, match) => {
            const params = match.slice(1, -1).split(',').filter(p => p.trim().length > 0);
            return sum + params.length;
        }, 0);
        return Math.round(totalParams / functionMatches.length);
    }
    /**
     * 計算綜合評分
     */
    calculateOverallScore(maintainabilityIndex, codeSmells) {
        let score = maintainabilityIndex;
        // 根據程式碼異味調整評分
        const smellPenalties = {
            high: 10,
            medium: 5,
            low: 2
        };
        for (const smell of codeSmells) {
            score -= smellPenalties[smell.severity];
        }
        return Math.max(0, Math.round(score * 100) / 100);
    }
    /**
     * 批次評估多個檔案
     */
    async assessFiles(files) {
        if (!Array.isArray(files)) {
            throw new Error('檔案列表必須是陣列');
        }
        const results = await Promise.all(files.map(async (file) => {
            try {
                // 實際實作中應該讀取檔案內容
                const code = ''; // 簡化實作
                const assessment = await this.assess(code);
                return { file, assessment };
            }
            catch (error) {
                return {
                    file,
                    assessment: {
                        maintainabilityIndex: 0,
                        grade: 'F',
                        codeSmells: [{
                                type: 'Error',
                                location: { line: 0, column: 0 },
                                severity: 'high',
                                message: `評估失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
                                suggestion: '請檢查檔案格式和內容'
                            }],
                        metrics: {
                            halsteadVolume: 0,
                            cyclomaticComplexity: 0,
                            linesOfCode: 0,
                            methodCount: 0,
                            fieldCount: 0,
                            parameterCount: 0
                        },
                        overallScore: 0
                    }
                };
            }
        }));
        return results;
    }
    /**
     * 獲取專案整體品質報告
     */
    async getProjectReport(files) {
        const results = await this.assessFiles(files);
        let totalMaintainability = 0;
        const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        const smellsByType = {};
        const allSmells = [];
        for (const result of results) {
            const { assessment } = result;
            totalMaintainability += assessment.maintainabilityIndex;
            gradeDistribution[assessment.grade]++;
            for (const smell of assessment.codeSmells) {
                smellsByType[smell.type] = (smellsByType[smell.type] || 0) + 1;
                allSmells.push(smell);
            }
        }
        // 取得最嚴重的問題
        const topIssues = allSmells
            .filter(smell => smell.severity === 'high')
            .slice(0, 10);
        return {
            averageMaintainabilityIndex: results.length > 0 ? totalMaintainability / results.length : 0,
            gradeDistribution,
            totalCodeSmells: allSmells.length,
            smellsByType,
            topIssues
        };
    }
}
//# sourceMappingURL=quality-metrics.js.map