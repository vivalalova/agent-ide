/**
 * CLI 命令共用型別定義
 */

import type { Command } from 'commander';
import type { IFileSystem } from '../../../infrastructure/storage/index.js';

/**
 * 命令共用 Context
 * 包含所有命令可能需要的共用依賴
 */
export interface CommandContext {
  /** 檔案系統實例 */
  readonly fileSystem: IFileSystem;
}

/**
 * 命令設定函數簽章
 */
export type CommandSetup = (program: Command, context: CommandContext) => void;
