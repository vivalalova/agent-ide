/**
 * 模式檢測器
 * 檢測常見的樣板代碼模式（try-catch、logger、constructor DI 等）
 */

import { readFile } from 'fs/promises';

/**
 * 模式類型
 */
export enum PatternType {
  TryCatch = 'try-catch',
  LoggerInit = 'logger-init',
  ConstructorDI = 'constructor-di',
  EnvVar = 'env-var',
  ConfigObject = 'config-object'
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
 * 模式群組（相似的模式實例）
 */
export interface PatternGroup {
  readonly type: PatternType;
  readonly instances: readonly PatternMatch[];
  readonly count: number;
  readonly recommendation: string;
}

/**
 * 模式檢測器主類
 */
export class PatternDetector {
  /**
   * 檢測所有模式
   */
  async detectAll(files: string[]): Promise<Map<PatternType, PatternGroup>> {
    const results = new Map<PatternType, PatternGroup>();

    const tryCatchMatches = await this.detectTryCatchBoilerplate(files);
    if (tryCatchMatches.length > 0) {
      results.set(PatternType.TryCatch, {
        type: PatternType.TryCatch,
        instances: tryCatchMatches,
        count: tryCatchMatches.length,
        recommendation: '建議使用裝飾器 @HandleError() 或 Interceptor 統一處理錯誤'
      });
    }

    const loggerMatches = await this.detectLoggerInit(files);
    if (loggerMatches.length > 0) {
      results.set(PatternType.LoggerInit, {
        type: PatternType.LoggerInit,
        instances: loggerMatches,
        count: loggerMatches.length,
        recommendation: '建議使用依賴注入或 @InjectLogger() 裝飾器統一注入 logger'
      });
    }

    const constructorMatches = await this.detectConstructorDI(files);
    if (constructorMatches.length > 0) {
      results.set(PatternType.ConstructorDI, {
        type: PatternType.ConstructorDI,
        instances: constructorMatches,
        count: constructorMatches.length,
        recommendation: '建構函式依賴注入是標準模式，保持現狀即可'
      });
    }

    const envVarMatches = await this.detectEnvVarAccess(files);
    if (envVarMatches.length > 0) {
      results.set(PatternType.EnvVar, {
        type: PatternType.EnvVar,
        instances: envVarMatches,
        count: envVarMatches.length,
        recommendation: '建議使用 ConfigService 統一管理環境變數，避免直接存取 process.env'
      });
    }

    const configMatches = await this.detectConfigObject(files);
    if (configMatches.length > 0) {
      results.set(PatternType.ConfigObject, {
        type: PatternType.ConfigObject,
        instances: configMatches,
        count: configMatches.length,
        recommendation: '建議提取配置物件到獨立的 config 檔案，遵循單一真實來源原則'
      });
    }

    return results;
  }

  /**
   * 檢測 try-catch 樣板代碼
   */
  async detectTryCatchBoilerplate(files: string[]): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const tryCatchRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}/g;

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        let match: RegExpExecArray | null;

        while ((match = tryCatchRegex.exec(content)) !== null) {
          const startLine = this.getLineNumber(content, match.index);
          const endLine = this.getLineNumber(content, match.index + match[0].length);

          matches.push({
            type: PatternType.TryCatch,
            file,
            startLine,
            endLine,
            code: match[0],
            similarity: 0.8
          });
        }
      } catch {
        continue;
      }
    }

    // 分組相似的 try-catch 區塊
    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測 Logger 初始化模式
   */
  async detectLoggerInit(files: string[]): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const loggerRegex = /(private|protected|public)?\s*(readonly)?\s*logger\s*=\s*new\s+Logger\([^)]*\)/g;

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        let match: RegExpExecArray | null;

        while ((match = loggerRegex.exec(content)) !== null) {
          const lineNumber = this.getLineNumber(content, match.index);

          matches.push({
            type: PatternType.LoggerInit,
            file,
            startLine: lineNumber,
            endLine: lineNumber,
            code: match[0],
            similarity: 0.9
          });
        }
      } catch {
        continue;
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測建構函式依賴注入模式
   */
  async detectConstructorDI(files: string[]): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const constructorRegex = /constructor\s*\([^)]*\)\s*\{/g;

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        let match: RegExpExecArray | null;

        while ((match = constructorRegex.exec(content)) !== null) {
          const lineNumber = this.getLineNumber(content, match.index);

          // 檢查是否有 private/protected/public 參數（DI 模式）
          const constructorParams = match[0];
          if (/(private|protected|public)\s+(readonly\s+)?\w+/.test(constructorParams)) {
            matches.push({
              type: PatternType.ConstructorDI,
              file,
              startLine: lineNumber,
              endLine: lineNumber,
              code: match[0],
              similarity: 0.85
            });
          }
        }
      } catch {
        continue;
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測環境變數存取模式
   */
  async detectEnvVarAccess(files: string[]): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const envVarRegex = /process\.env\.\w+(\s*\|\|\s*['"][^'"]*['"])?/g;

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        let match: RegExpExecArray | null;

        while ((match = envVarRegex.exec(content)) !== null) {
          const lineNumber = this.getLineNumber(content, match.index);

          matches.push({
            type: PatternType.EnvVar,
            file,
            startLine: lineNumber,
            endLine: lineNumber,
            code: match[0],
            similarity: 0.8
          });
        }
      } catch {
        continue;
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 檢測配置物件模式
   */
  async detectConfigObject(files: string[]): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];
    const configKeywords = ['host', 'port', 'database', 'uri', 'url', 'connection'];

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // 檢查是否包含多個配置關鍵字
          const keywordCount = configKeywords.filter(keyword =>
            line.includes(`${keyword}:`) || line.includes(`${keyword} =`)
          ).length;

          if (keywordCount >= 2 && line.includes('{')) {
            const startPos = content.indexOf(lines.slice(0, i + 1).join('\n'));
            const braceIndex = line.indexOf('{');

            matches.push({
              type: PatternType.ConfigObject,
              file,
              startLine: i + 1,
              endLine: i + 1,
              code: line,
              similarity: 0.75
            });
          }
        }
      } catch {
        continue;
      }
    }

    return this.groupSimilarPatterns(matches);
  }

  /**
   * 分組相似的模式（過濾重複、計算相似度）
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
   * 取得字串在內容中的行號
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * 取得模式檢測統計
   */
  async getStatistics(patterns: Map<PatternType, PatternGroup>): Promise<{
    totalPatterns: number;
    byType: Record<string, number>;
    recommendations: string[];
  }> {
    const byType: Record<string, number> = {};
    const recommendations: string[] = [];
    let totalPatterns = 0;

    for (const [type, group] of patterns.entries()) {
      byType[type] = group.count;
      totalPatterns += group.count;
      if (group.count > 1) {
        recommendations.push(`${type}: ${group.recommendation}`);
      }
    }

    return {
      totalPatterns,
      byType,
      recommendations
    };
  }
}
