/**
 * Performance Analyzer 實作
 * 提供檔案和專案級別的效能分析功能
 */
import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { PerformanceIssueType } from './interfaces.js';
import { DefaultPerformanceMonitor, measureAsync } from './monitor.js';
import { ParserRegistry } from '../../infrastructure/parser/registry.js';
/**
 * 預設效能分析配置
 */
export const DEFAULT_PERFORMANCE_CONFIG = {
    largeFileThreshold: 50000, // 50KB
    longFunctionThreshold: 50, // 50行
    deepNestingThreshold: 5, // 5層嵌套
    highComplexityThreshold: 10, // 循環複雜度
    verbose: false,
    enableCache: true
};
/**
 * 預設效能分析器實作
 */
export class DefaultPerformanceAnalyzer {
    parserRegistry;
    analysisCache = new Map();
    constructor() {
        this.parserRegistry = ParserRegistry.getInstance();
    }
    /**
     * 分析檔案效能
     */
    async analyzeFile(filePath, config = DEFAULT_PERFORMANCE_CONFIG) {
        // 檢查快取
        if (config.enableCache && this.analysisCache.has(filePath)) {
            const cached = this.analysisCache.get(filePath);
            if (config.verbose) {
                console.log(`使用快取結果: ${filePath}`);
            }
            return cached;
        }
        const { result: fileInfo } = await measureAsync(async () => {
            return await this.analyzeFileInternal(filePath, config);
        }, config.verbose ? `分析檔案: ${filePath}` : undefined);
        // 快取結果
        if (config.enableCache) {
            this.analysisCache.set(filePath, fileInfo);
        }
        return fileInfo;
    }
    /**
     * 分析專案效能
     */
    async analyzeProject(projectPath, config = DEFAULT_PERFORMANCE_CONFIG) {
        const monitor = new DefaultPerformanceMonitor();
        monitor.start();
        try {
            // 獲取所有程式碼檔案
            const files = await this.getAllCodeFiles(projectPath);
            if (config.verbose) {
                console.log(`找到 ${files.length} 個程式碼檔案`);
            }
            // 分析每個檔案
            const fileResults = [];
            const allIssues = [];
            for (const file of files) {
                try {
                    const fileInfo = await this.analyzeFile(file, config);
                    fileResults.push(fileInfo);
                    // 檢測問題
                    const issues = this.detectIssues(fileInfo, config);
                    allIssues.push(...issues);
                }
                catch (error) {
                    if (config.verbose) {
                        console.warn(`跳過檔案 ${file}:`, error);
                    }
                }
            }
            const metrics = monitor.stop();
            // 計算統計資料
            const summary = this.calculateSummary(fileResults);
            // 生成建議
            const recommendations = this.generateRecommendations(allIssues, summary);
            return {
                metrics,
                fileResults,
                issues: allIssues,
                summary,
                recommendations
            };
        }
        catch (error) {
            monitor.stop();
            throw error;
        }
    }
    /**
     * 檢測效能問題
     */
    detectIssues(fileInfo, config) {
        const issues = [];
        // 檢查大檔案
        if (fileInfo.fileSize > config.largeFileThreshold) {
            issues.push({
                type: PerformanceIssueType.LARGE_FILE,
                severity: this.calculateSeverity(fileInfo.fileSize, config.largeFileThreshold, 5),
                filePath: fileInfo.filePath,
                message: `檔案過大: ${(fileInfo.fileSize / 1024).toFixed(1)}KB`,
                suggestions: [
                    '考慮將檔案拆分為多個較小的模組',
                    '移除未使用的程式碼',
                    '使用程式碼分割技術'
                ],
                value: fileInfo.fileSize,
                threshold: config.largeFileThreshold
            });
        }
        // 檢查長函式
        if (fileInfo.longFunctionCount > 0) {
            issues.push({
                type: PerformanceIssueType.LONG_FUNCTION,
                severity: Math.min(10, fileInfo.longFunctionCount),
                filePath: fileInfo.filePath,
                message: `發現 ${fileInfo.longFunctionCount} 個長函式`,
                suggestions: [
                    '將長函式拆分為多個較小的函式',
                    '提取重複的邏輯到共用函式',
                    '使用函式式程式設計減少複雜度'
                ],
                value: fileInfo.longFunctionCount,
                threshold: 0
            });
        }
        // 檢查深度嵌套
        if (fileInfo.nestingDepth > config.deepNestingThreshold) {
            issues.push({
                type: PerformanceIssueType.DEEP_NESTING,
                severity: this.calculateSeverity(fileInfo.nestingDepth, config.deepNestingThreshold, 8),
                filePath: fileInfo.filePath,
                message: `嵌套過深: ${fileInfo.nestingDepth} 層`,
                suggestions: [
                    '使用早期返回減少嵌套',
                    '提取條件邏輯到獨立函式',
                    '考慮使用策略模式或狀態機'
                ],
                value: fileInfo.nestingDepth,
                threshold: config.deepNestingThreshold
            });
        }
        // 檢查高複雜度
        if (fileInfo.cyclomaticComplexity > config.highComplexityThreshold) {
            issues.push({
                type: PerformanceIssueType.HIGH_COMPLEXITY,
                severity: this.calculateSeverity(fileInfo.cyclomaticComplexity, config.highComplexityThreshold, 10),
                filePath: fileInfo.filePath,
                message: `循環複雜度過高: ${fileInfo.cyclomaticComplexity}`,
                suggestions: [
                    '簡化條件邏輯',
                    '使用多型代替條件分支',
                    '將複雜函式拆分為多個簡單函式'
                ],
                value: fileInfo.cyclomaticComplexity,
                threshold: config.highComplexityThreshold
            });
        }
        return issues;
    }
    /**
     * 內部檔案分析實作
     */
    async analyzeFileInternal(filePath, config) {
        const parseStart = Date.now();
        // 獲取檔案資訊
        const stats = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        // 基本指標
        let functionCount = 0;
        let classCount = 0;
        let longFunctionCount = 0;
        let nestingDepth = 0;
        let cyclomaticComplexity = 1; // 基礎複雜度
        try {
            // 嘗試使用 parser 進行精確分析
            const ext = extname(filePath);
            const parser = this.parserRegistry.getParser(ext);
            if (parser) {
                const ast = await parser.parse(content, filePath);
                const symbols = await parser.extractSymbols(ast);
                // 統計符號
                for (const symbol of symbols) {
                    if (symbol.type === 'function') {
                        functionCount++;
                        // 檢查函式長度（簡化）
                        if (symbol.location?.range) {
                            const lines = symbol.location.range.end.line - symbol.location.range.start.line;
                            if (lines > config.longFunctionThreshold) {
                                longFunctionCount++;
                            }
                        }
                    }
                    else if (symbol.type === 'class') {
                        classCount++;
                    }
                }
            }
        }
        catch (error) {
            // 使用正則表達式作為備選方案
            if (config.verbose) {
                console.warn(`Parser 分析失敗，使用正則表達式: ${filePath}`);
            }
            // 簡化的正則表達式分析
            const functionMatches = content.match(/function\s+\w+|=>\s*{|function\s*\(/g) || [];
            functionCount = functionMatches.length;
            const classMatches = content.match(/class\s+\w+|interface\s+\w+/g) || [];
            classCount = classMatches.length;
            // 檢查長函式（基於括號和行數的啟發式方法）
            const functionBlocks = content.match(/function[^{]*{[^}]*}/g) || [];
            longFunctionCount = functionBlocks.filter(block => block.split('\n').length > config.longFunctionThreshold).length;
        }
        // 計算嵌套深度
        nestingDepth = this.calculateNestingDepth(content);
        // 計算循環複雜度（簡化版本）
        cyclomaticComplexity = this.calculateCyclomaticComplexity(content);
        const parseTime = Date.now() - parseStart;
        return {
            filePath,
            fileSize: stats.size,
            parseTime,
            functionCount,
            classCount,
            longFunctionCount,
            nestingDepth,
            cyclomaticComplexity
        };
    }
    /**
     * 獲取所有程式碼檔案
     */
    async getAllCodeFiles(projectPath) {
        const files = [];
        const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
        async function scan(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    // 跳過常見的忽略目錄
                    if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
                        await scan(fullPath);
                    }
                }
                else if (entry.isFile()) {
                    const ext = extname(entry.name);
                    if (supportedExtensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        }
        await scan(projectPath);
        return files;
    }
    /**
     * 計算嵌套深度
     */
    calculateNestingDepth(content) {
        let maxDepth = 0;
        let currentDepth = 0;
        for (const char of content) {
            if (char === '{') {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            }
            else if (char === '}') {
                currentDepth--;
            }
        }
        return maxDepth;
    }
    /**
     * 計算循環複雜度（簡化版本）
     */
    calculateCyclomaticComplexity(content) {
        // 基礎複雜度為 1
        let complexity = 1;
        // 計算條件分支
        const conditions = [
            /if\s*\(/g,
            /else\s+if\s*\(/g,
            /while\s*\(/g,
            /for\s*\(/g,
            /case\s+/g,
            /catch\s*\(/g,
            /\?\s*:/g, // 三元運算子
            /&&/g,
            /\|\|/g
        ];
        for (const pattern of conditions) {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        }
        return complexity;
    }
    /**
     * 計算嚴重程度
     */
    calculateSeverity(value, threshold, maxSeverity) {
        const ratio = value / threshold;
        return Math.min(maxSeverity, Math.ceil(ratio * 3));
    }
    /**
     * 計算專案統計摘要
     */
    calculateSummary(fileResults) {
        const totalFiles = fileResults.length;
        const totalSize = fileResults.reduce((sum, file) => sum + file.fileSize, 0);
        const averageFileSize = totalFiles > 0 ? totalSize / totalFiles : 0;
        const largeFileCount = fileResults.filter(file => file.fileSize > 50000).length;
        const longFunctionCount = fileResults.reduce((sum, file) => sum + file.longFunctionCount, 0);
        const highComplexityCount = fileResults.filter(file => file.cyclomaticComplexity > 10).length;
        // 計算整體效能評分 (1-100)
        const sizeScore = Math.max(0, 100 - (largeFileCount / totalFiles) * 100);
        const functionScore = Math.max(0, 100 - (longFunctionCount / totalFiles) * 20);
        const complexityScore = Math.max(0, 100 - (highComplexityCount / totalFiles) * 100);
        const overallScore = Math.round((sizeScore + functionScore + complexityScore) / 3);
        return {
            totalFiles,
            totalSize,
            averageFileSize,
            largeFileCount,
            longFunctionCount,
            highComplexityCount,
            overallScore
        };
    }
    /**
     * 生成優化建議
     */
    generateRecommendations(issues, summary) {
        const recommendations = [];
        // 基於問題類型的建議
        const issueTypes = new Set(issues.map(issue => issue.type));
        if (issueTypes.has(PerformanceIssueType.LARGE_FILE)) {
            recommendations.push('考慮拆分大型檔案以提高載入和解析效能');
        }
        if (issueTypes.has(PerformanceIssueType.LONG_FUNCTION)) {
            recommendations.push('重構長函式以提高可讀性和可維護性');
        }
        if (issueTypes.has(PerformanceIssueType.HIGH_COMPLEXITY)) {
            recommendations.push('簡化複雜的邏輯以減少 CPU 負擔');
        }
        if (issueTypes.has(PerformanceIssueType.DEEP_NESTING)) {
            recommendations.push('減少深度嵌套以提高執行效率');
        }
        // 基於整體統計的建議
        if (summary.overallScore < 70) {
            recommendations.push('專案整體效能需要優化，建議進行全面的程式碼審查');
        }
        if (summary.largeFileCount > summary.totalFiles * 0.2) {
            recommendations.push('考慮採用模組化架構以改善專案結構');
        }
        if (recommendations.length === 0) {
            recommendations.push('程式碼效能良好，繼續保持良好的開發實踐');
        }
        return recommendations;
    }
    /**
     * 清理快取
     */
    clearCache() {
        this.analysisCache.clear();
    }
}
//# sourceMappingURL=analyzer.js.map