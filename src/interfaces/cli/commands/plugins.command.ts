/**
 * Plugins 命令
 * 管理 Parser 插件
 */

import type { Command } from 'commander';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';
import type { CommandContext } from './types.js';

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
    .description('列出所有插件')
    .action(async () => {
      await handlePluginsList();
    });

  pluginsCmd
    .command('info <plugin>')
    .description('顯示插件資訊')
    .action(async (pluginName: string) => {
      await handlePluginInfo(pluginName);
    });
}

/**
 * 處理 plugins list 命令
 */
async function handlePluginsList(): Promise<void> {
  console.log('🔌 插件列表:');

  const registry = ParserRegistry.getInstance();

  if (!registry || typeof registry.listParsers !== 'function') {
    console.log('📝 插件系統尚未初始化');
    return;
  }

  const parsers = registry.listParsers();

  if (!parsers || parsers.length === 0) {
    console.log('📝 未找到已註冊的插件');
    return;
  }

  console.table(parsers.map(p => ({
    名稱: p.name,
    版本: p.version,
    支援副檔名: p.supportedExtensions.join(', '),
    支援語言: p.supportedLanguages.join(', '),
    註冊時間: p.registeredAt.toLocaleString()
  })));
}

/**
 * 處理 plugins info 命令
 */
async function handlePluginInfo(pluginName: string): Promise<void> {
  const registry = ParserRegistry.getInstance();

  if (!registry || typeof registry.getParserByName !== 'function') {
    console.error('❌ 插件系統尚未初始化');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  const plugin = registry.getParserByName(pluginName);

  if (!plugin) {
    console.error(`❌ 找不到插件: ${pluginName}`);
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  console.log(`🔌 插件資訊: ${pluginName}`);
  // TODO: 顯示詳細插件資訊
}
