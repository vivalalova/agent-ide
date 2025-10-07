/**
 * 文字搜尋引擎實作
 * 提供高效的文字搜尋功能，支援正則表達式、模糊匹配等
 */
import type { TextQuery, SearchResult } from '../types.js';
/**
 * 文字搜尋引擎
 */
export declare class TextSearchEngine {
    private readonly defaultOptions;
    /**
     * 執行文字搜尋
     */
    search(query: TextQuery): Promise<SearchResult>;
    /**
     * 在單個檔案中搜尋
     */
    private searchInFile;
    /**
     * 建立搜尋正則表達式
     */
    private buildSearchRegex;
    /**
     * 建立匹配上下文
     */
    private buildContext;
    /**
     * 尋找包圍的函式名稱
     */
    private findEnclosingFunction;
    /**
     * 尋找包圍的類別名稱
     */
    private findEnclosingClass;
    /**
     * 計算字符偏移量
     */
    private calculateOffset;
    /**
     * 計算匹配分數
     */
    private calculateScore;
    /**
     * 排序匹配結果
     */
    private sortMatches;
    /**
     * 獲取要搜尋的檔案列表
     */
    private getSearchFiles;
}
//# sourceMappingURL=text-engine.d.ts.map