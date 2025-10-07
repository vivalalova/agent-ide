/**
 * 依賴關係分析相關型別定義
 */
/**
 * 建立預設依賴分析選項
 */
export function createDefaultAnalysisOptions() {
    return {
        includeNodeModules: false,
        followSymlinks: true,
        maxDepth: 100,
        excludePatterns: ['node_modules', '.git', 'dist', 'build'],
        includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx']
    };
}
/**
 * 建立預設查詢選項
 */
export function createDefaultQueryOptions() {
    return {
        includeTransitive: false,
        maxDepth: 10,
        direction: 'dependencies'
    };
}
/**
 * 建立預設循環檢測選項
 */
export function createDefaultCycleDetectionOptions() {
    return {
        maxCycleLength: 20,
        reportAllCycles: false,
        ignoreSelfLoops: true
    };
}
/**
 * 建立預設分析器配置
 */
export function createDefaultAnalyzerConfig() {
    return {
        analysisOptions: createDefaultAnalysisOptions(),
        queryOptions: createDefaultQueryOptions(),
        cycleDetectionOptions: createDefaultCycleDetectionOptions(),
        cacheEnabled: true,
        concurrency: 4
    };
}
/**
 * 計算循環依賴嚴重程度
 */
export function calculateCycleSeverity(cycleLength) {
    if (cycleLength <= 3) {
        return 'low';
    }
    if (cycleLength <= 6) {
        return 'medium';
    }
    return 'high';
}
/**
 * FileDependencies 型別守衛
 */
export function isFileDependencies(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.filePath === 'string' &&
        obj.filePath.trim().length > 0 &&
        Array.isArray(obj.dependencies) &&
        obj.lastModified instanceof Date);
}
/**
 * ProjectDependencies 型別守衛
 */
export function isProjectDependencies(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.projectPath === 'string' &&
        obj.projectPath.trim().length > 0 &&
        Array.isArray(obj.fileDependencies) &&
        obj.fileDependencies.every(isFileDependencies) &&
        obj.analyzedAt instanceof Date);
}
/**
 * CircularDependency 型別守衛
 */
export function isCircularDependency(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    const validSeverities = ['low', 'medium', 'high'];
    return (Array.isArray(obj.cycle) &&
        obj.cycle.length >= 2 &&
        obj.cycle.every((item) => typeof item === 'string') &&
        typeof obj.length === 'number' &&
        obj.length >= 2 &&
        validSeverities.includes(obj.severity));
}
//# sourceMappingURL=types.js.map