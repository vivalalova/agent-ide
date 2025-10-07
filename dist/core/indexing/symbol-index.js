/**
 * 符號索引實作
 * 管理程式碼符號的索引和查詢功能
 */
/**
 * 符號索引類別
 * 負責管理程式碼符號的索引和高效查詢
 */
export class SymbolIndex {
    // 主索引：符號名稱 -> 符號項目列表
    symbolsByName = new Map();
    // 類型索引：符號類型 -> 符號項目列表
    symbolsByType = new Map();
    // 檔案索引：檔案路徑 -> 符號項目列表
    symbolsByFile = new Map();
    // 作用域索引：作用域 -> 符號項目列表
    symbolsByScope = new Map();
    lastUpdated = new Date();
    /**
     * 新增符號到索引
     */
    async addSymbol(symbol, fileInfo) {
        const entry = {
            symbol,
            fileInfo,
            dependencies: []
        };
        this.addToIndex(entry);
        this.lastUpdated = new Date();
    }
    /**
     * 批次新增符號到索引
     */
    async addSymbols(symbols, fileInfo) {
        for (const symbol of symbols) {
            const entry = {
                symbol,
                fileInfo,
                dependencies: []
            };
            this.addToIndex(entry);
        }
        this.lastUpdated = new Date();
    }
    /**
     * 移除符號從索引
     */
    async removeSymbol(symbolName, filePath) {
        // 從名稱索引中移除
        const nameEntries = this.symbolsByName.get(symbolName);
        if (nameEntries) {
            const filtered = nameEntries.filter(entry => entry.fileInfo.filePath !== filePath ||
                entry.symbol.name !== symbolName);
            if (filtered.length === 0) {
                this.symbolsByName.delete(symbolName);
            }
            else {
                this.symbolsByName.set(symbolName, filtered);
            }
        }
        // 從其他索引中移除
        this.removeFromOtherIndexes(symbolName, filePath);
        this.lastUpdated = new Date();
    }
    /**
     * 移除檔案的所有符號
     */
    async removeFileSymbols(filePath) {
        const fileEntries = this.symbolsByFile.get(filePath);
        if (!fileEntries) {
            return;
        }
        // 從所有索引中移除該檔案的符號
        for (const entry of fileEntries) {
            await this.removeSymbol(entry.symbol.name, filePath);
        }
        this.symbolsByFile.delete(filePath);
        this.lastUpdated = new Date();
    }
    /**
     * 更新符號資訊
     */
    async updateSymbol(symbol, fileInfo) {
        // 先移除舊的符號
        await this.removeSymbol(symbol.name, fileInfo.filePath);
        // 再新增新的符號
        await this.addSymbol(symbol, fileInfo);
    }
    /**
     * 檢查符號是否存在
     */
    hasSymbol(symbolName) {
        return this.symbolsByName.has(symbolName);
    }
    /**
     * 根據確切名稱查找符號
     */
    async findSymbol(name, options) {
        const entries = this.symbolsByName.get(name) || [];
        return this.convertToSearchResults(entries, options);
    }
    /**
     * 根據符號類型查找
     */
    async findSymbolsByType(type, options) {
        const entries = this.symbolsByType.get(type) || [];
        return this.convertToSearchResults(entries, options);
    }
    /**
     * 模糊搜尋符號
     */
    async searchSymbols(pattern, options) {
        const results = [];
        const caseSensitive = options?.caseSensitive ?? false;
        const fuzzy = options?.fuzzy ?? true;
        const maxResults = options?.maxResults ?? 100;
        const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
        for (const [name, entries] of this.symbolsByName) {
            const targetName = caseSensitive ? name : name.toLowerCase();
            let matches = false;
            let score = 0;
            if (fuzzy) {
                const fuzzyResult = this.fuzzyMatch(searchPattern, targetName);
                if (fuzzyResult.matches) {
                    matches = true;
                    score = fuzzyResult.score;
                }
            }
            else {
                if (targetName.includes(searchPattern)) {
                    matches = true;
                    score = this.calculateExactScore(searchPattern, targetName);
                }
            }
            if (matches) {
                for (const entry of entries) {
                    results.push({
                        symbol: entry.symbol,
                        fileInfo: entry.fileInfo,
                        score
                    });
                    if (results.length >= maxResults) {
                        break;
                    }
                }
            }
            if (results.length >= maxResults) {
                break;
            }
        }
        // 根據分數排序
        results.sort((a, b) => b.score - a.score);
        return results;
    }
    /**
     * 取得檔案的所有符號
     */
    async getFileSymbols(filePath) {
        const entries = this.symbolsByFile.get(filePath) || [];
        return entries.map(entry => entry.symbol);
    }
    /**
     * 根據作用域查找符號
     */
    async findSymbolsInScope(scope) {
        const scopeKey = this.getScopeKey(scope);
        const entries = this.symbolsByScope.get(scopeKey) || [];
        return entries.map(entry => entry.symbol);
    }
    /**
     * 取得符號總數
     */
    getTotalSymbols() {
        let total = 0;
        for (const entries of this.symbolsByName.values()) {
            total += entries.length;
        }
        return total;
    }
    /**
     * 取得統計資訊
     */
    getStats() {
        const symbolsByType = new Map();
        const symbolsByFile = new Map();
        let totalSymbols = 0;
        for (const entries of this.symbolsByName.values()) {
            for (const entry of entries) {
                totalSymbols++;
                // 統計類型
                const typeCount = symbolsByType.get(entry.symbol.type) || 0;
                symbolsByType.set(entry.symbol.type, typeCount + 1);
                // 統計檔案
                const fileCount = symbolsByFile.get(entry.fileInfo.filePath) || 0;
                symbolsByFile.set(entry.fileInfo.filePath, fileCount + 1);
            }
        }
        return {
            totalSymbols,
            symbolsByType,
            symbolsByFile,
            lastUpdated: this.lastUpdated
        };
    }
    /**
     * 清空所有符號
     */
    async clear() {
        this.symbolsByName.clear();
        this.symbolsByType.clear();
        this.symbolsByFile.clear();
        this.symbolsByScope.clear();
        this.lastUpdated = new Date();
    }
    /**
     * 新增符號項目到各個索引
     */
    addToIndex(entry) {
        const { symbol, fileInfo } = entry;
        // 名稱索引
        const nameEntries = this.symbolsByName.get(symbol.name) || [];
        nameEntries.push(entry);
        this.symbolsByName.set(symbol.name, nameEntries);
        // 類型索引
        const typeEntries = this.symbolsByType.get(symbol.type) || [];
        typeEntries.push(entry);
        this.symbolsByType.set(symbol.type, typeEntries);
        // 檔案索引
        const fileEntries = this.symbolsByFile.get(fileInfo.filePath) || [];
        fileEntries.push(entry);
        this.symbolsByFile.set(fileInfo.filePath, fileEntries);
        // 作用域索引
        if (symbol.scope) {
            const scopeKey = this.getScopeKey(symbol.scope);
            const scopeEntries = this.symbolsByScope.get(scopeKey) || [];
            scopeEntries.push(entry);
            this.symbolsByScope.set(scopeKey, scopeEntries);
        }
    }
    /**
     * 從其他索引中移除符號
     */
    removeFromOtherIndexes(symbolName, filePath) {
        // 從類型索引中移除
        for (const [type, entries] of this.symbolsByType) {
            const filtered = entries.filter(entry => entry.fileInfo.filePath !== filePath ||
                entry.symbol.name !== symbolName);
            if (filtered.length === 0) {
                this.symbolsByType.delete(type);
            }
            else {
                this.symbolsByType.set(type, filtered);
            }
        }
        // 從檔案索引中移除
        const fileEntries = this.symbolsByFile.get(filePath);
        if (fileEntries) {
            const filtered = fileEntries.filter(entry => entry.symbol.name !== symbolName);
            if (filtered.length === 0) {
                this.symbolsByFile.delete(filePath);
            }
            else {
                this.symbolsByFile.set(filePath, filtered);
            }
        }
        // 從作用域索引中移除
        for (const [scopeKey, entries] of this.symbolsByScope) {
            const filtered = entries.filter(entry => entry.fileInfo.filePath !== filePath ||
                entry.symbol.name !== symbolName);
            if (filtered.length === 0) {
                this.symbolsByScope.delete(scopeKey);
            }
            else {
                this.symbolsByScope.set(scopeKey, filtered);
            }
        }
    }
    /**
     * 轉換索引項目為搜尋結果
     */
    convertToSearchResults(entries, options) {
        const maxResults = options?.maxResults ?? 100;
        const results = [];
        for (let i = 0; i < Math.min(entries.length, maxResults); i++) {
            const entry = entries[i];
            results.push({
                symbol: entry.symbol,
                fileInfo: entry.fileInfo,
                score: 1.0 // 完全匹配的分數
            });
        }
        return results;
    }
    /**
     * 模糊匹配演算法
     */
    fuzzyMatch(pattern, target) {
        if (pattern === '') {
            return { matches: true, score: 0.1 };
        }
        if (target === '') {
            return { matches: false, score: 0 };
        }
        // 簡化的模糊匹配實現
        let patternIndex = 0;
        let targetIndex = 0;
        let score = 0;
        let matches = 0;
        while (patternIndex < pattern.length && targetIndex < target.length) {
            if (pattern[patternIndex] === target[targetIndex]) {
                matches++;
                score += 1;
                patternIndex++;
            }
            targetIndex++;
        }
        const matchesAll = patternIndex === pattern.length;
        const finalScore = matchesAll ? matches / Math.max(pattern.length, target.length) : 0;
        return {
            matches: matchesAll,
            score: finalScore
        };
    }
    /**
     * 計算精確匹配的分數
     */
    calculateExactScore(pattern, target) {
        if (target === pattern) {
            return 1.0; // 完全匹配
        }
        if (target.startsWith(pattern)) {
            return 0.8; // 前綴匹配
        }
        if (target.includes(pattern)) {
            return 0.6; // 包含匹配
        }
        return 0.1; // 其他情況
    }
    /**
     * 生成作用域索引鍵
     */
    getScopeKey(scope) {
        const path = [];
        let current = scope;
        while (current) {
            path.unshift(`${current.type}:${current.name || 'anonymous'}`);
            current = current.parent;
        }
        return path.join('/');
    }
}
//# sourceMappingURL=symbol-index.js.map