/**
 * Parser 插件相關型別定義
 * 包含 Parser 插件系統所需的所有型別介面
 */
/**
 * 建立 CodeEdit 的工廠函式
 */
export function createCodeEdit(filePath, range, newText, editType) {
    if (!filePath.trim()) {
        throw new Error('檔案路徑不能為空');
    }
    if (editType !== undefined) {
        return {
            filePath,
            range,
            newText,
            editType
        };
    }
    else {
        return {
            filePath,
            range,
            newText
        };
    }
}
/**
 * 建立 Definition 的工廠函式
 */
export function createDefinition(location, kind, containerName) {
    if (containerName !== undefined) {
        return {
            location,
            kind,
            containerName
        };
    }
    else {
        return {
            location,
            kind
        };
    }
}
/**
 * 建立 Usage 的工廠函式
 */
export function createUsage(location, kind) {
    return {
        location,
        kind
    };
}
/**
 * 建立 ValidationResult 的工廠函式
 */
export function createValidationResult(valid, errors = [], warnings = []) {
    return {
        valid,
        errors: [...errors],
        warnings: [...warnings]
    };
}
/**
 * 建立成功的 ValidationResult
 */
export function createValidationSuccess() {
    return createValidationResult(true);
}
/**
 * 建立失敗的 ValidationResult
 */
export function createValidationFailure(errors, warnings) {
    return createValidationResult(false, errors, warnings);
}
/**
 * CodeEdit 型別守衛
 */
export function isCodeEdit(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.filePath === 'string' &&
        obj.filePath.trim().length > 0 &&
        obj.range && typeof obj.range === 'object' &&
        typeof obj.newText === 'string' &&
        (obj.editType === undefined || typeof obj.editType === 'string'));
}
/**
 * Definition 型別守衛
 */
export function isDefinition(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    const validKinds = [
        'class', 'interface', 'function', 'method', 'variable',
        'constant', 'type', 'enum', 'module', 'namespace'
    ];
    return (obj.location && typeof obj.location === 'object' &&
        typeof obj.kind === 'string' &&
        validKinds.includes(obj.kind) &&
        (obj.containerName === undefined || typeof obj.containerName === 'string'));
}
/**
 * Usage 型別守衛
 */
export function isUsage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    const validKinds = ['read', 'write', 'call', 'reference'];
    return (obj.location && typeof obj.location === 'object' &&
        typeof obj.kind === 'string' &&
        validKinds.includes(obj.kind));
}
/**
 * ValidationResult 型別守衛
 */
export function isValidationResult(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.valid === 'boolean' &&
        Array.isArray(obj.errors) &&
        Array.isArray(obj.warnings));
}
/**
 * ParserCapabilities 型別守衛
 */
export function isParserCapabilities(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.supportsRename === 'boolean' &&
        typeof obj.supportsExtractFunction === 'boolean' &&
        typeof obj.supportsGoToDefinition === 'boolean' &&
        typeof obj.supportsFindUsages === 'boolean' &&
        typeof obj.supportsCodeActions === 'boolean');
}
//# sourceMappingURL=types.js.map