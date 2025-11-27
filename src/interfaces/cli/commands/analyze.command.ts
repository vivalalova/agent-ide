/**
 * Analyze 命令
 * 分析程式碼品質
 */

import type { Command } from 'commander';
import * as path from 'path';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { QueryCommand, AnalyzeType, IssueSeverity, type AnalyzeResult, type QueryIssue } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

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
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
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
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  const analyzeType = type || 'complexity';

  if (format !== OutputFormat.Json) {
    console.log('🔍 分析程式碼品質...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    if (analyzeType === 'complexity') {
      await analyzeComplexity(analyzePath, options, context, format, outputHandler);
    } else if (analyzeType === 'dead-code') {
      await analyzeDeadCode(analyzePath, options, context, format, outputHandler);
    } else if (analyzeType === 'best-practices') {
      await analyzeBestPractices(analyzePath, options, context, format, outputHandler);
    } else if (analyzeType === 'patterns') {
      await analyzePatterns(analyzePath, options, context, format, outputHandler);
    } else if (analyzeType === 'quality') {
      await analyzeQuality(analyzePath, options, context, format, outputHandler);
    } else {
      throw new Error(`不支援的分析類型: ${analyzeType}`);
    }
  } catch (error) {
    handleError(error, format);
  }
}

/**
 * 分析複雜度
 */
async function analyzeComplexity(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const registry = ParserRegistry.getInstance();
  const files = await getAllProjectFiles(analyzePath, context);
  const results: Array<{ file: string; complexity: { cyclomaticComplexity: number; cognitiveComplexity: number; evaluation: string } }> = [];

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

  // 建立 AnalyzeResult
  const issues: QueryIssue[] = highComplexityFiles.map(r => ({
    type: 'complexity',
    severity: r.complexity.cyclomaticComplexity > 20 ? IssueSeverity.High : IssueSeverity.Medium,
    message: `複雜度 ${r.complexity.cyclomaticComplexity}，認知複雜度 ${r.complexity.cognitiveComplexity}`,
    filePath: r.file,
    score: r.complexity.cyclomaticComplexity
  }));

  const result: AnalyzeResult = {
    command: QueryCommand.Analyze,
    success: true,
    analyzeType: AnalyzeType.Complexity,
    summary: {
      totalScanned: results.length,
      issuesFound: highComplexityFiles.length,
      averageComplexity,
      maxComplexity
    },
    issues,
    metrics: options.all ? {
      all: results.map(r => ({
        path: r.file,
        complexity: r.complexity.cyclomaticComplexity,
        cognitiveComplexity: r.complexity.cognitiveComplexity,
        evaluation: r.complexity.evaluation
      }))
    } : undefined
  };

  outputHandler.outputQuery(result, format);
}

/**
 * 分析死代碼
 */
async function analyzeDeadCode(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const registry = ParserRegistry.getInstance();
  const files = await getAllProjectFiles(analyzePath, context);
  const results: Array<{ file: string; deadCode: Array<{ type: string; name?: string; line?: number }> }> = [];

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
  const allDeadCode = results.flatMap(r => r.deadCode.map(d => ({ ...d, file: r.file })));
  const deadFunctions = allDeadCode.filter(d => d.type === 'function');
  const deadVariables = allDeadCode.filter(d => d.type === 'variable');

  // 建立 AnalyzeResult
  const issues: QueryIssue[] = allDeadCode.map(d => ({
    type: 'dead-code',
    severity: d.type === 'function' ? IssueSeverity.Medium : IssueSeverity.Low,
    message: `未使用的${d.type === 'function' ? '函式' : '變數'}: ${d.name ?? 'unknown'}`,
    filePath: d.file,
    line: d.line
  }));

  const result: AnalyzeResult = {
    command: QueryCommand.Analyze,
    success: true,
    analyzeType: AnalyzeType.DeadCode,
    summary: {
      totalScanned: results.length,
      issuesFound: allDeadCode.length,
      filesWithIssues: filesWithDeadCode.length,
      totalDeadFunctions: deadFunctions.length,
      totalDeadVariables: deadVariables.length
    },
    issues,
    metrics: options.all ? {
      all: results.map(r => ({ path: r.file, deadCode: r.deadCode }))
    } : undefined
  };

  outputHandler.outputQuery(result, format);
}

/**
 * 分析最佳實踐
 */
async function analyzeBestPractices(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const files = await getAllProjectFiles(analyzePath, context);
  const recommendations: Array<{ type: string; status: string; message: string }> = [];

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

  const result: AnalyzeResult = {
    command: QueryCommand.Analyze,
    success: true,
    analyzeType: AnalyzeType.BestPractices,
    summary: {
      totalScanned: files.length,
      issuesFound: 0,
      recommendations: recommendations.length
    },
    issues: [],
    metrics: { recommendations }
  };

  outputHandler.outputQuery(result, format);
}

/**
 * 分析模式
 */
async function analyzePatterns(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
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

  const result: AnalyzeResult = {
    command: QueryCommand.Analyze,
    success: true,
    analyzeType: AnalyzeType.Patterns,
    summary: {
      totalScanned: files.length,
      issuesFound: 0,
      patternsFound: patterns.length
    },
    issues: [],
    metrics: {
      patterns,
      statistics: { asyncFunctions: asyncFunctionCount }
    }
  };

  outputHandler.outputQuery(result, format);
}

/**
 * 分析品質
 */
async function analyzeQuality(
  analyzePath: string,
  options: AnalyzeOptions,
  context: CommandContext,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
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

  const allIssues: QueryIssue[] = [];
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
        typeSafetyIssues.forEach((issue: { severity: string; message: string; location: { filePath: string; line: number } }) => {
          allIssues.push({
            type: 'type-safety',
            severity: issue.severity === 'error' ? IssueSeverity.High : IssueSeverity.Medium,
            message: issue.message,
            filePath: issue.location.filePath,
            line: issue.location.line
          });
          typeSafetyScore -= issue.severity === 'error' ? 10 : 5;
        });
      }

      if (parser.checkErrorHandling) {
        const errorHandlingIssues = await parser.checkErrorHandling(content, ast);
        errorHandlingIssues.forEach((issue: { severity: string; message: string; location: { filePath: string; line: number } }) => {
          allIssues.push({
            type: 'error-handling',
            severity: issue.severity === 'error' ? IssueSeverity.High : IssueSeverity.Medium,
            message: issue.message,
            filePath: issue.location.filePath,
            line: issue.location.line
          });
          errorHandlingScore -= issue.severity === 'error' ? 10 : 5;
        });
      }

      if (parser.checkSecurity) {
        const securityIssues = await parser.checkSecurity(content, ast);
        securityIssues.forEach((issue: { severity: string; message: string; location: { filePath: string; line: number } }) => {
          allIssues.push({
            type: 'security',
            severity: issue.severity === 'critical' ? IssueSeverity.Critical : IssueSeverity.High,
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
        namingIssues.forEach((issue: { message: string; location: { filePath: string; line: number } }) => {
          allIssues.push({
            type: 'naming',
            severity: IssueSeverity.Low,
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

  const result: AnalyzeResult = {
    command: QueryCommand.Analyze,
    success: true,
    analyzeType: AnalyzeType.Quality,
    summary: {
      totalScanned: files.length,
      issuesFound: allIssues.length,
      qualityScore: overallScore
    },
    issues: allIssues,
    metrics: {
      typeSafety: { score: typeSafetyScore },
      errorHandling: { score: errorHandlingScore },
      security: { score: securityScore },
      namingConventions: { score: namingScore },
      testCoverage: { score: testCoverageScore, testFileRatio, testFiles: testFileCount, totalFiles: files.length },
      overallScore,
      recommendations
    }
  };

  outputHandler.outputQuery(result, format);
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

/**
 * 處理錯誤
 */
function handleError(error: unknown, format: OutputFormat): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (format === OutputFormat.Json) {
    console.error(JSON.stringify({ error: errorMessage }));
  } else {
    console.error('\n❌ 分析失敗:', errorMessage);
  }

  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}
