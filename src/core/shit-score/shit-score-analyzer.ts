/**
 * ShitScore 分析器
 * 主服務類別，整合所有分析功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ScoreCalculator } from './score-calculator.js';
import { Grading } from './grading.js';
import { QualityAssuranceCollector } from './collectors/quality-assurance-collector.js';
import { TypeSafetyChecker } from './collectors/type-safety-checker.js';
import { TestCoverageChecker } from './collectors/test-coverage-checker.js';
import { ErrorHandlingChecker } from './collectors/error-handling-checker.js';
import { NamingChecker } from './collectors/naming-checker.js';
import { SecurityChecker } from './collectors/security-checker.js';
import { DuplicationDetector } from '../analysis/duplication-detector.js';
import type {
  ShitScoreResult,
  ShitScoreOptions,
  ComplexityData,
  MaintainabilityData,
  ArchitectureData,
  QualityAssuranceData,
  ShitItem,
  DetailedFiles,
  FileDetail,
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
  private readonly qualityAssuranceCollector: QualityAssuranceCollector;
  private readonly duplicationDetector: DuplicationDetector;

  constructor() {
    this.calculator = new ScoreCalculator();
    this.grading = new Grading();
    this.qualityAssuranceCollector = new QualityAssuranceCollector(
      new TypeSafetyChecker(),
      new TestCoverageChecker(),
      new ErrorHandlingChecker(),
      new NamingChecker(),
      new SecurityChecker()
    );
    this.duplicationDetector = new DuplicationDetector();
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
    const qualityAssuranceData = await this.qualityAssuranceCollector.collect(files, projectPath);

    const { complexityScore, maintainabilityScore, architectureScore, qualityAssuranceScore, totalScore } =
      this.calculator.calculate(complexityData, maintainabilityData, architectureData, qualityAssuranceData);

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
        qualityAssurance: qualityAssuranceScore,
      },
      summary: {
        totalFiles: files.length,
        analyzedFiles: files.length,
        totalShit: 0,
      },
      analyzedAt: new Date(),
    };

    if (fullOptions.detailed || fullOptions.showFiles) {
      return await this.buildDetailedResult(result, fullOptions, files, complexityData, maintainabilityData, architectureData, qualityAssuranceData);
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
      } catch {
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

    // 檢測重複代碼
    const clones = await this.duplicationDetector.detect(files, {
      minLines: 3,
      minTokens: 5,
      similarityThreshold: 0.7,
    });

    const duplicateCodeCount = clones.length;

    return {
      totalFiles: files.length,
      deadCodeCount,
      largeFileCount,
      duplicateCodeCount,
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
  private async buildDetailedResult(baseResult: ShitScoreResult, options: ShitScoreOptions, files: string[], complexity: ComplexityData, maintainability: MaintainabilityData, architecture: ArchitectureData, qualityAssurance: QualityAssuranceData): Promise<ShitScoreResult> {
    const topShit = this.extractTopShit(files, complexity, maintainability, architecture, qualityAssurance, options.topCount);
    const recommendations = this.grading.generateRecommendations(
      baseResult.dimensions.complexity,
      baseResult.dimensions.maintainability,
      baseResult.dimensions.architecture,
      baseResult.dimensions.qualityAssurance
    );

    const result: ShitScoreResult = {
      ...baseResult,
      topShit,
      recommendations,
      summary: {
        ...baseResult.summary,
        totalShit: topShit.length,
      },
    };

    if (options.showFiles) {
      const detailedFiles = await this.collectDetailedFiles(files);
      return {
        ...result,
        detailedFiles,
      };
    }

    return result;
  }

  /**
   * 提取最嚴重的垃圾項目
   */
  private extractTopShit(files: string[], complexity: ComplexityData, maintainability: MaintainabilityData, architecture: ArchitectureData, qualityAssurance: QualityAssuranceData, topCount: number): readonly ShitItem[] {
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

    if (qualityAssurance.typeSafetyIssues > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.TypeSafety,
        severity: SeverityLevel.High,
        score: 75,
        description: '檢測到 any 型別、@ts-ignore 或 type assertions',
      });
    }

    if (qualityAssurance.testCoverageRatio < 0.5) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.LowTestCoverage,
        severity: SeverityLevel.Medium,
        score: 65,
        description: '測試覆蓋率不足',
      });
    }

    if (qualityAssurance.errorHandlingIssues > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.PoorErrorHandling,
        severity: SeverityLevel.High,
        score: 70,
        description: '錯誤處理問題',
      });
    }

    if (qualityAssurance.namingIssues > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.NamingViolation,
        severity: SeverityLevel.Low,
        score: 50,
        description: '命名規範違反',
      });
    }

    if (qualityAssurance.securityIssues > 0) {
      items.push({
        filePath: files[0] || '',
        type: ShitType.SecurityRisk,
        severity: SeverityLevel.Critical,
        score: 95,
        description: '安全性風險',
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

  /**
   * 收集詳細檔案列表
   */
  private async collectDetailedFiles(files: string[]): Promise<DetailedFiles> {
    const typeSafetyFiles: FileDetail[] = [];
    const testCoverageFiles: FileDetail[] = [];
    const errorHandlingFiles: FileDetail[] = [];
    const namingViolationFiles: FileDetail[] = [];
    const securityRiskFiles: FileDetail[] = [];
    const duplicateCodeFiles: FileDetail[] = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').length;

        // 檢測型別安全問題
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          const anyMatches = content.match(/:\s*any\b/g);
          const tsIgnoreMatches = content.match(/@ts-ignore/g);
          const asAnyMatches = content.match(/as\s+any\b|<any>/g);

          const anyCount = (anyMatches?.length || 0) + (tsIgnoreMatches?.length || 0) * 2 + (asAnyMatches?.length || 0) * 1.5;

          if (anyCount > 0) {
            typeSafetyFiles.push({
              path: file,
              lines,
              anyTypeCount: anyMatches?.length || 0,
              tsIgnoreCount: tsIgnoreMatches?.length || 0,
            });
          }
        }

        // 檢測錯誤處理問題
        const emptyCatchMatches = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
        if (emptyCatchMatches && emptyCatchMatches.length > 0) {
          errorHandlingFiles.push({
            path: file,
            lines,
            emptyCatchCount: emptyCatchMatches.length,
          });
        }

        // 檢測命名問題
        const underscoreVarMatches = content.match(/(const|let|var)\s+_[a-zA-Z]/g);
        if (underscoreVarMatches && underscoreVarMatches.length > 0) {
          namingViolationFiles.push({
            path: file,
            lines,
            namingIssues: underscoreVarMatches.length,
          });
        }

        // 檢測安全問題
        const hardcodedPasswordMatches = content.match(/password\s*=\s*['"][^'"]+['"]/gi);
        const evalMatches = content.match(/\beval\s*\(/g);
        const innerHTMLMatches = content.match(/\.innerHTML\s*=/g);

        const securityIssueCount =
          (hardcodedPasswordMatches?.length || 0) * 5 +
          (evalMatches?.length || 0) * 5 +
          (innerHTMLMatches?.length || 0) * 3;

        if (securityIssueCount > 0) {
          securityRiskFiles.push({
            path: file,
            lines,
            securityIssues: securityIssueCount,
          });
        }
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    // 檢測測試覆蓋率
    const sourceFiles = files.filter(
      (f) =>
        !f.match(/\.test\.|\.spec\.|\.e2e\.test\./) &&
        !f.includes('/tests/') &&
        !f.includes('/__tests__/') &&
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
    );

    for (const file of sourceFiles) {
      testCoverageFiles.push({
        path: file,
        testCoverageRatio: 0, // 簡化實作：標記為無測試
      });
    }

    // 檢測重複代碼
    const clones = await this.duplicationDetector.detect(files, {
      minLines: 3,
      minTokens: 5,
      similarityThreshold: 0.7,
    });

    for (const clone of clones) {
      for (const instance of clone.instances) {
        duplicateCodeFiles.push({
          path: instance.location.file,
          location: {
            start: instance.location.startLine,
            end: instance.location.endLine,
          },
        });
      }
    }

    return {
      complexity: {
        highComplexity: [],
        longFunction: [],
        deepNesting: [],
        tooManyParams: [],
      },
      maintainability: {
        deadCode: [],
        largeFile: [],
        duplicateCode: duplicateCodeFiles,
      },
      architecture: {
        orphanFile: [],
        highCoupling: [],
        circularDependency: [],
      },
      qualityAssurance: {
        typeSafety: typeSafetyFiles,
        testCoverage: testCoverageFiles,
        errorHandling: errorHandlingFiles,
        namingViolation: namingViolationFiles,
        securityRisk: securityRiskFiles,
      },
    };
  }
}
