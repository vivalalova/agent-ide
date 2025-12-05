/**
 * Deadcode 命令
 * 死代碼分析（從 analyze dead-code 攤平而來）
 */

import type { Command } from 'commander';
import * as path from 'path';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { QueryCommand, AnalyzeType, IssueSeverity, type AnalyzeResult, type QueryIssue } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Deadcode 命令選項 */
interface DeadcodeOptions {
  path: string;
  format: string;
  all: boolean;
}

/**
 * 設定 deadcode 命令
 */
export function setupDeadcodeCommand(program: Command, context: CommandContext): void {
  program
    .command('deadcode')
    .description('分析死代碼')
    .option('-p, --path <path>', '分析路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('--all', '顯示所有掃描結果（預設只顯示有問題的項目）', false)
    .action(async (options: DeadcodeOptions) => {
      await handleDeadcodeCommand(options, context);
    });
}

/**
 * 處理 deadcode 命令
 */
async function handleDeadcodeCommand(
  options: DeadcodeOptions,
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

  if (format !== OutputFormat.Json) {
    console.log('🔍 分析死代碼...');
  }

  try {
    const analyzePath = options.path || process.cwd();
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
  } catch (error) {
    handleError(error, format);
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
