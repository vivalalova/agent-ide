/**
 * Performance 模組介面定義
 * 定義效能分析的核心資料結構和介面
 */
/**
 * 效能問題類型
 */
export var PerformanceIssueType;
(function (PerformanceIssueType) {
    PerformanceIssueType["LARGE_FILE"] = "large_file";
    PerformanceIssueType["LONG_FUNCTION"] = "long_function";
    PerformanceIssueType["DEEP_NESTING"] = "deep_nesting";
    PerformanceIssueType["HIGH_COMPLEXITY"] = "high_complexity";
    PerformanceIssueType["NESTED_LOOPS"] = "nested_loops";
    PerformanceIssueType["MEMORY_INTENSIVE"] = "memory_intensive";
})(PerformanceIssueType || (PerformanceIssueType = {}));
//# sourceMappingURL=interfaces.js.map