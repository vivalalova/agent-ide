/**
 * MCP (Model Context Protocol) 介面實作
 * 提供給 Claude Code 等 AI 工具使用的 MCP 工具
 */

import { IndexEngine } from '../../core/indexing/index-engine';
import { DependencyAnalyzer } from '../../core/dependency/dependency-analyzer';
import { RenameEngine } from '../../core/rename/rename-engine';
import { ImportResolver } from '../../core/move/index.js';
import { createIndexConfig } from '../../core/indexing/types';
import { ParserRegistry } from '../../infrastructure/parser/registry';

// MCP 工具介面定義
export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// MCP 工具結果介面
export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class AgentIdeMCP {
  private indexEngine?: IndexEngine;
  private dependencyAnalyzer?: DependencyAnalyzer;
  private renameEngine?: RenameEngine;
  private importResolver?: ImportResolver;

  /**
   * 獲取所有可用的 MCP 工具定義
   */
  getTools(): MCPTool[] {
    return [
      {
        name: 'code_index',
        description: '建立和查詢程式碼索引，提供符號搜尋和檔案索引功能',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update', 'search', 'stats'],
              description: '操作類型: create=建立索引, update=更新索引, search=搜尋符號, stats=獲取統計'
            },
            path: {
              type: 'string',
              description: '專案路徑（用於 create/update）'
            },
            query: {
              type: 'string',
              description: '搜尋查詢（用於 search）'
            },
            extensions: {
              type: 'array',
              items: { type: 'string' },
              description: '包含的檔案副檔名',
              default: ['.ts', '.js', '.tsx', '.jsx']
            },
            excludePatterns: {
              type: 'array',
              items: { type: 'string' },
              description: '排除模式',
              default: ['node_modules/**', '*.test.*']
            }
          },
          required: ['action']
        }
      },
      {
        name: 'code_rename',
        description: '執行安全的程式碼重新命名，自動更新所有引用',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['variable', 'function', 'class', 'interface', 'file'],
              description: '要重新命名的符號類型'
            },
            from: {
              type: 'string',
              description: '原始名稱'
            },
            to: {
              type: 'string',
              description: '新名稱'
            },
            path: {
              type: 'string',
              description: '檔案或目錄路徑',
              default: '.'
            },
            preview: {
              type: 'boolean',
              description: '是否只預覽變更而不執行',
              default: false
            }
          },
          required: ['type', 'from', 'to']
        }
      },
      {
        name: 'code_move',
        description: '移動檔案或目錄，自動更新 import 路徑',
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: '來源路徑'
            },
            target: {
              type: 'string',
              description: '目標路徑'
            },
            updateImports: {
              type: 'boolean',
              description: '是否自動更新 import 路徑',
              default: true
            },
            preview: {
              type: 'boolean',
              description: '是否只預覽變更而不執行',
              default: false
            }
          },
          required: ['source', 'target']
        }
      },
      {
        name: 'code_search',
        description: '搜尋程式碼中的符號、文字或模式',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜尋查詢'
            },
            type: {
              type: 'string',
              enum: ['symbol', 'text', 'regex'],
              description: '搜尋類型',
              default: 'symbol'
            },
            fileFilter: {
              type: 'array',
              items: { type: 'string' },
              description: '檔案類型過濾'
            },
            limit: {
              type: 'number',
              description: '結果數量限制',
              default: 50
            }
          },
          required: ['query']
        }
      },
      {
        name: 'code_analyze',
        description: '分析程式碼品質、複雜度和相關指標',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '分析路徑',
              default: '.'
            },
            type: {
              type: 'string',
              enum: ['complexity', 'dependencies', 'quality', 'all'],
              description: '分析類型',
              default: 'all'
            },
            format: {
              type: 'string',
              enum: ['json', 'summary'],
              description: '輸出格式',
              default: 'summary'
            }
          }
        }
      },
      {
        name: 'code_deps',
        description: '分析程式碼依賴關係，檢測循環依賴和影響範圍',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '分析路徑',
              default: '.'
            },
            type: {
              type: 'string',
              enum: ['graph', 'cycles', 'impact', 'all'],
              description: '分析類型',
              default: 'all'
            },
            file: {
              type: 'string',
              description: '特定檔案分析（用於影響分析）'
            },
            format: {
              type: 'string',
              enum: ['json', 'dot', 'summary'],
              description: '輸出格式',
              default: 'summary'
            }
          }
        }
      },
      {
        name: 'parser_plugins',
        description: '管理 Parser 插件，查看和操作插件狀態',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'info', 'enable', 'disable'],
              description: '操作類型'
            },
            plugin: {
              type: 'string',
              description: '插件名稱（用於 info/enable/disable）'
            },
            filter: {
              type: 'string',
              enum: ['all', 'enabled', 'disabled'],
              description: '過濾條件（用於 list）',
              default: 'all'
            }
          },
          required: ['action']
        }
      }
    ];
  }

  /**
   * 執行 MCP 工具
   */
  async executeTool(toolName: string, parameters: any): Promise<MCPResult> {
    try {
      switch (toolName) {
        case 'code_index':
          return await this.handleCodeIndex(parameters);
        case 'code_rename':
          return await this.handleCodeRename(parameters);
        case 'code_move':
          return await this.handleCodeMove(parameters);
        case 'code_search':
          return await this.handleCodeSearch(parameters);
        case 'code_analyze':
          return await this.handleCodeAnalyze(parameters);
        case 'code_deps':
          return await this.handleCodeDeps(parameters);
        case 'parser_plugins':
          return await this.handleParserPlugins(parameters);
        default:
          return {
            success: false,
            error: `未知的工具: ${toolName}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // 工具處理方法
  private async handleCodeIndex(params: any): Promise<MCPResult> {
    const { action, path: projectPath, query, extensions, excludePatterns } = params;

    switch (action) {
      case 'create':
      case 'update':
        if (!projectPath) {
          return { success: false, error: '需要指定專案路徑' };
        }

        try {
          const config = createIndexConfig(projectPath, {
            includeExtensions: extensions || ['.ts', '.js', '.tsx', '.jsx'],
            excludePatterns: excludePatterns || ['node_modules/**', '*.test.*']
          });

          this.indexEngine = new IndexEngine(config);
          await this.indexEngine.indexProject(projectPath);
          const stats = await this.indexEngine.getStats();

          return {
            success: true,
            data: {
              action: action === 'create' ? '建立' : '更新',
              stats: {
                totalFiles: stats.totalFiles,
                totalSymbols: stats.totalSymbols,
                indexedAt: new Date().toISOString()
              }
            }
          };
        } catch (error) {
          return {
            success: false,
            error: `建立索引失敗: ${error instanceof Error ? error.message : String(error)}`
          };
        }

      case 'search':
        if (!query) {
          return { success: false, error: '需要指定搜尋查詢' };
        }
        if (!this.indexEngine) {
          return { success: false, error: '索引尚未建立，請先執行 create 操作' };
        }

        const results = await this.indexEngine.findSymbol(query);
        return {
          success: true,
          data: {
            query,
            results: results.map(r => ({
              name: r.symbol.name,
              type: r.symbol.type,
              file: r.fileInfo.filePath,
              line: r.symbol.location.range.start.line,
              column: r.symbol.location.range.start.column,
              score: r.score
            }))
          }
        };

      case 'stats':
        if (!this.indexEngine) {
          return { success: false, error: '索引尚未建立' };
        }

        const currentStats = await this.indexEngine.getStats();
        return {
          success: true,
          data: currentStats
        };

      default:
        return { success: false, error: `未知的索引操作: ${action}` };
    }
  }

  private async handleCodeRename(params: any): Promise<MCPResult> {
    const { type, from, to, path, preview } = params;

    // TODO: 實作重新命名邏輯
    return {
      success: true,
      data: {
        message: `重新命名 ${type} "${from}" → "${to}" 的功能開發中`,
        preview: preview || false,
        path: path || '.'
      }
    };
  }

  private async handleCodeMove(params: any): Promise<MCPResult> {
    const { source, target, updateImports, preview } = params;

    // TODO: 實作檔案移動邏輯
    return {
      success: true,
      data: {
        message: `移動檔案 "${source}" → "${target}" 的功能開發中`,
        updateImports: updateImports !== false,
        preview: preview || false
      }
    };
  }

  private async handleCodeSearch(params: any): Promise<MCPResult> {
    const { query, type, fileFilter, limit } = params;

    // TODO: 實作搜尋邏輯
    return {
      success: true,
      data: {
        message: `搜尋 "${query}" 的功能開發中`,
        type: type || 'symbol',
        limit: limit || 50
      }
    };
  }

  private async handleCodeAnalyze(params: any): Promise<MCPResult> {
    const { path, type, format } = params;

    // TODO: 實作程式碼分析邏輯
    return {
      success: true,
      data: {
        message: `分析路徑 "${path || '.'}" 的功能開發中`,
        type: type || 'all',
        format: format || 'summary'
      }
    };
  }

  private async handleCodeDeps(params: any): Promise<MCPResult> {
    const { path, type, file, format } = params;

    // TODO: 實作依賴分析邏輯
    return {
      success: true,
      data: {
        message: `依賴分析 "${path || '.'}" 的功能開發中`,
        type: type || 'all',
        format: format || 'summary'
      }
    };
  }

  private async handleParserPlugins(params: any): Promise<MCPResult> {
    const { action, plugin, filter } = params;

    try {
      const registry = ParserRegistry.getInstance();

      switch (action) {
        case 'list':
          const parsers = registry.listParsers();
          return {
            success: true,
            data: {
              plugins: parsers.map(p => ({
                name: p.name,
                version: p.version,
                supportedExtensions: p.supportedExtensions,
                supportedLanguages: p.supportedLanguages,
                registeredAt: p.registeredAt.toISOString()
              })),
              total: parsers.length
            }
          };

        case 'info':
          if (!plugin) {
            return { success: false, error: '需要指定插件名稱' };
          }

          const pluginInstance = registry.getParserByName(plugin);
          if (!pluginInstance) {
            return { success: false, error: `找不到插件: ${plugin}` };
          }

          const pluginInfo = registry.listParsers().find(p => p.name === plugin);
          return {
            success: true,
            data: pluginInfo
          };

        case 'enable':
        case 'disable':
          return {
            success: true,
            data: {
              message: `插件 ${action} 功能開發中`,
              plugin
            }
          };

        default:
          return { success: false, error: `未知的插件操作: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: `插件操作失敗: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}