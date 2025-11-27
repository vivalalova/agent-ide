/**
 * Plugins 命令
 * 管理 Parser 插件
 */

import type { Command } from 'commander';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import { QueryCommand, type PluginsResult, type PluginInfo } from '../../../infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '../unified-output-handler.js';
import type { CommandContext } from './types.js';

/** Plugins list 選項 */
interface PluginsListOptions {
  enabled?: boolean;
  disabled?: boolean;
  format: string;
}

/**
 * 設定 plugins 命令
 */
export function setupPluginsCommand(program: Command, _context: CommandContext): void {
  const pluginsCmd = program
    .command('plugins')
    .description('管理 Parser 插件');

  pluginsCmd
    .command('list')
    .option('--enabled', '只顯示啟用的插件')
    .option('--disabled', '只顯示停用的插件')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .description('列出所有插件')
    .action(async (options: PluginsListOptions) => {
      await handlePluginsList(options);
    });

  pluginsCmd
    .command('info <plugin>')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .description('顯示插件資訊')
    .action(async (pluginName: string, options: { format: string }) => {
      await handlePluginInfo(pluginName, options);
    });
}

/**
 * 處理 plugins list 命令
 */
async function handlePluginsList(options: PluginsListOptions): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  const registry = ParserRegistry.getInstance();

  if (!registry || typeof registry.listParsers !== 'function') {
    const result: PluginsResult = {
      command: QueryCommand.Plugins,
      success: false,
      summary: { totalScanned: 0 },
      plugins: [],
      errors: ['插件系統尚未初始化']
    };
    outputHandler.outputQuery(result, format);
    return;
  }

  const parsers = registry.listParsers();
  const plugins: PluginInfo[] = parsers.map(p => ({
    name: p.name,
    version: p.version,
    supportedExtensions: [...p.plugin.supportedExtensions],
    supportedLanguages: [...p.plugin.supportedLanguages],
    registeredAt: p.registeredAt
  }));

  const result: PluginsResult = {
    command: QueryCommand.Plugins,
    success: true,
    summary: { totalScanned: plugins.length },
    plugins
  };

  outputHandler.outputQuery(result, format);
}

/**
 * 處理 plugins info 命令
 */
async function handlePluginInfo(pluginName: string, options: { format: string }): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  const registry = ParserRegistry.getInstance();

  if (!registry || typeof registry.listParsers !== 'function') {
    const result: PluginsResult = {
      command: QueryCommand.Plugins,
      success: false,
      summary: { totalScanned: 0 },
      plugins: [],
      errors: ['插件系統尚未初始化']
    };
    outputHandler.outputQuery(result, format);
    process.exitCode = 1;
    return;
  }

  const parsers = registry.listParsers();
  const parserInfo = parsers.find(p => p.name === pluginName);

  if (!parserInfo) {
    const result: PluginsResult = {
      command: QueryCommand.Plugins,
      success: false,
      summary: { totalScanned: 0 },
      plugins: [],
      errors: [`找不到插件: ${pluginName}`]
    };
    outputHandler.outputQuery(result, format);
    process.exitCode = 1;
    return;
  }

  const pluginInfoData: PluginInfo = {
    name: parserInfo.name,
    version: parserInfo.version,
    supportedExtensions: [...parserInfo.plugin.supportedExtensions],
    supportedLanguages: [...parserInfo.plugin.supportedLanguages],
    registeredAt: parserInfo.registeredAt
  };

  const result: PluginsResult = {
    command: QueryCommand.Plugins,
    success: true,
    summary: { totalScanned: 1 },
    plugins: [pluginInfoData]
  };

  outputHandler.outputQuery(result, format);
}
