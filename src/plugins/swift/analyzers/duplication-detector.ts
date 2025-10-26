/**
 * Swift 重複程式碼檢測器
 * 檢測重複的方法和閉包
 */

import { createHash } from 'crypto';

/**
 * 程式碼片段
 */
export interface CodeFragment {
  id: string;
  code: string;
  tokens: string[];
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
  hash?: string;
}

/**
 * 克隆型別
 */
export interface Clone {
  type: 'type-1' | 'type-2' | 'type-3';
  instances: CodeFragment[];
  lines: number;
  similarity: number;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Swift 重複程式碼檢測器
 */
export class DuplicationDetector {
  /**
   * 檢測重複程式碼
   * @param filePath 檔案路徑
   * @param code Swift 程式碼
   * @returns 克隆列表
   */
  async detect(filePath: string, code: string): Promise<Clone[]> {
    const fragments = this.extractFragments(filePath, code);

    if (fragments.length < 2) {
      return [];
    }

    const clones: Clone[] = [];

    // Type-1: 完全相同的程式碼
    clones.push(...this.detectType1Clones(fragments));

    // Type-2: 結構相同但變數名不同
    clones.push(...this.detectType2Clones(fragments));

    // Type-3: 結構相似但有修改
    clones.push(...this.detectType3Clones(fragments));

    return clones;
  }

  /**
   * 提取程式碼片段（方法和閉包）
   */
  private extractFragments(filePath: string, code: string): CodeFragment[] {
    const fragments: CodeFragment[] = [];

    // 提取函式
    const funcRegex = /func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+)?(?:->\s*[^{]+)?\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = funcRegex.exec(code)) !== null) {
      const funcName = match[1];
      const startPos = match.index;
      const startLine = code.substring(0, startPos).split('\n').length;
      const bracePos = startPos + match[0].length - 1;
      const endPos = this.findMatchingBrace(code, bracePos);

      if (endPos !== -1) {
        const endLine = code.substring(0, endPos + 1).split('\n').length;
        const fragmentCode = code.substring(startPos, endPos + 1);
        const lineCount = endLine - startLine + 1;

        // 只處理 >= 3 行的方法
        if (lineCount >= 3) {
          fragments.push({
            id: `${filePath}:${startLine}:${funcName}`,
            code: fragmentCode,
            tokens: this.tokenize(fragmentCode),
            location: {
              file: filePath,
              startLine,
              endLine
            }
          });
        }
      }
    }

    // 提取閉包
    const closureRegex = /\{[^}]*in\s/g;
    while ((match = closureRegex.exec(code)) !== null) {
      const startPos = match.index;
      const startLine = code.substring(0, startPos).split('\n').length;
      const endPos = this.findMatchingBrace(code, startPos);

      if (endPos !== -1) {
        const endLine = code.substring(0, endPos + 1).split('\n').length;
        const fragmentCode = code.substring(startPos, endPos + 1);
        const lineCount = endLine - startLine + 1;

        if (lineCount >= 3) {
          fragments.push({
            id: `${filePath}:${startLine}:closure`,
            code: fragmentCode,
            tokens: this.tokenize(fragmentCode),
            location: {
              file: filePath,
              startLine,
              endLine
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

      if ((char === '"' || char === '\'') && prevChar !== '\\') {
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
   * 程式碼分詞
   */
  private tokenize(code: string): string[] {
    return code
      .split(/(\s+|[(){}[\];,.]|\+|\-|\*|\/|=|!|<|>|&|\|)/)
      .filter(token => token.trim().length > 0)
      .filter(token => !token.startsWith('//') && !token.startsWith('/*'));
  }

  /**
   * 檢測 Type-1 克隆（完全相同）
   */
  private detectType1Clones(fragments: CodeFragment[]): Clone[] {
    const clones: Clone[] = [];
    const hashGroups = new Map<string, CodeFragment[]>();

    for (const fragment of fragments) {
      const hash = this.computeHash(fragment.code);
      fragment.hash = hash;

      if (!hashGroups.has(hash)) {
        hashGroups.set(hash, []);
      }
      hashGroups.get(hash)!.push(fragment);
    }

    for (const group of Array.from(hashGroups.values())) {
      if (group.length > 1) {
        clones.push({
          type: 'type-1',
          instances: group,
          lines: this.calculateAverageLines(group),
          similarity: 1.0,
          severity: this.calculateSeverity(group.length, this.calculateAverageLines(group))
        });
      }
    }

    return clones;
  }

  /**
   * 檢測 Type-2 克隆（結構相同但變數名不同）
   */
  private detectType2Clones(fragments: CodeFragment[]): Clone[] {
    const clones: Clone[] = [];
    const normalizedGroups = new Map<string, CodeFragment[]>();

    for (const fragment of fragments) {
      const normalized = this.normalizeCode(fragment.code);
      const hash = this.computeHash(normalized);

      if (!normalizedGroups.has(hash)) {
        normalizedGroups.set(hash, []);
      }
      normalizedGroups.get(hash)!.push(fragment);
    }

    for (const group of Array.from(normalizedGroups.values())) {
      if (group.length > 1) {
        // 過濾掉已經在 Type-1 中的
        const uniqueHashes = new Set(group.map(f => f.hash));
        if (uniqueHashes.size > 1) {
          clones.push({
            type: 'type-2',
            instances: group,
            lines: this.calculateAverageLines(group),
            similarity: 0.85,
            severity: this.calculateSeverity(group.length, this.calculateAverageLines(group))
          });
        }
      }
    }

    return clones;
  }

  /**
   * 檢測 Type-3 克隆（結構相似但有修改）
   */
  private detectType3Clones(fragments: CodeFragment[]): Clone[] {
    const clones: Clone[] = [];

    for (let i = 0; i < fragments.length; i++) {
      for (let j = i + 1; j < fragments.length; j++) {
        const similarity = this.calculateSimilarity(fragments[i], fragments[j]);

        if (similarity >= 0.7 && similarity < 0.95) {
          clones.push({
            type: 'type-3',
            instances: [fragments[i], fragments[j]],
            lines: Math.max(
              fragments[i].location.endLine - fragments[i].location.startLine + 1,
              fragments[j].location.endLine - fragments[j].location.startLine + 1
            ),
            similarity,
            severity: this.calculateSeverity(2, Math.max(
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
   * 計算 hash
   */
  private computeHash(code: string): string {
    const normalized = code.replace(/\s+/g, ' ').trim();
    return createHash('md5').update(normalized).digest('hex');
  }

  /**
   * 正規化程式碼（移除變數名）
   */
  private normalizeCode(code: string): string {
    return code
      .replace(/\b[a-z][a-zA-Z0-9]*\b/g, '$VAR$')
      .replace(/\b\d+\b/g, '$NUM$')
      .replace(/"[^"]*"/g, '$STR$')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 計算相似度
   */
  private calculateSimilarity(frag1: CodeFragment, frag2: CodeFragment): number {
    const tokens1 = frag1.tokens;
    const tokens2 = frag2.tokens;

    if (tokens1.length === 0 || tokens2.length === 0) {
      return 0;
    }

    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
    const union = new Set([...Array.from(set1), ...Array.from(set2)]);

    return intersection.size / union.size;
  }

  /**
   * 計算平均行數
   */
  private calculateAverageLines(fragments: CodeFragment[]): number {
    const totalLines = fragments.reduce((sum, f) =>
      sum + (f.location.endLine - f.location.startLine + 1), 0);
    return Math.round(totalLines / fragments.length);
  }

  /**
   * 計算嚴重性
   */
  private calculateSeverity(instanceCount: number, lines: number): 'low' | 'medium' | 'high' {
    if (instanceCount >= 5 || lines >= 50) {
      return 'high';
    }
    if (instanceCount >= 3 || lines >= 20) {
      return 'medium';
    }
    return 'low';
  }
}

/**
 * 預設導出檢測函式
 */
export default async function detectDuplication(
  filePath: string,
  code: string
): Promise<Clone[]> {
  const detector = new DuplicationDetector();
  return detector.detect(filePath, code);
}
