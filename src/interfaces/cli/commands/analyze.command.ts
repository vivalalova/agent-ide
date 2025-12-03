/**
 * Analyze 命令
 * 分析程式碼品質（複雜度、死代碼）
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
    .description('分析程式碼品質 (type: complexity|dead-code)')
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

  // 驗證分析類型
  const validTypes = ['complexity', 'dead-code'];
  if (!validTypes.includes(analyzeType)) {
    const errorResult: AnalyzeResult = {
      command: QueryCommand.Analyze,
      success: false,
      analyzeType: AnalyzeType.Complexity,
      summary: { totalScanned: 0, issuesFound: 0 },
      issues: [],
      errors: [`不支援的分析類型: ${analyzeType}。可用類型: complexity, dead-code`]
    };
    outputHandler.outputQuery(errorResult, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log('🔍 分析程式碼品質...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    if (analyzeType === 'complexity') {
      await analyzeComplexity(analyzePath, options, context, format, outputHandler);
    } else if (analyzeType === 'dead-code') {
      await analyzeDeadCode(analyzePath, options, context, format, outputHandler);
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
