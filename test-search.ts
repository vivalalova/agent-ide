// 測試搜尋功能的檔案
export function searchTestFunction(query: string): string {
    const result = `Search for: ${query}`;
    return result;
}

export class SearchTestClass {
    private data: string;
    
    constructor(initialData: string) {
        this.data = initialData;
    }
    
    search(pattern: string): boolean {
        return this.data.includes(pattern);
    }
    
    async asyncSearch(pattern: string): Promise<string[]> {
        const matches: string[] = [];
        if (this.data.includes(pattern)) {
            matches.push(this.data);
        }
        return matches;
    }
}

export const SEARCH_CONSTANT = 'test-search-value';