/**
 * Swift 設計模式檢測器
 * 檢測 Swift 設計模式和 SwiftUI 樣板
 */

/**
 * 模式類型
 */
export enum PatternType {
  Singleton = 'singleton',
  Factory = 'factory',
  Coordinator = 'coordinator',
  MVVM = 'mvvm',
  ProtocolWitness = 'protocol-witness',
  ViewBuilder = 'view-builder',
  StateManagement = 'state-management'
}

/**
 * 模式匹配結果
 */
export interface PatternMatch {
  readonly type: PatternType;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly code: string;
  readonly similarity: number;
}

/**
 * 模式群組
 */
export interface PatternGroup {
  readonly type: PatternType;
  readonly instances: readonly PatternMatch[];
  readonly count: number;
  readonly recommendation: string;
}

/**
 * Swift 模式檢測器
 */
export class PatternDetector {
  /**
   * 檢測所有模式
   */
  async detectAll(files: string[], fileContents: Map<string, string>): Promise<Map<PatternType, PatternGroup>> {
    const results = new Map<PatternType, PatternGroup>();

    // Singleton 模式
    const singletonMatches = await this.detectSingleton(files, fileContents);
    if (singletonMatches.length > 0) {
      results.set(PatternType.Singleton, {
        type: PatternType.Singleton,
        instances: singletonMatches,
        count: singletonMatches.length,
        recommendation: 'Singleton 模式適合全域共用資源，但要注意測試困難度'
      });
    }

    // Factory 模式
    const factoryMatches = await this.detectFactory(files, fileContents);
    if (factoryMatches.length > 0) {
      results.set(PatternType.Factory, {
        type: PatternType.Factory,
        instances: factoryMatches,
        count: factoryMatches.length,
        recommendation: 'Factory 模式良好分離物件創建邏輯'
      });
    }

    // MVVM 模式
    const mvvmMatches = await this.detectMVVM(files, fileContents);
    if (mvvmMatches.length > 0) {
      results.set(PatternType.MVVM, {
        type: PatternType.MVVM,
        instances: mvvmMatches,
        count: mvvmMatches.length,
        recommendation: 'MVVM 是 SwiftUI 推薦架構'
      });
    }

    // SwiftUI ViewBuilder
    const viewBuilderMatches = await this.detectViewBuilder(files, fileContents);
    if (viewBuilderMatches.length > 0) {
      results.set(PatternType.ViewBuilder, {
        type: PatternType.ViewBuilder,
        instances: viewBuilderMatches,
        count: viewBuilderMatches.length,
        recommendation: '@ViewBuilder 用於建構複雜 View 層級'
      });
    }

    // State Management
    const stateMatches = await this.detectStateManagement(files, fileContents);
    if (stateMatches.length > 0) {
      results.set(PatternType.StateManagement, {
        type: PatternType.StateManagement,
        instances: stateMatches,
        count: stateMatches.length,
        recommendation: '使用適當的 property wrapper 管理狀態'
      });
    }

    return results;
  }

  /**
   * 檢測 Singleton 模式
   */
  private async detectSingleton(files: string[], fileContents: Map<string, string>): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const singletonRegex = /static\s+let\s+shared\s*=\s*\w+\s*\(\)/g;

    for (const file of files) {
      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = singletonRegex.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);

        matches.push({
          type: PatternType.Singleton,
          file,
          startLine: lineNumber,
          endLine: lineNumber,
          code: match[0],
          similarity: 0.95
        });
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測 Factory 模式
   */
  private async detectFactory(files: string[], fileContents: Map<string, string>): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const factoryRegex = /func\s+make\w+\s*\([^)]*\)\s*->\s*\w+/g;

    for (const file of files) {
      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = factoryRegex.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);

        matches.push({
          type: PatternType.Factory,
          file,
          startLine: lineNumber,
          endLine: lineNumber,
          code: match[0],
          similarity: 0.9
        });
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測 MVVM 模式
   */
  private async detectMVVM(files: string[], fileContents: Map<string, string>): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const viewModelRegex = /class\s+\w+ViewModel\s*:\s*ObservableObject/g;

    for (const file of files) {
      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = viewModelRegex.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);

        matches.push({
          type: PatternType.MVVM,
          file,
          startLine: lineNumber,
          endLine: lineNumber,
          code: match[0],
          similarity: 0.95
        });
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測 ViewBuilder 模式
   */
  private async detectViewBuilder(files: string[], fileContents: Map<string, string>): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const viewBuilderRegex = /@ViewBuilder\s+(var|func)/g;

    for (const file of files) {
      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = viewBuilderRegex.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);

        matches.push({
          type: PatternType.ViewBuilder,
          file,
          startLine: lineNumber,
          endLine: lineNumber,
          code: match[0],
          similarity: 1.0
        });
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測 State Management 模式
   */
  private async detectStateManagement(files: string[], fileContents: Map<string, string>): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const statePatterns = [
      /@State\s+/g,
      /@Published\s+/g,
      /@Binding\s+/g,
      /@ObservedObject\s+/g,
      /@StateObject\s+/g,
      /@EnvironmentObject\s+/g
    ];

    for (const file of files) {
      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      for (const pattern of statePatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          const lineNumber = this.getLineNumber(content, match.index);

          matches.push({
            type: PatternType.StateManagement,
            file,
            startLine: lineNumber,
            endLine: lineNumber,
            code: match[0],
            similarity: 0.9
          });
        }
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 分組相似的模式
   */
  private groupSimilarPatterns(matches: PatternMatch[]): PatternMatch[] {
    const seen = new Set<string>();
    const grouped: PatternMatch[] = [];

    for (const match of matches) {
      const key = `${match.file}:${match.startLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        grouped.push(match);
      }
    }

    return grouped;
  }

  /**
   * 取得行號
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }
}

/**
 * 預設導出檢測函式
 */
export default async function detectPatterns(
  files: string[],
  fileContents: Map<string, string>
): Promise<Map<PatternType, PatternGroup>> {
  const detector = new PatternDetector();
  return detector.detectAll(files, fileContents);
}
