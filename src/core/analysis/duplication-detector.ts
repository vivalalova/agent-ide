/**
 * 重複程式碼檢測器
 * 檢測程式碼克隆，包括 Type-1、Type-2 和 Type-3 克隆
 */

import { createHash } from 'crypto';

// 程式碼片段介面
export interface CodeFragment {
  id: string;
  ast: ASTNode;
  tokens: string[];
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
  hash?: string;
}

// 克隆型別介面
export interface Clone {
  type: 'type-1' | 'type-2' | 'type-3';
  instances: CodeFragment[];
  lines: number;
  similarity: number;
  severity: 'low' | 'medium' | 'high';
}

// AST 節點介面
export interface ASTNode {
  type: string;
  value?: string | number;
  children?: ASTNode[];
  normalized?: ASTNode;
}

// 檢測配置介面
export interface DetectionConfig {
  minLines: number;
  minTokens: number;
  similarityThreshold: number;
  ignoreWhitespace: boolean;
  ignoreComments: boolean;
}

/**
 * 計算程式碼片段的平均行數
 */
function calculateAverageLines(fragments: CodeFragment[]): number {
  const totalLines = fragments.reduce((sum, f) =>
    sum + (f.location.endLine - f.location.startLine + 1), 0);
  return Math.round(totalLines / fragments.length);
}

/**
 * Type-1 克隆檢測器（完全相同的代碼，除了空白和註釋）
 */
export class Type1CloneDetector {
  /**
   * 檢測 Type-1 克隆
   * @param fragments 程式碼片段列表
   * @param config 檢測配置
   * @returns Type-1 克隆列表
   */
  detect(fragments: CodeFragment[], config: DetectionConfig): Clone[] {
    const clones: Clone[] = [];
    const hashGroups = new Map<string, CodeFragment[]>();

    // 按 hash 分組
    for (const fragment of fragments) {
      if (fragment.tokens.length < config.minTokens) {
        continue;
      }

      const hash = this.computeHash(fragment, config);

      if (!hashGroups.has(hash)) {
        hashGroups.set(hash, []);
      }
      const group = hashGroups.get(hash);
      if (group) {
        group.push(fragment);
      }
    }

    // 找出重複的組
    for (const group of hashGroups.values()) {
      if (group.length > 1) {
        clones.push({
          type: 'type-1',
          instances: group,
          lines: calculateAverageLines(group),
          similarity: 1.0,
          severity: this.calculateSeverity(group.length, calculateAverageLines(group))
        });
      }
    }

    return clones;
  }

  /**
   * 計算程式碼片段的 hash
   */
  private computeHash(fragment: CodeFragment, config: DetectionConfig): string {
    let tokens = fragment.tokens.slice();

    if (config.ignoreWhitespace) {
      tokens = tokens.filter(token => !/^\s+$/.test(token));
    }

    if (config.ignoreComments) {
      tokens = tokens.filter(token => !token.startsWith('//') && !token.startsWith('/*'));
    }

    const normalized = tokens.join('');
    return createHash('md5').update(normalized).digest('hex');
  }

  private calculateSeverity(instanceCount: number, lines: number): 'low' | 'medium' | 'high' {
    if (instanceCount >= 5 || lines >= 50) {return 'high';}
    if (instanceCount >= 3 || lines >= 20) {return 'medium';}
    return 'low';
  }
}

/**
 * Type-2 克隆檢測器（結構相同但變數名、類型、字面值不同）
 */
export class Type2CloneDetector {
  /**
   * 檢測 Type-2 克隆
   * @param fragments 程式碼片段列表
   * @param config 檢測配置
   * @returns Type-2 克隆列表（僅包含跨檔案重複）
   */
  detect(fragments: CodeFragment[], config: DetectionConfig): Clone[] {
    const clones: Clone[] = [];
    const normalizedGroups = new Map<string, CodeFragment[]>();

    for (const fragment of fragments) {
      if (fragment.tokens.length < config.minTokens) {continue;}

      const normalized = this.normalizeAST(fragment.ast);
      const hash = this.computeNormalizedHash(normalized);

      if (!normalizedGroups.has(hash)) {
        normalizedGroups.set(hash, []);
      }
      const group = normalizedGroups.get(hash);
      if (group) {
        group.push(fragment);
      }
    }

    for (const group of normalizedGroups.values()) {
      if (group.length > 1) {
        // 過濾掉同一檔案內的重複（同一個類的不同方法不應視為重複）
        const crossFileInstances = this.filterCrossFileInstances(group);
        if (crossFileInstances.length > 1) {
          clones.push({
            type: 'type-2',
            instances: crossFileInstances,
            lines: calculateAverageLines(crossFileInstances),
            similarity: this.calculateSimilarity(crossFileInstances),
            severity: this.calculateSeverity(crossFileInstances.length, calculateAverageLines(crossFileInstances))
          });
        }
      }
    }

    return clones;
  }

  /**
   * 過濾掉同一檔案內的實例，只保留跨檔案的重複
   */
  private filterCrossFileInstances(instances: CodeFragment[]): CodeFragment[] {
    const fileGroups = new Map<string, CodeFragment[]>();

    for (const instance of instances) {
      const file = instance.location.file;
      if (!fileGroups.has(file)) {
        fileGroups.set(file, []);
      }
      fileGroups.get(file)!.push(instance);
    }

    // 如果所有實例都在同一個檔案，返回空陣列
    if (fileGroups.size === 1) {
      return [];
    }

    // 每個檔案只保留一個代表
    return Array.from(fileGroups.values()).map(group => group[0]);
  }

  /**
   * 正規化 AST（移除變數名、字面值等）
   */
  private normalizeAST(ast: ASTNode): ASTNode {
    const normalized: ASTNode = {
      type: ast.type
    };

    // 對於變數和字面值，統一為佔位符
    if (ast.type === 'Identifier') {
      normalized.value = '$VAR$';
    } else if (ast.type === 'Literal') {
      normalized.value = '$LITERAL$';
    } else if (ast.value !== undefined) {
      normalized.value = ast.value;
    }

    // 遞歸處理子節點
    if (ast.children) {
      normalized.children = ast.children.map(child => this.normalizeAST(child));
    }

    return normalized;
  }

  /**
   * 計算正規化 AST 的 hash
   */
  private computeNormalizedHash(ast: ASTNode): string {
    const json = JSON.stringify(ast, Object.keys(ast).sort());
    return createHash('md5').update(json).digest('hex');
  }

  private calculateSimilarity(fragments: CodeFragment[]): number {
    // Type-2 克隆的相似度計算
    return 0.85; // 簡化實作
  }

  private calculateSeverity(instanceCount: number, lines: number): 'low' | 'medium' | 'high' {
    if (instanceCount >= 4 || lines >= 40) {return 'high';}
    if (instanceCount >= 3 || lines >= 15) {return 'medium';}
    return 'low';
  }
}

/**
 * Type-3 克隆檢測器（結構相似但有些語句被修改、新增或刪除）
 */
export class Type3CloneDetector {
  private threshold = 0.7; // 預設相似度閾值

  /**
   * 設定相似度閾值
   * @param threshold 相似度閾值（0-1 之間）
   */
  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * 檢測 Type-3 克隆
   * @param fragments 程式碼片段列表
   * @param config 檢測配置
   * @returns Type-3 克隆列表（僅包含跨檔案重複）
   */
  detect(fragments: CodeFragment[], config: DetectionConfig): Clone[] {
    const clones: Clone[] = [];
    const effectiveThreshold = Math.min(config.similarityThreshold, this.threshold);

    // Type-3 檢測需要比較每對片段的相似度
    for (let i = 0; i < fragments.length; i++) {
      for (let j = i + 1; j < fragments.length; j++) {
        // 跳過同一檔案內的片段
        if (fragments[i].location.file === fragments[j].location.file) {
          continue;
        }

        const similarity = this.calculateSimilarity(fragments[i], fragments[j]);

        if (similarity >= effectiveThreshold && similarity < 0.95) { // Type-3 不是完全相同
          clones.push({
            type: 'type-3',
            instances: [fragments[i], fragments[j]],
            lines: Math.max(
              fragments[i].location.endLine - fragments[i].location.startLine + 1,
              fragments[j].location.endLine - fragments[j].location.startLine + 1
            ),
            similarity,
            severity: this.calculateSeverity(similarity, Math.max(
              fragments[i].location.endLine - fragments[i].location.startLine + 1,
              fragments[j].location.endLine - fragments[j].location.startLine + 1
            ))
          });
        }
      }
    }

    return clones;
  }

  /**
   * 計算兩個程式碼片段的相似度
   */
  private calculateSimilarity(fragment1: CodeFragment, fragment2: CodeFragment): number {
    // 使用改進的相似度計算
    return this.calculateAdvancedSimilarity(fragment1, fragment2);
  }

  /**
   * 計算編輯距離（Levenshtein Distance）
   */
  private calculateEditDistance(tokens1: string[], tokens2: string[]): number {
    const m = tokens1.length;
    const n = tokens2.length;

    // 處理空陣列情況
    if (m === 0) {return n;}
    if (n === 0) {return m;}

    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    // 初始化邊界條件
    for (let i = 0; i <= m; i++) {dp[i][0] = i;}
    for (let j = 0; j <= n; j++) {dp[0][j] = j;}

    // 動態規劃計算編輯距離
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (tokens1[i - 1] === tokens2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]; // 無需編輯
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // 刪除
            dp[i][j - 1] + 1,    // 插入
            dp[i - 1][j - 1] + 1 // 替換
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 改進的相似度計算（結合多種指標）
   */
  private calculateAdvancedSimilarity(fragment1: CodeFragment, fragment2: CodeFragment): number {
    const tokens1 = fragment1.tokens;
    const tokens2 = fragment2.tokens;

    if (tokens1.length === 0 && tokens2.length === 0) {return 1.0;}
    if (tokens1.length === 0 || tokens2.length === 0) {return 0.0;}

    // 1. 編輯距離相似度
    const editDistance = this.calculateEditDistance(tokens1, tokens2);
    const maxLength = Math.max(tokens1.length, tokens2.length);
    const editSimilarity = 1 - (editDistance / maxLength);

    // 2. Jaccard 相似度（基於 token 集合）
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    const jaccardSimilarity = intersection.size / union.size;

    // 3. 長度相似度
    const lengthSimilarity = Math.min(tokens1.length, tokens2.length) /
                            Math.max(tokens1.length, tokens2.length);

    // 綜合相似度（加權平均）
    return (editSimilarity * 0.5) + (jaccardSimilarity * 0.3) + (lengthSimilarity * 0.2);
  }

  private calculateSeverity(similarity: number, lines: number): 'low' | 'medium' | 'high' {
    if (similarity >= 0.8 && lines >= 30) {return 'high';}
    if (similarity >= 0.7 && lines >= 15) {return 'medium';}
    return 'low';
  }
}

/**
 * 重複程式碼檢測器主類
 */
export class DuplicationDetector {
  private type1Detector = new Type1CloneDetector();
  private type2Detector = new Type2CloneDetector();
  private type3Detector = new Type3CloneDetector();

  /**
   * 設定 Type-3 檢測的相似度閾值
   */
  setThreshold(threshold: number): void {
    this.type3Detector.setThreshold(threshold);
  }

  /**
   * 檢測程式碼克隆 (兼容舊介面)
   */
  detectClones(fragments: CodeFragment[]): Clone[] {
    const fullConfig: DetectionConfig = {
      minLines: 3,
      minTokens: 5,
      similarityThreshold: 0.7,
      ignoreWhitespace: true,
      ignoreComments: true
    };

    // 直接檢測不同類型的克隆
    const type1Clones = this.type1Detector.detect(fragments, fullConfig);
    const type2Clones = this.type2Detector.detect(fragments, fullConfig);
    const type3Clones = this.type3Detector.detect(fragments, fullConfig);

    return [...type1Clones, ...type2Clones, ...type3Clones];
  }

  /**
   * 檢測檔案中的重複程式碼
   * @param files 檔案路徑列表
   * @param config 檢測配置
   * @returns 重複程式碼檢測結果
   */
  async detect(files: string[], config?: Partial<DetectionConfig>): Promise<Clone[]> {
    // 輸入驗證
    if (!Array.isArray(files)) {
      throw new Error('檔案列表必須是陣列');
    }

    const fullConfig: DetectionConfig = {
      minLines: 3,
      minTokens: 5,
      similarityThreshold: 0.7,
      ignoreWhitespace: true,
      ignoreComments: true,
      ...config
    };

    // 解析所有檔案並提取程式碼片段
    const fragments = await this.extractFragments(files);

    // 檢測不同類型的克隆
    const type1Clones = this.type1Detector.detect(fragments, fullConfig);
    const type2Clones = this.type2Detector.detect(fragments, fullConfig);
    const type3Clones = this.type3Detector.detect(fragments, fullConfig);

    return [...type1Clones, ...type2Clones, ...type3Clones];
  }

  /**
   * 從檔案中提取程式碼片段
   */
  private async extractFragments(files: string[]): Promise<CodeFragment[]> {
    const { readFile } = await import('fs/promises');
    const fragments: CodeFragment[] = [];

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const fileFragments = this.parseFileToFragments(file, content);
        fragments.push(...fileFragments);
      } catch (error) {
        continue;
      }
    }

    return fragments;
  }

  /**
   * 將檔案內容解析為程式碼片段（提取方法和函式）
   */
  private parseFileToFragments(filePath: string, content: string): CodeFragment[] {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('檔案路徑必須是非空字串');
    }

    if (typeof content !== 'string') {
      throw new Error('檔案內容必須是字串');
    }

    const fragments: CodeFragment[] = [];
    const lines = content.split('\n');

    // 提取方法和函式的正則表達式（更寬鬆的匹配）
    const methodRegex = /(\s*)(async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm;
    let match: RegExpExecArray | null;

    while ((match = methodRegex.exec(content)) !== null) {
      const startPos = match.index;
      const startLine = content.substring(0, startPos).split('\n').length;
      const methodName = match[3];

      // 找到方法開始的 { 位置
      const bracePos = startPos + match[0].length - 1;

      // 找到方法的結束位置（配對大括號）
      const endPos = this.findMatchingBrace(content, bracePos);
      if (endPos === -1) {
        continue;
      }

      const endLine = content.substring(0, endPos + 1).split('\n').length;
      const fragmentContent = content.substring(startPos, endPos + 1);
      const lineCount = endLine - startLine + 1;

      // 只處理行數 >= 3 的方法
      if (lineCount >= 3) {
        const tokens = this.tokenize(fragmentContent);

        fragments.push({
          id: `${filePath}:${startLine}:${methodName}`,
          ast: this.parseToAST(fragmentContent),
          tokens,
          location: {
            file: filePath,
            startLine,
            endLine
          }
        });
      }
    }

    // 如果沒有找到方法，回退到按行分割
    if (fragments.length === 0) {
      for (let i = 0; i < lines.length; i += 10) {
        const endLine = Math.min(i + 9, lines.length - 1);
        const fragmentContent = lines.slice(i, endLine + 1).join('\n');

        if (fragmentContent.trim().length > 0) {
          fragments.push({
            id: `${filePath}:${i + 1}-${endLine + 1}`,
            ast: this.parseToAST(fragmentContent),
            tokens: this.tokenize(fragmentContent),
            location: {
              file: filePath,
              startLine: i + 1,
              endLine: endLine + 1
            }
          });
        }
      }
    }

    return fragments;
  }

  /**
   * 找到配對的右大括號
   */
  private findMatchingBrace(content: string, startPos: number): number {
    let braceCount = 1;
    let inString = false;
    let stringChar = '';

    for (let i = startPos + 1; i < content.length; i++) {
      const char = content[i];
      const prevChar = content[i - 1];

      // 處理字串
      if ((char === '"' || char === '\'' || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }

  /**
   * 簡化的 AST 解析
   */
  private parseToAST(content: string): ASTNode {
    // 簡化實作：建立基本的 AST 結構
    return {
      type: 'Program',
      children: content.split('\n').map(line => ({
        type: 'Statement',
        value: line.trim()
      }))
    };
  }

  /**
   * 程式碼分詞
   */
  private tokenize(content: string): string[] {
    // 簡化實作：按空白和操作符分割
    return content
      .split(/(\s+|[(){}[\];,.]|\+|\-|\*|\/|=|!|<|>|&|\|)/)
      .filter(token => token.trim().length > 0);
  }

  /**
   * 獲取重複檢測統計
   */
  async getStatistics(clones: Clone[]): Promise<{
    totalClones: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    averageSimilarity: number;
    totalDuplicatedLines: number;
  }> {
    const byType: Record<string, number> = { 'type-1': 0, 'type-2': 0, 'type-3': 0 };
    const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0 };
    let totalSimilarity = 0;
    let totalLines = 0;

    for (const clone of clones) {
      byType[clone.type]++;
      bySeverity[clone.severity]++;
      totalSimilarity += clone.similarity;
      totalLines += clone.lines * clone.instances.length;
    }

    return {
      totalClones: clones.length,
      byType,
      bySeverity,
      averageSimilarity: clones.length > 0 ? totalSimilarity / clones.length : 0,
      totalDuplicatedLines: totalLines
    };
  }
}