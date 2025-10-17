/**
 * ShitScore 分析器
 * 主服務類別，整合所有分析功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ScoreCalculator } from './score-calculator.js';
import { Grading } from './grading.js';
import type {
  ShitScoreResult,
  ShitScoreOptions,
  ComplexityData,
  MaintainabilityData,
  ArchitectureData,
  ShitItem,
} from './types.js';
import { createDefaultShitScoreOptions } from './types.js';
import { ShitType, SeverityLevel } from './types.js';

/**
 * ShitScore 錯誤
 */
export class ShitScoreError extends Error {
  constructor(message: string, public readonly score: number, public readonly maxAllowed: number) {
    super(message);
    this.name = 'ShitScoreError';
  }
}

/**
 * ShitScore 分析器
 */
export class ShitScoreAnalyzer {
  private readonly calculator: ScoreCalculator;
  private readonly grading: Grading;

  constructor() {
    this.calculator = new ScoreCalculator();
    this.grading = new Grading();
  }

  /**
   * 分析專案的垃圾度
   */
  async analyze(projectPath: string, options: Partial<ShitScoreOptions>): Promise<ShitScoreResult> {
    const fullOptions = { ...createDefaultShitScoreOptions(), ...options };

    const files = await this.collectFiles(projectPath, fullOptions);

    const complexityData = await this.collectComplexityData(files);
    const maintainabilityData = await this.collectMaintainabilityData(files);
    const architectureData = await this.collectArchitectureData(files);

    const { complexityScore, maintainabilityScore, architectureScore, totalScore } =
      this.calculator.calculate(complexityData, maintainabilityData, architectureData);

    const gradeInfo = this.grading.getGrade(totalScore);

    if (fullOptions.maxAllowed !== undefined && totalScore > fullOptions.maxAllowed) {
      throw new ShitScoreError(
        `ShitScore ${totalScore} exceeds maximum allowed ${fullOptions.maxAllowed}`,
        totalScore,
        fullOptions.maxAllowed
      );
    }

    const result: ShitScoreResult = {
      shitScore: totalScore,
      grade: gradeInfo.level,
      gradeInfo,
      dimensions: {
        complexity: complexityScore,
        maintainability: maintainabilityScore,
        architecture: architectureScore,
      },
      summary: {
        totalFiles: files.length,
        analyzedFiles: files.length,
        totalShit: 0,
      },
      analyzedAt: new Date(),
    };

    if (fullOptions.detailed) {
      return this.buildDetailedResult(result, fullOptions, files, complexityData, maintainabilityData, architectureData);
    }

    return result;
  }

  /**
   * 收集專案檔案
   */
  private async collectFiles(projectPath: string, options: ShitScoreOptions): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!options.excludePatterns?.some((pattern) => fullPath.includes(pattern))) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // 忽略無法讀取的目錄
      }
    }

    await walk(projectPath);
    return files;
  }

  /**
   * 收集複雜度資料
   */
  private async collectComplexityData(files: string[]): Promise<ComplexityData> {
    let totalFunctions = 0;
    let highComplexityCount = 0;
    let longFunctionCount = 0;
    let deepNestingCount = 0;
    let tooManyParamsCount = 0;

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const functionMatches = content.match(/function\s+\w+|=>\s*{|async\s+\w+/g) || [];
        totalFunctions += functionMatches.length;

        for (const match of functionMatches) {
          const functionStart = content.indexOf(match);
          const functionContent = this.extractFunctionContent(content, functionStart);

          const complexity = this.calculateComplexity(functionContent);
          if (complexity > 10) {
            highComplexityCount++;
          }

          const lines = functionContent.split('\n').length;
          if (lines > 100) {
            longFunctionCount++;
          }

          const nesting = this.calculateNesting(functionContent);
          if (nesting > 4) {
            deepNestingCount++;
          }

          const params = this.countParameters(match);
          if (params > 5) {
            tooManyParamsCount++;
          }
        }
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    return {
      totalFunctions,
      highComplexityCount,
      longFunctionCount,
      deepNestingCount,
      tooManyParamsCount,
    };
  }

  /**
   * 收集維護性資料
   */
  private async collectMaintainabilityData(files: string[]): Promise<MaintainabilityData> {
    let deadCodeCount = 0;
    let largeFileCount = 0;

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').length;

        if (lines > 500) {
          largeFileCount++;
        }

        const hasUnused = /unused|@ts-ignore|eslint-disable/.test(content);
        if (hasUnused) {
          deadCodeCount++;
        }
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    return {
      totalFiles: files.length,
      deadCodeCount,
      largeFileCount,
      duplicateCodeCount: 0,
    };
  }

  /**
   * 收集架構資料
   */
  private async collectArchitectureData(files: string[]): Promise<ArchitectureData> {
    const dependencies = new Map<string, Set<string>>();

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const imports = content.match(/import\s+.*from\s+['"](.+)['"]/g) || [];
        const deps = new Set<string>();

        for (const imp of imports) {
          const match = imp.match(/from\s+['"](.+)['"]/);
          if (match && match[1].startsWith('.')) {
            deps.add(match[1]);
          }
        }

        dependencies.set(file, deps);
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    const cycles = this.detectCycles(dependencies);
    const orphanCount = this.countOrphans(dependencies);
    const highCouplingCount = this.countHighCoupling(dependencies);

    return {
      totalFiles: files.length,
      circularDependencyCount: cycles,
      orphanFileCount: orphanCount,
      highCouplingCount,
    };
  }

  /**
   * 建立詳細結果
   */
  private buildDetailedResult(baseResult: ShitScoreResult, options: ShitScoreOptions, files: string[], complexity: ComplexityData, maintainability: MaintainabilityData, architecture: ArchitectureData): ShitScoreResult {
    const topShit = this.extractTopShit(files, complexity, maintainability, architecture, options.topCount);
    const recommendations = this.grading.generateRecommendations(
      baseResult.dimensions.complexity,
      baseResult.dimensions.maintainability,
      baseResult.dimensions.architecture
    );

    return {
      ...baseResult,
      topShit,
      recommendations,
      summary: {
        ...baseResult.summary,
        totalShit: topShit.length,
      },
    };
  }

  /**
   * 提取最嚴重的垃圾項目
   */
  private extractTopShit(files: string[], complexity: ComplexityData, maintainability: MaintainabilityData, architecture: ArchitectureData, topCount: number): readonly ShitItem[] {
    const items: ShitItem[] = [];

    // 簡化實作：根據各維度的問題數量生成垃圾項目
    if (complexity.highComplexityCount > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.HighComplexity,
        severity: SeverityLevel.High,
        score: 80,
        description: '函式複雜度過高',
      });
    }

    if (maintainability.largeFileCount > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.LargeFile,
        severity: SeverityLevel.Medium,
        score: 60,
        description: '檔案過大',
      });
    }

    if (architecture.circularDependencyCount > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.CircularDependency,
        severity: SeverityLevel.Critical,
        score: 90,
        description: '循環依賴',
      });
    }

    return items.slice(0, topCount);
  }

  /**
   * 提取函式內容
   */
  private extractFunctionContent(content: string, start: number): string {
    let braceCount = 0;
    let inFunction = false;
    let result = '';

    for (let i = start; i < content.length; i++) {
      const char = content[i];
      result += char;

      if (char === '{') {
        braceCount++;
        inFunction = true;
      } else if (char === '}') {
        braceCount--;
        if (inFunction && braceCount === 0) {
          break;
        }
      }
    }

    return result;
  }

  /**
   * 計算複雜度
   */
  private calculateComplexity(content: string): number {
    let complexity = 1;
    complexity += (content.match(/if\s*\(/g) || []).length;
    complexity += (content.match(/for\s*\(/g) || []).length;
    complexity += (content.match(/while\s*\(/g) || []).length;
    complexity += (content.match(/\|\|/g) || []).length;
    complexity += (content.match(/&&/g) || []).length;
    return complexity;
  }

  /**
   * 計算巢狀深度
   */
  private calculateNesting(content: string): number {
    let maxNesting = 0;
    let currentNesting = 0;

    for (const char of content) {
      if (char === '{') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}') {
        currentNesting--;
      }
    }

    return maxNesting;
  }

  /**
   * 計算參數數量
   */
  private countParameters(functionSignature: string): number {
    const match = functionSignature.match(/\(([^)]*)\)/);
    if (!match || !match[1].trim()) {
      return 0;
    }
    return match[1].split(',').length;
  }

  /**
   * 檢測循環依賴
   */
  private detectCycles(dependencies: Map<string, Set<string>>): number {
    // 簡化實作：檢查互相引用
    let cycles = 0;
    for (const [file, deps] of dependencies.entries()) {
      for (const dep of deps) {
        const depDeps = dependencies.get(dep);
        if (depDeps && depDeps.has(file)) {
          cycles++;
        }
      }
    }
    return Math.floor(cycles / 2); // 除以 2 因為每個循環被計算了兩次
  }

  /**
   * 計算孤立檔案數量
   */
  private countOrphans(dependencies: Map<string, Set<string>>): number {
    let orphans = 0;
    for (const [file, deps] of dependencies.entries()) {
      if (deps.size === 0) {
        let isDependent = false;
        for (const [, otherDeps] of dependencies.entries()) {
          if (otherDeps.has(file)) {
            isDependent = true;
            break;
          }
        }
        if (!isDependent) {
          orphans++;
        }
      }
    }
    return orphans;
  }

  /**
   * 計算高耦合檔案數量
   */
  private countHighCoupling(dependencies: Map<string, Set<string>>): number {
    let highCoupling = 0;
    for (const [, deps] of dependencies.entries()) {
      if (deps.size > 10) {
        highCoupling++;
      }
    }
    return highCoupling;
  }
}
