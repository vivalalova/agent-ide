/**
 * Plugins 命令處理器
 * 處理插件相關的命令操作
 */

import { ParserRegistry } from '@infrastructure/parser/registry.js';

/**
 * 處理插件列表命令
 */
export async function handlePluginsListCommand(options: any): Promise<void> {
  console.log('🔌 插件列表:');

  const registry = ParserRegistry.getInstance();

  // 確保 registry 存在且有 listParsers 方法
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
 * 處理插件資訊命令
 */
export async function handlePluginInfoCommand(pluginName: string): Promise<void> {
  const registry = ParserRegistry.getInstance();

  // 確保 registry 存在且有 getParserByName 方法
  if (!registry || typeof registry.getParserByName !== 'function') {
    console.error('❌ 插件系統尚未初始化');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }

  const plugin = registry.getParserByName(pluginName);

  if (!plugin) {
    console.error(`❌ 找不到插件: ${pluginName}`);
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }

  console.log(`🔌 插件資訊: ${pluginName}`);
  // TODO: 顯示詳細插件資訊
}
