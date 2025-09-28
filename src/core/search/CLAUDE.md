# Search 模組開發規範

## 實作狀態 ✅

### 實際檔案結構
```
search/
├── index.ts                    ✅ 模組入口
├── service.ts                  ✅ 搜尋服務
├── engines/
│   └── text-engine.ts          ✅ 文字搜尋引擎
├── types.ts                    ✅ 型別定義
└── 其他進階功能              ⏳ 待實作
```

### 實作功能狀態
- ✅ 搜尋服務核心功能
- ✅ 文字搜尋引擎
- ✅ 基本型別定義
- ⏳ 符號搜尋引擎
- ⏳ 語義搜尋引擎
- ⏳ 查詢最佳化系統
- ⏳ 搜尋結果排序

## 模組職責
提供高效、精確、多維度的程式碼搜尋功能，支援文字、語義、結構化搜尋，最大化搜尋效率並最小化 token 使用。

## 開發原則

### 1. 搜尋效率
- **索引優先**：充分利用預建索引
- **漸進式搜尋**：支援即時結果返回
- **智能排序**：相關性優先
- **結果截斷**：避免過多無用結果

### 2. 搜尋精確度
- 支援精確匹配
- 支援模糊搜尋
- 支援正則表達式
- 支援結構化查詢

### 3. 使用者體驗
- 即時搜尋建議
- 搜尋歷史記錄
- 智能錯誤糾正
- 上下文感知

## 實作規範

### 檔案結構
```
search/
├── index.ts              # 模組入口
├── service.ts            # SearchService 實作
├── engines/
│   ├── text-engine.ts        # 文字搜尋引擎
│   ├── symbol-engine.ts      # 符號搜尋引擎
│   ├── semantic-engine.ts    # 語義搜尋引擎
│   └── pattern-engine.ts     # 模式搜尋引擎
├── indexers/
│   ├── text-indexer.ts       # 全文索引
│   ├── trigram-indexer.ts    # 三元組索引
│   └── symbol-indexer.ts     # 符號索引
├── query/
│   ├── query-parser.ts       # 查詢解析器
│   ├── query-optimizer.ts    # 查詢優化器
│   └── query-executor.ts     # 查詢執行器
├── ranking/
│   ├── scorer.ts             # 評分系統
│   └── ranker.ts             # 排序器
└── types.ts              # 型別定義
```

### 搜尋引擎架構
```typescript
abstract class SearchEngine<T extends SearchQuery, R extends SearchResult> {
  protected index: SearchIndex;
  protected cache: SearchCache;

  // 搜尋流程
  async search(query: T, options: SearchOptions): Promise<R> {
    // 1. 查詢解析
    const parsedQuery = await this.parseQuery(query);

    // 2. 快取檢查
    const cached = await this.checkCache(parsedQuery);
    if (cached) return cached;

    // 3. 查詢優化
    const optimizedQuery = await this.optimizeQuery(parsedQuery);

    // 4. 執行搜尋
    const results = await this.executeSearch(optimizedQuery);

    // 5. 結果排序
    const ranked = await this.rankResults(results);

    // 6. 快取結果
    await this.cacheResults(parsedQuery, ranked);

    return ranked;
  }

  abstract parseQuery(query: T): Promise<ParsedQuery>;
  abstract executeSearch(query: ParsedQuery): Promise<RawResult[]>;
  abstract rankResults(results: RawResult[]): Promise<R>;
}
```

## 文字搜尋實作

### 全文索引
```typescript
class FullTextIndex {
  private invertedIndex: Map<string, PostingList>;
  private documentStore: Map<DocId, Document>;
  private tokenizer: Tokenizer;

  // 建立索引
  async index(document: Document): Promise<void> {
    const tokens = this.tokenizer.tokenize(document.content);

    for (const token of tokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new PostingList());
      }

      this.invertedIndex.get(token)!.add({
        docId: document.id,
        position: token.position,
        frequency: token.frequency
      });
    }

    this.documentStore.set(document.id, document);
  }

  // 搜尋
  async search(query: string): Promise<SearchResult[]> {
    const queryTokens = this.tokenizer.tokenize(query);
    const results = new Map<DocId, number>();

    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token.value);
      if (postings) {
        for (const posting of postings) {
          const score = this.calculateTFIDF(posting, token);
          results.set(
            posting.docId,
            (results.get(posting.docId) || 0) + score
          );
        }
      }
    }

    return this.convertToResults(results);
  }
}
```

### 三元組索引（快速模糊搜尋）
```typescript
class TrigramIndex {
  private trigramMap: Map<string, Set<string>>;

  // 生成三元組
  private generateTrigrams(text: string): string[] {
    const trigrams: string[] = [];
    const padded = `  ${text}  `; // 加入邊界

    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.push(padded.slice(i, i + 3));
    }

    return trigrams;
  }

  // 模糊搜尋
  fuzzySearch(query: string, threshold = 0.7): string[] {
    const queryTrigrams = new Set(this.generateTrigrams(query));
    const candidates: Array<{ text: string; score: number }> = [];

    for (const [text, trigrams] of this.trigramMap) {
      const intersection = new Set(
        [...queryTrigrams].filter(t => trigrams.has(t))
      );

      const score = (2 * intersection.size) /
        (queryTrigrams.size + trigrams.size);

      if (score >= threshold) {
        candidates.push({ text, score });
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .map(c => c.text);
  }
}
```

## 語義搜尋

### 符號搜尋
```typescript
class SymbolSearchEngine extends SearchEngine<SymbolQuery, SymbolResult> {
  // 智能符號匹配
  async searchSymbols(query: SymbolQuery): Promise<SymbolResult> {
    const matches: Symbol[] = [];

    // 1. 精確匹配
    if (query.exact) {
      matches.push(...await this.exactMatch(query.name));
    }

    // 2. 前綴匹配
    matches.push(...await this.prefixMatch(query.name));

    // 3. 駝峰匹配（如 gTD 匹配 getTodoData）
    matches.push(...await this.camelCaseMatch(query.name));

    // 4. 模糊匹配
    if (query.fuzzy) {
      matches.push(...await this.fuzzyMatch(query.name));
    }

    // 過濾和排序
    return this.filterAndRank(matches, query);
  }

  // 駝峰匹配演算法
  private camelCaseMatch(pattern: string): Symbol[] {
    const regex = this.buildCamelCaseRegex(pattern);
    return this.symbolIndex.filter(symbol =>
      regex.test(symbol.name)
    );
  }

  private buildCamelCaseRegex(pattern: string): RegExp {
    // gTD -> g[a-z]*T[a-z]*D[a-z]*
    const regexStr = pattern
      .split('')
      .map(char => {
        if (char === char.toUpperCase()) {
          return char + '[a-z]*';
        }
        return char;
      })
      .join('');

    return new RegExp('^' + regexStr + '$');
  }
}
```

## AST 模式搜尋

### 結構化查詢
```typescript
class PatternSearchEngine {
  // AST 模式匹配
  async searchPattern(pattern: ASTPattern): Promise<Match[]> {
    const matches: Match[] = [];

    for (const file of this.files) {
      const ast = await this.parseFile(file);
      const fileMatches = this.matchPattern(ast, pattern);
      matches.push(...fileMatches);
    }

    return matches;
  }

  // 遞迴匹配 AST 節點
  private matchPattern(node: ASTNode, pattern: ASTPattern): Match[] {
    const matches: Match[] = [];

    // 檢查當前節點
    if (this.nodeMatches(node, pattern)) {
      matches.push(this.createMatch(node));
    }

    // 遞迴檢查子節點
    for (const child of node.children) {
      matches.push(...this.matchPattern(child, pattern));
    }

    return matches;
  }

  // 節點匹配邏輯
  private nodeMatches(node: ASTNode, pattern: ASTPattern): boolean {
    // 類型匹配
    if (pattern.type && node.type !== pattern.type) {
      return false;
    }

    // 屬性匹配
    for (const [key, value] of Object.entries(pattern.properties || {})) {
      if (!this.propertyMatches(node[key], value)) {
        return false;
      }
    }

    // 子節點匹配
    if (pattern.children) {
      return this.childrenMatch(node.children, pattern.children);
    }

    return true;
  }
}
```

## 查詢語言設計

### 查詢解析器
```typescript
class QueryParser {
  // 解析搜尋查詢語言
  parse(query: string): ParsedQuery {
    const tokens = this.tokenize(query);
    const ast = this.buildAST(tokens);
    return this.optimize(ast);
  }

  // 查詢語言範例：
  // func:getData AND type:async
  // class:*Controller extends:BaseController
  // "exact match" OR fuzzy~
  // @deprecated function

  private tokenize(query: string): Token[] {
    const tokens: Token[] = [];
    const regex = /(\w+:|\(|\)|AND|OR|NOT|"[^"]*"|\S+)/g;

    let match;
    while ((match = regex.exec(query)) !== null) {
      tokens.push(this.createToken(match[0]));
    }

    return tokens;
  }

  private buildAST(tokens: Token[]): QueryAST {
    // 使用遞迴下降解析器
    return this.parseExpression(tokens);
  }
}
```

## 搜尋結果排序

### 相關性評分
```typescript
class RelevanceScorer {
  // 計算搜尋結果相關性分數
  calculateScore(match: Match, query: Query): number {
    let score = 0;

    // 1. 位置權重（標題 > 函式名 > 內容）
    score += this.getPositionWeight(match.location);

    // 2. 匹配度（精確 > 前綴 > 模糊）
    score += this.getMatchWeight(match.matchType);

    // 3. 使用頻率
    score += this.getFrequencyWeight(match.symbol);

    // 4. 最近性（最近修改的權重更高）
    score += this.getRecencyWeight(match.lastModified);

    // 5. 檔案重要性
    score += this.getFileImportance(match.file);

    return score;
  }

  // TF-IDF 評分
  calculateTFIDF(term: string, document: Document): number {
    const tf = this.termFrequency(term, document);
    const idf = this.inverseDocumentFrequency(term);
    return tf * idf;
  }
}
```

## 搜尋建議

### 自動完成
```typescript
class SearchSuggester {
  private trie: Trie;
  private history: SearchHistory;

  // 生成搜尋建議
  async suggest(prefix: string, context: Context): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // 1. 從 Trie 獲取前綴匹配
    suggestions.push(...this.trie.search(prefix));

    // 2. 從歷史記錄獲取
    suggestions.push(...this.history.getSuggestions(prefix));

    // 3. 基於上下文的建議
    suggestions.push(...await this.contextualSuggest(prefix, context));

    // 4. 拼寫糾正建議
    if (suggestions.length === 0) {
      suggestions.push(...await this.spellCorrect(prefix));
    }

    return this.rankSuggestions(suggestions);
  }

  // 拼寫糾正（編輯距離）
  private async spellCorrect(word: string): Promise<string[]> {
    const candidates = this.generateCandidates(word);
    const valid = candidates.filter(c => this.dictionary.has(c));

    return valid.sort((a, b) =>
      this.editDistance(word, a) - this.editDistance(word, b)
    );
  }
}
```

## 效能優化

### 並行搜尋
```typescript
class ParallelSearcher {
  private workerPool: Worker[];

  // 分片並行搜尋
  async searchParallel(query: Query, files: string[]): Promise<Result[]> {
    const chunks = this.chunkFiles(files, this.workerPool.length);

    const promises = chunks.map((chunk, i) =>
      this.searchInWorker(this.workerPool[i], query, chunk)
    );

    const results = await Promise.all(promises);
    return this.mergeResults(results);
  }

  // 串流結果
  async *searchStream(query: Query): AsyncIterator<Result> {
    const queue = new PriorityQueue<Result>();
    let completed = 0;

    // 啟動並行搜尋
    for (const worker of this.workerPool) {
      this.startWorkerSearch(worker, query, (result) => {
        queue.push(result);
      }, () => {
        completed++;
      });
    }

    // 串流返回結果
    while (completed < this.workerPool.length || !queue.isEmpty()) {
      if (!queue.isEmpty()) {
        yield queue.pop();
      } else {
        await this.wait(10); // 等待新結果
      }
    }
  }
}
```

## 快取策略

### 多層快取
```typescript
class SearchCache {
  private l1Cache: Map<string, Result>; // 記憶體快取
  private l2Cache: LRUCache<string, Result>; // LRU 快取
  private l3Cache: DiskCache<string, Result>; // 磁碟快取

  async get(key: string): Promise<Result | null> {
    // L1 查詢
    if (this.l1Cache.has(key)) {
      return this.l1Cache.get(key)!;
    }

    // L2 查詢
    const l2Result = this.l2Cache.get(key);
    if (l2Result) {
      this.l1Cache.set(key, l2Result); // 提升到 L1
      return l2Result;
    }

    // L3 查詢
    const l3Result = await this.l3Cache.get(key);
    if (l3Result) {
      this.promote(key, l3Result);
      return l3Result;
    }

    return null;
  }
}
```

## 開發檢查清單

### 功能完整性
- [x] 支援所有搜尋模式
- [ ] 查詢語言完整
- [ ] 建議系統完善
- [ ] 排序演算法準確
- [ ] 快取機制高效

### 效能指標
- [ ] 搜尋延遲 < 100ms
- [ ] 建議生成 < 30ms
- [ ] 記憶體使用 < 200MB
- [ ] 快取命中率 > 70%