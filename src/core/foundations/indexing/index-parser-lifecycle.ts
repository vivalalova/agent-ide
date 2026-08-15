/**
 * Parser 模組生命週期委派
 * 負責外部 parser 模組（config.parserModulePaths）的初始化與釋放，
 * 以及將已註冊 parser 支援的副檔名合併進索引配置
 */

import {
  ParserRegistry,
  disposeRegisteredParserModules,
  getRegisteredSourceFileExtensions,
  initializeParserModules,
  type RegisteredParserModule
} from '@infrastructure/parser/index.js';
import type { IndexConfig } from './types.js';

export class ParserModuleLifecycle {
  private registeredParserModules: readonly RegisteredParserModule[] = [];
  private parserModulesInitialized = false;

  constructor(private readonly parserRegistry: ParserRegistry) {}

  mergeRegisteredParserExtensions(config: IndexConfig): IndexConfig {
    const includeExtensions = getRegisteredSourceFileExtensions(
      this.parserRegistry,
      config.includeExtensions
    );

    return {
      ...config,
      includeExtensions,
      parserModulePaths: config.parserModulePaths ?? []
    };
  }

  async initializeConfigured(config: IndexConfig): Promise<IndexConfig> {
    if (this.parserModulesInitialized) {
      return config;
    }

    const parserModulePaths = config.parserModulePaths ?? [];
    let nextConfig = config;
    if (parserModulePaths.length > 0) {
      this.registeredParserModules = await initializeParserModules(this.parserRegistry, parserModulePaths);
      nextConfig = this.mergeRegisteredParserExtensions(config);
    }

    this.parserModulesInitialized = true;
    return nextConfig;
  }

  async dispose(): Promise<void> {
    await disposeRegisteredParserModules(this.parserRegistry, this.registeredParserModules);
    this.registeredParserModules = [];
  }
}
