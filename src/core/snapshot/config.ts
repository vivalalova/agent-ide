/**
 * 快照配置管理
 * 負責讀取和管理 .agent-ide.json 配置檔
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { SnapshotOptions, CompressionLevel } from './types.js';
import { createDefaultSnapshotOptions } from './types.js';

/**
 * 專案配置檔格式
 */
export interface ProjectConfig {
  snapshot?: {
    /** 是否啟用快照 */
    enabled?: boolean;

    /** 輸出路徑 */
    output?: string;

    /** 是否使用增量更新 */
    incremental?: boolean;

    /** 壓縮層級 */
    level?: CompressionLevel;

    /** 排除模式 */
    exclude?: string[];

    /** 包含的副檔名 */
    extensions?: string[];

    /** 是否包含測試檔案 */
    includeTests?: boolean;

    /** Hooks 配置 */
    hooks?: {
      /** 在 build 前執行 */
      prebuild?: boolean;

      /** 在 commit 前執行 */
      precommit?: boolean;
    };
  };
}

/**
 * 配置管理器
 */
export class ConfigManager {
  private static readonly CONFIG_FILENAME = '.agent-ide.json';

  /**
   * 讀取專案配置
   */
  async loadConfig(projectPath: string): Promise<ProjectConfig | null> {
    const configPath = path.join(projectPath, ConfigManager.CONFIG_FILENAME);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content) as ProjectConfig;
    } catch {
      // 配置檔不存在或讀取失敗
      return null;
    }
  }

  /**
   * 保存專案配置
   */
  async saveConfig(projectPath: string, config: ProjectConfig): Promise<void> {
    const configPath = path.join(projectPath, ConfigManager.CONFIG_FILENAME);
    const content = JSON.stringify(config, null, 2);

    await fs.writeFile(configPath, content, 'utf-8');
  }

  /**
   * 合併配置：CLI 參數 > 配置檔 > 預設值
   */
  mergeOptions(
    projectPath: string,
    cliOptions: Partial<SnapshotOptions>,
    config: ProjectConfig | null
  ): SnapshotOptions {
    // 從預設值開始
    const options = createDefaultSnapshotOptions(projectPath);

    // 應用配置檔設定
    if (config?.snapshot) {
      const snapConfig = config.snapshot;

      if (snapConfig.output !== undefined) {
        options.outputPath = path.resolve(projectPath, snapConfig.output);
      }

      if (snapConfig.incremental !== undefined) {
        options.incremental = snapConfig.incremental;
      }

      if (snapConfig.level !== undefined) {
        options.level = snapConfig.level;
      }

      if (snapConfig.exclude !== undefined) {
        options.exclude = snapConfig.exclude;
      }

      if (snapConfig.extensions !== undefined) {
        options.extensions = snapConfig.extensions;
      }

      if (snapConfig.includeTests !== undefined) {
        options.includeTests = snapConfig.includeTests;
      }
    }

    // 應用 CLI 參數（最高優先級）
    if (cliOptions.outputPath !== undefined) {
      options.outputPath = cliOptions.outputPath;
    }

    if (cliOptions.incremental !== undefined) {
      options.incremental = cliOptions.incremental;
    }

    if (cliOptions.level !== undefined) {
      options.level = cliOptions.level;
    }

    if (cliOptions.exclude !== undefined) {
      options.exclude = cliOptions.exclude;
    }

    if (cliOptions.extensions !== undefined) {
      options.extensions = cliOptions.extensions;
    }

    if (cliOptions.includeTests !== undefined) {
      options.includeTests = cliOptions.includeTests;
    }

    if (cliOptions.multiLevel !== undefined) {
      options.multiLevel = cliOptions.multiLevel;
    }

    if (cliOptions.outputDir !== undefined) {
      options.outputDir = cliOptions.outputDir;
    }

    if (cliOptions.silent !== undefined) {
      options.silent = cliOptions.silent;
    }

    return options;
  }

  /**
   * 建立範例配置檔
   */
  async createExampleConfig(projectPath: string): Promise<void> {
    const exampleConfig: ProjectConfig = {
      snapshot: {
        enabled: true,
        output: '.agent-ide/snapshot.json',
        incremental: true,
        level: 'full' as CompressionLevel,
        exclude: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '*.test.*',
          '*.spec.*',
          '**/fixtures/**',
          '**/__tests__/**'
        ],
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
        includeTests: false,
        hooks: {
          prebuild: true,
          precommit: false
        }
      }
    };

    await this.saveConfig(projectPath, exampleConfig);
  }

  /**
   * 檢查配置檔是否存在
   */
  async configExists(projectPath: string): Promise<boolean> {
    const configPath = path.join(projectPath, ConfigManager.CONFIG_FILENAME);

    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }
}
