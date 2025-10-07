/**
 * Parser 插件介面定義
 * 定義所有 Parser 插件必須實作的契約
 */
/**
 * Parser 插件型別守衛
 * 檢查物件是否實作了 ParserPlugin 介面
 */
export function isParserPlugin(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    // 檢查基本屬性
    if (typeof obj.name !== 'string' ||
        typeof obj.version !== 'string' ||
        !Array.isArray(obj.supportedExtensions) ||
        !Array.isArray(obj.supportedLanguages)) {
        return false;
    }
    // 檢查必要方法存在且為函式
    const requiredMethods = [
        'parse',
        'extractSymbols',
        'findReferences',
        'extractDependencies',
        'rename',
        'extractFunction',
        'findDefinition',
        'findUsages',
        'validate',
        'dispose'
    ];
    for (const method of requiredMethods) {
        if (typeof obj[method] !== 'function') {
            return false;
        }
    }
    return true;
}
/**
 * 檢查插件是否支援特定副檔名
 */
export function supportsExtension(plugin, extension) {
    return plugin.supportedExtensions.includes(extension);
}
/**
 * 檢查插件是否支援特定語言
 */
export function supportsLanguage(plugin, language) {
    return plugin.supportedLanguages.includes(language);
}
/**
 * 從檔案路徑獲取副檔名
 */
export function getFileExtension(filePath) {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot === -1 ? '' : filePath.substring(lastDot);
}
/**
 * 查找可以處理特定檔案的插件
 */
export function findPluginForFile(plugins, filePath) {
    const extension = getFileExtension(filePath);
    for (const plugin of plugins) {
        if (supportsExtension(plugin, extension)) {
            return plugin;
        }
    }
    return null;
}
//# sourceMappingURL=interface.js.map