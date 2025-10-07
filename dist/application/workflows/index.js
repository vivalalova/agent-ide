/**
 * Workflows 模組匯出
 * 提供所有工作流程類別和相關型別的統一匯出
 */
// 基礎工作流程
export { BaseWorkflow, WorkflowError } from './base-workflow.js';
// 重構工作流程
export { RefactorWorkflow } from './refactor-workflow.js';
// 分析工作流程
export { AnalysisWorkflow, AnalysisType } from './analysis-workflow.js';
import { RefactorWorkflow } from './refactor-workflow.js';
import { AnalysisWorkflow } from './analysis-workflow.js';
/**
 * 工作流程類型枚舉
 */
export var WorkflowType;
(function (WorkflowType) {
    WorkflowType["REFACTOR"] = "refactor";
    WorkflowType["ANALYSIS"] = "analysis";
})(WorkflowType || (WorkflowType = {}));
/**
 * 工作流程工廠
 * 提供統一的工作流程建立介面
 */
export class WorkflowFactory {
    moduleCoordinator;
    constructor(moduleCoordinator) {
        this.moduleCoordinator = moduleCoordinator;
    }
    /**
     * 建立重構工作流程
     */
    createRefactorWorkflow() {
        return new RefactorWorkflow(this.moduleCoordinator);
    }
    /**
     * 建立分析工作流程
     */
    createAnalysisWorkflow() {
        return new AnalysisWorkflow(this.moduleCoordinator);
    }
    /**
     * 根據類型建立工作流程
     */
    createWorkflow(type) {
        switch (type) {
            case WorkflowType.REFACTOR:
                return this.createRefactorWorkflow();
            case WorkflowType.ANALYSIS:
                return this.createAnalysisWorkflow();
            default:
                throw new Error(`不支援的工作流程類型: ${type}`);
        }
    }
    /**
     * 取得所有支援的工作流程類型
     */
    getSupportedTypes() {
        return Object.values(WorkflowType);
    }
}
/**
 * 工作流程註冊表
 * 用於管理和查詢可用的工作流程
 */
export class WorkflowRegistry {
    static workflows = new Map();
    static {
        // 註冊內建工作流程
        WorkflowRegistry.register(WorkflowType.REFACTOR, {
            type: WorkflowType.REFACTOR,
            name: '重構工作流程',
            description: '執行程式碼重構操作，包括分析、驗證、執行和結果驗證',
            inputSchema: {
                filePath: 'string',
                options: {
                    type: 'extract-function | inline-function | rename',
                    selection: 'Range?',
                    newName: 'string?',
                    preview: 'boolean?'
                }
            },
            outputSchema: {
                success: 'boolean',
                refactorResult: 'RefactorResult',
                analysisData: 'unknown?',
                validationData: 'unknown?',
                error: 'BaseError?'
            }
        });
        WorkflowRegistry.register(WorkflowType.ANALYSIS, {
            type: WorkflowType.ANALYSIS,
            name: '分析工作流程',
            description: '執行程式碼分析，包括複雜度、依賴、品質、死代碼和重複代碼分析',
            inputSchema: {
                target: 'string',
                analysisTypes: 'AnalysisType[]',
                options: {
                    includeTests: 'boolean?',
                    excludePatterns: 'string[]?',
                    outputFormat: 'json | markdown | html?',
                    includeRecommendations: 'boolean?',
                    detailLevel: 'basic | detailed | comprehensive?'
                }
            },
            outputSchema: {
                success: 'boolean',
                report: 'AnalysisReport',
                rawData: 'unknown?',
                error: 'BaseError?'
            }
        });
    }
    /**
     * 註冊工作流程
     */
    static register(id, workflow) {
        WorkflowRegistry.workflows.set(id, workflow);
    }
    /**
     * 取得工作流程資訊
     */
    static get(id) {
        return WorkflowRegistry.workflows.get(id);
    }
    /**
     * 取得所有註冊的工作流程
     */
    static getAll() {
        const result = [];
        for (const [id, workflow] of WorkflowRegistry.workflows) {
            result.push({ id, ...workflow });
        }
        return result;
    }
    /**
     * 根據類型取得工作流程
     */
    static getByType(type) {
        return WorkflowRegistry.getAll().filter(workflow => workflow.type === type);
    }
    /**
     * 檢查工作流程是否存在
     */
    static exists(id) {
        return WorkflowRegistry.workflows.has(id);
    }
    /**
     * 移除工作流程註冊
     */
    static unregister(id) {
        return WorkflowRegistry.workflows.delete(id);
    }
}
/**
 * 工作流程輔助方法
 */
export class WorkflowUtils {
    /**
     * 驗證工作流程輸入
     */
    static validateInput(type, input) {
        const errors = [];
        switch (type) {
            case WorkflowType.REFACTOR:
                if (!input || typeof input !== 'object') {
                    errors.push('輸入必須是物件');
                    break;
                }
                const refactorInput = input;
                if (!refactorInput.filePath || typeof refactorInput.filePath !== 'string') {
                    errors.push('filePath 必須是字串');
                }
                if (!refactorInput.options || typeof refactorInput.options !== 'object') {
                    errors.push('options 必須是物件');
                }
                break;
            case WorkflowType.ANALYSIS:
                if (!input || typeof input !== 'object') {
                    errors.push('輸入必須是物件');
                    break;
                }
                const analysisInput = input;
                if (!analysisInput.target || typeof analysisInput.target !== 'string') {
                    errors.push('target 必須是字串');
                }
                if (!Array.isArray(analysisInput.analysisTypes)) {
                    errors.push('analysisTypes 必須是陣列');
                }
                break;
            default:
                errors.push(`不支援的工作流程類型: ${type}`);
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    /**
     * 格式化工作流程結果
     */
    static formatResult(type, result) {
        if (!result || typeof result !== 'object') {
            return JSON.stringify(result, null, 2);
        }
        const resultObj = result;
        switch (type) {
            case WorkflowType.REFACTOR:
                return `重構結果:\n成功: ${resultObj.success}\n變更數量: ${resultObj.refactorResult?.changes?.length || 0}`;
            case WorkflowType.ANALYSIS:
                const report = resultObj.report;
                return `分析結果:\n目標: ${report?.summary?.target}\n檔案數量: ${report?.summary?.totalFiles}\n分析類型: ${report?.summary?.analysisTypes?.join(', ')}`;
            default:
                return JSON.stringify(result, null, 2);
        }
    }
}
//# sourceMappingURL=index.js.map