/**
 * Analyze 命令
 * 分析程式碼品質
 */

import type { Command } from 'commander';
import * as path from 'path';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import type { CommandContext } from './types.js';

/** Analyze 命令選項 */
interface AnalyzeOptions {
  path: string;
  pattern?: string;
  format: string;
  all: boolean;
}

/**
 * 設定 analyze 命令
 */
export function setupAnalyzeCommand(program: Command, context: CommandContext): void {
  program
    .command('analyze [type]')
    .description('分析程式碼品質')
    .option('-p, --path <path>', '分析路徑', '.')
    .option('--pattern <pattern>', '分析模式')
    .option('--format <format>', '輸出格式 (json|table|summary)', 'summary')
    .option('--all', '顯示所有掃描結果（預設只顯示有問題的項目）', false)
    .action(async (type: string | undefined, options: AnalyzeOptions) => {
      await handleAnalyzeCommand(type, options, context);
    });
}

/**
 * 處理 analyze 命令
 */
async function handleAnalyzeCommand(
  type: string | undefined,
  options: AnalyzeOptions,
  context: CommandContext
): Promise<void> {
  const analyzeType = type || 'complexity';

  if (options.format !== 'json') {
    console.log('   分析程式碼品質...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    if (analyzeType === 'complexity') {
      await analyzeComplexity(analyzePath, options, context);
    } else if (analyzeType === 'dead-code') {
      await analyzeDeadCode(analyzePath, options, context);
    } else if (analyzeType === 'best-practices') {
      await analyzeBestPractices(analyzePath, options, context);
    } else if (analyzeType === 'patterns') {
      await analyzePatterns(analyzePath, options, context);
    } else if (analyzeType === 'quality') {
      await analyzeQuality(analyzePath, options, context);
    } else {
      throw new Error(`不支援的分析類型: ${analyzeType}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.error(JSON.stringify({ error: errorMessage }));
    } else {
      console.error('   分析失敗:', errorMessage);
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}

/**
 * 分析複雜度
 */
async function analyzeComplexity(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext
): Promise<void> {
  const registry = ParserRegistry.getInstance();
  const files = await getAllProjectFiles(analyzePath, context);
  const results: Array<{ file: string; complexity: any }> = [];

  for (const file of files) {
    try {
      const parser = registry.getParser(path.extname(file));
      if (!parser) { continue; }

      const content = await context.fileSystem.readFile(file, 'utf-8') as string;
      const ast = await parser.parse(content, file);
      const complexity = await parser.analyzeComplexity(content, ast);

      results.push({ file, complexity });
    } catch {
      // 忽略無法分析的檔案
    }
  }

  const highComplexityFiles = results.filter(r =>
    r.complexity.evaluation === 'high' || r.complexity.cyclomaticComplexity > 10
  );

  const complexities = results.map(r => r.complexity.cyclomaticComplexity);
  const averageComplexity = complexities.length > 0
    ? complexities.reduce((sum, c) => sum + c, 0) / complexities.length
    : 0;
  const maxComplexity = complexities.length > 0
    ? Math.max(...complexities)
    : 0;

  if (options.format === 'json') {
    const outputData: any = {
      summary: {
        totalScanned: results.length,
        issuesFound: highComplexityFiles.length,
        averageComplexity,
        maxComplexity
      },
      issues: highComplexityFiles.map(r => ({
        path: r.file,
        complexity: r.complexity.cyclomaticComplexity,
        cognitiveComplexity: r.complexity.cognitiveComplexity,
        evaluation: r.complexity.evaluation
      }))
    };

    if (options.all) {
      outputData.all = results.map(r => ({
        path: r.file,
        complexity: r.complexity.cyclomaticComplexity,
        cognitiveComplexity: r.complexity.cognitiveComplexity,
        evaluation: r.complexity.evaluation
      }));
    }

    console.log(JSON.stringify(outputData, null, 2));
  } else {
    console.log('   複雜度分析完成!');
    console.log(`   統計: ${results.length} 個檔案，${highComplexityFiles.length} 個高複雜度檔案`);
    console.log(`   平均複雜度: ${averageComplexity.toFixed(2)}`);
    console.log(`   最高複雜度: ${maxComplexity}`);
    if (!options.all && highComplexityFiles.length > 0) {
      console.log('\n   高複雜度檔案:');
      highComplexityFiles.forEach(r => {
        console.log(`   - ${r.file}: ${r.complexity.cyclomaticComplexity}`);
      });
    }
  }
}

/**
 * 分析死代碼
 */
async function analyzeDeadCode(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext
): Promise<void> {
  const registry = ParserRegistry.getInstance();
  const files = await getAllProjectFiles(analyzePath, context);
  const results: Array<{ file: string; deadCode: any[] }> = [];

  for (const file of files) {
    try {
      const parser = registry.getParser(path.extname(file));
      if (!parser) { continue; }

      const content = await context.fileSystem.readFile(file, 'utf-8') as string;
      const ast = await parser.parse(content, file);
      const symbols = await parser.extractSymbols(ast);
      const deadCode = await parser.detectUnusedSymbols(ast, symbols);

      results.push({ file, deadCode });
    } catch {
      // 忽略無法分析的檔案
    }
  }

  const filesWithDeadCode = results.filter(r => r.deadCode.length > 0);
  const allDeadCode = results.flatMap(r => r.deadCode);
  const deadFunctions = allDeadCode.filter(d => d.type === 'function');
  const deadVariables = allDeadCode.filter(d => d.type === 'variable');

  if (options.format === 'json') {
    const outputData: any = {
      summary: {
        totalScanned: results.length,
        filesWithIssues: filesWithDeadCode.length,
        totalDeadFunctions: deadFunctions.length,
        totalDeadVariables: deadVariables.length,
        totalDeadCode: allDeadCode.length
      },
      issues: filesWithDeadCode.map(r => ({
        path: r.file,
        deadCode: r.deadCode
      }))
    };

    if (options.all) {
      outputData.all = results.map(r => ({
        path: r.file,
        deadCode: r.deadCode
      }));
    }

    outputData.deadFunctions = deadFunctions;
    outputData.deadVariables = deadVariables;

    console.log(JSON.stringify(outputData, null, 2));
  } else {
    console.log('   死代碼檢測完成!');
    console.log(`   統計: ${results.length} 個檔案，${filesWithDeadCode.length} 個有死代碼`);
    console.log('   發現:');
    console.log(`   未使用函式: ${deadFunctions.length} 個`);
    console.log(`   未使用變數: ${deadVariables.length} 個`);
    if (!options.all && filesWithDeadCode.length > 0) {
      console.log('\n   有死代碼的檔案:');
      filesWithDeadCode.forEach(r => {
        console.log(`   - ${r.file}: ${r.deadCode.length} 項`);
      });
    }
  }
}

/**
 * 分析最佳實踐
 */
async function analyzeBestPractices(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext
): Promise<void> {
  const files = await getAllProjectFiles(analyzePath, context);
  const issues: any[] = [];
  const recommendations: any[] = [];

  const hasEsmImports = files.some(async (file) => {
    const content = await context.fileSystem.readFile(file, 'utf-8') as string;
    return content.includes('import ') && content.includes('from ');
  });

  if (hasEsmImports) {
    recommendations.push({
      type: 'es-modules',
      status: 'good',
      message: '專案使用 ES Module'
    });
  }

  if (options.format === 'json') {
    console.log(JSON.stringify({
      issues,
      recommendations
    }, null, 2));
  } else {
    console.log('   最佳實踐檢查完成!');
    console.log(`   建議數: ${recommendations.length}`);
  }
}

/**
 * 分析模式
 */
async function analyzePatterns(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext
): Promise<void> {
  const files = await getAllProjectFiles(analyzePath, context);
  const patterns: string[] = [];
  let asyncFunctionCount = 0;

  for (const file of files) {
    const content = await context.fileSystem.readFile(file, 'utf-8') as string;

    if (content.includes('async ')) {
      asyncFunctionCount++;
      if (!patterns.includes('async-functions')) {
        patterns.push('async-functions');
      }
    }

    if (content.includes('Promise') || content.includes('.then(')) {
      if (!patterns.includes('promise-usage')) {
        patterns.push('promise-usage');
      }
    }

    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      if (content.includes('interface ') && !patterns.includes('interface-usage')) {
        patterns.push('interface-usage');
      }

      if (content.match(/<[A-Z]\w*(\s*extends\s+\w+)?>/g) && !patterns.includes('generic-types')) {
        patterns.push('generic-types');
      }

      if (content.includes('enum ') && !patterns.includes('enum-usage')) {
        patterns.push('enum-usage');
      }
    }
  }

  if (options.format === 'json') {
    console.log(JSON.stringify({
      patterns,
      statistics: {
        asyncFunctions: asyncFunctionCount
      }
    }, null, 2));
  } else {
    console.log('   模式檢測完成!');
    console.log(`   發現模式: ${patterns.join(', ')}`);
  }
}

/**
 * 分析品質
 */
async function analyzeQuality(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext
): Promise<void> {
  const registry = ParserRegistry.getInstance();
  const files = await getAllProjectFiles(analyzePath, context);

  if (files.length === 0) {
    const pathExists = await context.fileSystem.exists(analyzePath);
    if (!pathExists) {
      throw new Error(`路徑不存在: ${analyzePath}`);
    }
    throw new Error(`在路徑 ${analyzePath} 中找不到支援的檔案`);
  }

  const summary = {
    totalScanned: files.length,
    totalIssues: 0,
    qualityScore: 0
  };

  const allIssues: any[] = [];
  const recommendations: string[] = [];

  let typeSafetyScore = 100;
  let errorHandlingScore = 100;
  let securityScore = 100;
  let namingScore = 100;
  let testCoverageScore = 0;
  let testFileCount = 0;

  for (const file of files) {
    try {
      const parser = registry.getParser(path.extname(file));
      if (!parser) { continue; }

      const content = await context.fileSystem.readFile(file, 'utf-8') as string;
      const ast = await parser.parse(content, file);

      if (parser.isTestFile && parser.isTestFile(file)) {
        testFileCount++;
        continue;
      }

      if (parser.checkTypeSafety) {
        const typeSafetyIssues = await parser.checkTypeSafety(content, ast);
        typeSafetyIssues.forEach((issue) => {
          allIssues.push({
            type: 'type-safety',
            severity: issue.severity === 'error' ? 'high' : 'medium',
            message: issue.message,
            filePath: issue.location.filePath,
            line: issue.location.line
          });
          typeSafetyScore -= issue.severity === 'error' ? 10 : 5;
        });
      }

      if (parser.checkErrorHandling) {
        const errorHandlingIssues = await parser.checkErrorHandling(content, ast);
        errorHandlingIssues.forEach((issue) => {
          allIssues.push({
            type: 'error-handling',
            severity: issue.severity === 'error' ? 'high' : 'medium',
            message: issue.message,
            filePath: issue.location.filePath,
            line: issue.location.line
          });
          errorHandlingScore -= issue.severity === 'error' ? 10 : 5;
        });
      }

      if (parser.checkSecurity) {
        const securityIssues = await parser.checkSecurity(content, ast);
        securityIssues.forEach((issue) => {
          allIssues.push({
            type: 'security',
            severity: issue.severity === 'critical' ? 'high' : 'medium',
            message: issue.message,
            filePath: issue.location.filePath,
            line: issue.location.line
          });
          securityScore -= issue.severity === 'critical' ? 15 : 10;
        });
      }

      if (parser.checkNamingConventions) {
        const symbols = await parser.extractSymbols(ast);
        const namingIssues = await parser.checkNamingConventions(symbols, file);
        namingIssues.forEach((issue) => {
          allIssues.push({
            type: 'naming',
            severity: 'low',
            message: issue.message,
            filePath: issue.location.filePath,
            line: issue.location.line
          });
          namingScore -= 3;
        });
      }
    } catch {
      // 忽略無法分析的檔案
    }
  }

  const testFileRatio = files.length > 0 ? testFileCount / files.length : 0;
  testCoverageScore = Math.min(100, testFileRatio * 200);

  typeSafetyScore = Math.max(0, typeSafetyScore);
  errorHandlingScore = Math.max(0, errorHandlingScore);
  securityScore = Math.max(0, securityScore);
  namingScore = Math.max(0, namingScore);

  const overallScore = Math.round(
    typeSafetyScore * 0.30 +
    testCoverageScore * 0.25 +
    errorHandlingScore * 0.20 +
    namingScore * 0.15 +
    securityScore * 0.10
  );

  summary.totalIssues = allIssues.length;
  summary.qualityScore = overallScore;

  if (typeSafetyScore < 80) {
    recommendations.push('型別安全：建議使用可選綁定（if let, guard let）代替強制解包');
  }
  if (errorHandlingScore < 80) {
    recommendations.push('錯誤處理：建議使用 do-catch 明確處理錯誤，避免空 catch 區塊');
  }
  if (securityScore < 80) {
    recommendations.push('安全性：建議使用 Keychain 或環境變數儲存敏感資訊');
  }
  if (namingScore < 80) {
    recommendations.push('命名規範：建議遵循 Swift API Design Guidelines 命名規範');
  }
  if (testCoverageScore < 50) {
    recommendations.push('測試覆蓋率：建議提升測試覆蓋率至 50% 以上');
  }

  if (options.format === 'json') {
    console.log(JSON.stringify({
      summary,
      issues: allIssues,
      complexity: { score: 100 },
      maintainability: { score: 100 },
      typeSafety: {
        score: typeSafetyScore,
        issues: allIssues.filter((i) => i.type === 'type-safety')
      },
      errorHandling: {
        score: errorHandlingScore,
        issues: allIssues.filter((i) => i.type === 'error-handling')
      },
      security: {
        score: securityScore,
        issues: allIssues.filter((i) => i.type === 'security')
      },
      namingConventions: {
        score: namingScore,
        issues: allIssues.filter((i) => i.type === 'naming')
      },
      testCoverage: {
        score: testCoverageScore,
        testFileRatio,
        testFiles: testFileCount,
        totalFiles: files.length
      },
      overallScore,
      recommendations
    }, null, 2));
  } else {
    console.log('   品質分析完成!');
    console.log(`   整體評分: ${overallScore}/100`);
    console.log(`   總問題數: ${summary.totalIssues}`);
    console.log('\n維度評分:');
    console.log(`   型別安全:     ${typeSafetyScore.toFixed(1)}/100`);
    console.log(`   錯誤處理:     ${errorHandlingScore.toFixed(1)}/100`);
    console.log(`   安全性:       ${securityScore.toFixed(1)}/100`);
    console.log(`   命名規範:     ${namingScore.toFixed(1)}/100`);
    console.log(`   測試覆蓋率:   ${testCoverageScore.toFixed(1)}/100 (${(testFileRatio * 100).toFixed(1)}%)`);

    if (recommendations.length > 0) {
      console.log('\n改善建議:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
  }
}

/**
 * 獲取專案中的所有檔案
 */
async function getAllProjectFiles(projectPath: string, context: CommandContext): Promise<string[]> {
  const files: string[] = [];
  const registry = ParserRegistry.getInstance();
  const allowedExtensions = registry.getSupportedExtensions();
  const excludePatterns = ['node_modules', 'dist', '.git', 'coverage'];

  try {
    const isFile = await context.fileSystem.isFile(projectPath);
    if (isFile) {
      if (allowedExtensions.some(ext => projectPath.endsWith(ext))) {
        return [projectPath];
      }
      return [];
    }
  } catch {
    return [];
  }

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await context.fileSystem.readDirectory(dir);

      for (const entry of entries) {
        const fullPath = entry.path;

        if (entry.isDirectory) {
          if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
            continue;
          }
          await walkDir(fullPath);
        } else if (entry.isFile) {
          if (allowedExtensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // 忽略無法存取的目錄
    }
  }

  await walkDir(projectPath);
  return files;
}
