/**
 * 唯讀命令格式化器
 * 提供 json 和 summary 兩種輸出格式
 */

import * as path from 'path';
import {
  QueryCommand,
  IssueSeverity,
  AnalyzeType,
  type QueryResult,
  type SearchResult,
  type DepsResult,
  type AnalyzeResult,
  type SnapshotResult,
  type FindReferencesResult,
  type CallHierarchyResult,
  type DeadCodeResult,
  type ReferenceItem,
  type IncomingCallItem,
  type OutgoingCallItem,
  type ModuleSnapshotData,
  type ProjectSnapshotData,
  type IncrementalSnapshotData
} from './query-types.js';

/** ANSI 顏色碼 */
const Colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
} as const;

/** 嚴重度對應的顏色和 emoji */
const SeverityStyle = {
  [IssueSeverity.Critical]: { color: Colors.red, emoji: '🔴' },
  [IssueSeverity.High]: { color: Colors.red, emoji: '🟠' },
  [IssueSeverity.Medium]: { color: Colors.yellow, emoji: '🟡' },
  [IssueSeverity.Low]: { color: Colors.green, emoji: '🟢' }
} as const;

/** QueryFormatter 選項 */
export interface QueryFormatterOptions {
  /** 是否啟用顏色輸出 */
  color: boolean;
}

/** 輸出格式 */
export enum QueryFormat {
  Json = 'json',
  Summary = 'summary'
}

/**
 * 唯讀命令格式化器
 */
export class QueryFormatter {
  private readonly color: boolean;

  constructor(options: Partial<QueryFormatterOptions> = {}) {
    this.color = options.color ?? false;
  }

  /**
   * 格式化結果
   */
  format(result: QueryResult, outputFormat: QueryFormat): string {
    if (outputFormat === QueryFormat.Json) {
      return this.toJson(result);
    }
    return this.toSummary(result);
  }

  /**
   * 轉換為 JSON 格式
   */
  toJson(result: QueryResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * 轉換為 summary 格式
   */
  toSummary(result: QueryResult): string {
    switch (result.command) {
      case QueryCommand.Search:
        return this.formatSearchSummary(result as SearchResult);
      case QueryCommand.Deps:
        return this.formatDepsSummary(result as DepsResult);
      case QueryCommand.Analyze:
        return this.formatAnalyzeSummary(result as AnalyzeResult);
      case QueryCommand.Snapshot:
        return this.formatSnapshotSummary(result as SnapshotResult);
      case QueryCommand.FindReferences:
        return this.formatFindReferencesSummary(result as FindReferencesResult);
      case QueryCommand.CallHierarchy:
        return this.formatCallHierarchySummary(result as CallHierarchyResult);
    }
    // Exhaustive check: 編譯時確保所有 QueryCommand 都被處理
    const _exhaustiveCheck: never = result.command;
    return this.formatDefaultSummary({ ...result, command: _exhaustiveCheck });
  }

  /**
   * 格式化 Search 摘要
   */
  private formatSearchSummary(result: SearchResult): string {
    const lines: string[] = [];

    lines.push(`找到 ${result.results.length} 個結果`);
    if (result.searchTime) {
      lines.push(`搜尋耗時: ${result.searchTime}ms`);
    }
    if (result.truncated) {
      lines.push(this.colorize('(結果已截斷)', Colors.yellow));
    }

    lines.push('');

    // 列出結果
    result.results.forEach(match => {
      const location = match.column
        ? `${match.filePath}:${match.line}:${match.column}`
        : `${match.filePath}:${match.line}`;
      lines.push(this.colorize(location, Colors.cyan));
      lines.push(`  ${match.content}`);
    });

    return lines.join('\n');
  }

  /**
   * 格式化 Deps 摘要
   */
  private formatDepsSummary(result: DepsResult): string {
    const lines: string[] = [];
    const basePath = result.basePath;

    // 循環依賴
    if (result.cycles && result.cycles.length > 0) {
      lines.push(this.colorize(`發現 ${result.cycles.length} 個循環依賴`, Colors.red));
      lines.push('');
      result.cycles.forEach((cycle, index) => {
        const formattedCycle = cycle.cycle.map(p => this.toRelativePath(p, basePath));
        lines.push(`${index + 1}. ${formattedCycle.join(' → ')} → ${formattedCycle[0]}`);
      });
    } else if (!result.impact) {
      // 只有在沒有 impact 分析時才顯示「未發現循環依賴」
      lines.push(this.colorize('未發現循環依賴', Colors.green));
    }

    // 影響分析
    if (result.impact) {
      const targetFile = this.toRelativePath(result.impact.targetFile, basePath);
      lines.push(`📊 影響分析: ${targetFile}`);
      lines.push(`   依賴此檔案: ${result.impact.dependents.length} 個`);
      lines.push(`   被此檔案依賴: ${result.impact.dependencies.length} 個`);
      if (result.impact.dependents.length > 0) {
        lines.push('   依賴者:');
        result.impact.dependents.slice(0, 5).forEach(dep => {
          lines.push(`     - ${this.toRelativePath(dep, basePath)}`);
        });
        if (result.impact.dependents.length > 5) {
          lines.push(`     ... 還有 ${result.impact.dependents.length - 5} 個`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 將絕對路徑轉換為相對路徑
   * @param filePath 檔案路徑
   * @param basePath 專案根目錄
   * @returns 相對路徑（若無 basePath 則返回原路徑）
   */
  private toRelativePath(filePath: string, basePath?: string): string {
    if (!basePath) {
      return filePath;
    }
    // 確保路徑是絕對路徑
    if (!path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.relative(basePath, filePath);
  }

  /**
   * 格式化 Analyze 摘要
   */
  private formatAnalyzeSummary(result: AnalyzeResult): string {
    // 特殊處理 DeadCode 類型
    if (result.analyzeType === AnalyzeType.DeadCode) {
      return this.formatDeadCodeSummary(result as DeadCodeResult);
    }

    const lines: string[] = [];

    lines.push(`分析類型: ${result.analyzeType}`);
    lines.push(`成功: ${result.success ? '是' : '否'}`);

    if (result.issues && result.issues.length > 0) {
      lines.push(`發現 ${result.issues.length} 個問題`);
      lines.push('');
      result.issues.slice(0, 10).forEach(issue => {
        const severity = issue.severity
          ? SeverityStyle[issue.severity].emoji
          : '•';
        lines.push(`${severity} ${issue.message}`);
        if (issue.filePath) {
          lines.push(`  ${this.colorize(issue.filePath, Colors.dim)}${issue.line ? `:${issue.line}` : ''}`);
        }
      });
      if (result.issues.length > 10) {
        lines.push(`... 還有 ${result.issues.length - 10} 個問題`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化 DeadCode 摘要
   */
  private formatDeadCodeSummary(result: DeadCodeResult): string {
    const lines: string[] = [];

    // 標題
    lines.push('🔍 Dead Code 檢測結果');
    lines.push('');

    // 統計
    lines.push(`📊 掃描符號: ${result.summary.totalScanned || 0}`);
    lines.push(`💀 Dead Code: ${result.items.length} 個`);
    lines.push(`📁 影響檔案: ${result.filesAffected} 個`);
    lines.push(`⏱️  耗時: ${result.scanTime}ms`);
    if (result.skippedFiles > 0) {
      lines.push(this.colorize(`⚠️  跳過檔案: ${result.skippedFiles} 個（解析失敗）`, Colors.yellow));
    }
    lines.push('');

    // 按類型統計
    if (Object.keys(result.byType).length > 0) {
      lines.push('按類型統計:');
      for (const [type, count] of Object.entries(result.byType)) {
        const label = this.getTypeLabel(type);
        lines.push(`  ${label}: ${count}`);
      }
      lines.push('');
    }

    // Dead code 列表
    if (result.items.length > 0) {
      lines.push('Dead Code 列表:');

      // 按檔案分組
      const byFile = new Map<string, typeof result.items>();
      result.items.forEach(item => {
        const list = byFile.get(item.file) || [];
        list.push(item);
        byFile.set(item.file, list);
      });

      for (const [file, items] of byFile) {
        lines.push(`  ${this.colorize(file, Colors.cyan)}`);
        items.slice(0, 10).forEach(item => {
          const icon = this.getDeadCodeIcon(item.type);
          lines.push(`    ${icon} L${item.line}: ${item.name} (${item.type})`);
          lines.push(`       ${this.colorize(item.reason, Colors.dim)}`);
        });
        if (items.length > 10) {
          lines.push(`    ... 還有 ${items.length - 10} 個`);
        }
      }
    } else {
      lines.push(this.colorize('✅ 未發現 Dead Code', Colors.green));
    }

    return lines.join('\n');
  }

  /**
   * 取得類型標籤
   */
  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      function: '函式',
      class: '類別',
      variable: '變數',
      interface: '介面',
      type: '型別',
      property: '屬性',
      method: '方法',
      enum: '列舉',
      constant: '常數'
    };
    return labels[type] || type;
  }

  /**
   * 取得 Dead Code 圖示
   */
  private getDeadCodeIcon(type: string): string {
    switch (type) {
      case 'function': return '⚡';
      case 'class': return '📦';
      case 'variable': return '📌';
      case 'interface': return '📋';
      case 'type': return '🏷️';
      default: return '💀';
    }
  }

  /**
   * 格式化 Snapshot 摘要
   */
  private formatSnapshotSummary(result: SnapshotResult): string {
    const lines: string[] = [];

    if (result.snapshotType === 'incremental') {
      return this.formatIncrementalSnapshotSummary(result.snapshot as IncrementalSnapshotData);
    }

    if (result.snapshotType === 'project') {
      const snapshot = result.snapshot as ProjectSnapshotData;
      lines.push(`📦 專案: ${snapshot.project}`);
      lines.push(`📁 模組數: ${Object.keys(snapshot.modules).length}`);

      for (const [modulePath, moduleSnapshot] of Object.entries(snapshot.modules)) {
        lines.push('');
        lines.push(`  📂 ${modulePath}`);
        lines.push(`     API: ${Object.keys(moduleSnapshot.api).length} classes`);
        lines.push(`     Factories: ${Object.keys(moduleSnapshot.factories).length}`);
        lines.push(`     Types: ${Object.keys(moduleSnapshot.types).length}`);
      }
    } else {
      const snapshot = result.snapshot as ModuleSnapshotData;
      lines.push(`📦 模組: ${snapshot.module}`);
      lines.push(`📊 API: ${Object.keys(snapshot.api).length} classes`);
      lines.push(`🏭 Factories: ${Object.keys(snapshot.factories).length}`);
      lines.push(`📝 Types: ${Object.keys(snapshot.types).length}`);
      lines.push(`🔒 Private: ${Object.keys(snapshot.private).length} classes`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化增量快照摘要
   */
  private formatIncrementalSnapshotSummary(snapshot: IncrementalSnapshotData): string {
    const lines: string[] = [];
    const { delta } = snapshot;

    lines.push(`📦 增量快照 (Version: ${snapshot.version})`);
    if (snapshot.baseVersion) {
      lines.push(`🔖 基準版本: ${snapshot.baseVersion}`);
    } else {
      lines.push('🔖 基準版本: (初始快照)');
    }
    lines.push('');

    // 新增
    const addedModules = Object.keys(delta.added.modules).length;
    const addedSymbols = delta.added.symbols.length;
    if (addedModules > 0 || addedSymbols > 0) {
      lines.push(this.colorize(`✨ 新增: ${addedModules} 個模組, ${addedSymbols} 個符號`, Colors.green));
      for (const [name, mod] of Object.entries(delta.added.modules)) {
        lines.push(`  📂 模組 ${name} (+${Object.keys(mod.api).length} APIs)`);
      }
      for (const sym of delta.added.symbols) {
        lines.push(`  ➕ ${sym.type} ${sym.module}.${sym.name}`);
      }
      lines.push('');
    }

    // 修改
    const modModules = delta.modified.modules.length;
    const modSymbols = delta.modified.symbols.length;
    if (modModules > 0 || modSymbols > 0) {
      lines.push(this.colorize(`📝 修改: ${modModules} 個模組, ${modSymbols} 個符號`, Colors.yellow));
      for (const mod of delta.modified.modules) {
        lines.push(`  📂 模組 ${mod}`);
      }
      for (const sym of delta.modified.symbols) {
        lines.push(`  ✏️  ${sym.type} ${sym.module}.${sym.name}`);
      }
      lines.push('');
    }

    // 刪除
    const delModules = delta.removed.modules.length;
    const delSymbols = delta.removed.symbols.length;
    if (delModules > 0 || delSymbols > 0) {
      lines.push(this.colorize(`🗑️  刪除: ${delModules} 個模組, ${delSymbols} 個符號`, Colors.red));
      for (const mod of delta.removed.modules) {
        lines.push(`  📂 模組 ${mod}`);
      }
      for (const sym of delta.removed.symbols) {
        lines.push(`  ➖ ${sym.type} ${sym.module}.${sym.name}`);
      }
      lines.push('');
    }

    if (addedModules === 0 && addedSymbols === 0 &&
      modModules === 0 && modSymbols === 0 &&
      delModules === 0 && delSymbols === 0) {
      lines.push(this.colorize('✅ 沒有變更', Colors.dim));
    }

    return lines.join('\n');
  }

  /**
   * 格式化 FindReferences 摘要
   */
  private formatFindReferencesSummary(result: FindReferencesResult): string {
    const lines: string[] = [];

    // 標題
    lines.push(`🔍 符號: ${result.symbol} (${result.type})`);

    // 定義位置
    if (result.definition) {
      const defLoc = `${result.definition.file}:${result.definition.line}:${result.definition.column}`;
      lines.push(`📍 定義: ${this.colorize(defLoc, Colors.cyan)}`);
    } else {
      lines.push(this.colorize('⚠️  找不到定義位置', Colors.yellow));
    }

    // 統計
    const filesAffected = new Set(result.references.map(r => r.file)).size;
    lines.push('');
    lines.push(`📊 找到 ${result.references.length} 個引用（${filesAffected} 個檔案）`);

    // 引用列表（按檔案分組）
    if (result.references.length > 0) {
      lines.push('');
      lines.push('引用列表:');

      const byFile = this.groupReferencesByFile(result.references);

      for (const [file, refs] of byFile) {
        lines.push(`  ${this.colorize(file, Colors.cyan)}`);
        refs.slice(0, 10).forEach(ref => {
          const typeIcon = this.getReferenceTypeIcon(ref.type);
          lines.push(`    ${typeIcon} L${ref.line}: ${ref.context.trim()}`);
        });
        if (refs.length > 10) {
          lines.push(`    ... 還有 ${refs.length - 10} 個引用`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 按檔案分組引用
   */
  private groupReferencesByFile(references: ReferenceItem[]): Map<string, ReferenceItem[]> {
    const byFile = new Map<string, ReferenceItem[]>();
    references.forEach(ref => {
      const list = byFile.get(ref.file) || [];
      list.push(ref);
      byFile.set(ref.file, list);
    });
    return byFile;
  }

  /**
   * 取得引用類型圖示
   */
  private getReferenceTypeIcon(type: string): string {
    switch (type) {
      case 'definition': return '📌';
      case 'import': return '📥';
      case 'export': return '📤';
      case 'usage':
      default: return '📞';
    }
  }

  /**
   * 格式化 CallHierarchy 摘要
   */
  private formatCallHierarchySummary(result: CallHierarchyResult): string {
    const lines: string[] = [];

    // 標題與定義位置
    lines.push(`📞 函數呼叫層次: ${result.function}`);
    const defLoc = result.definitionLine
      ? `${result.file}:${result.definitionLine}`
      : result.file;
    lines.push(`📍 定義位置: ${this.colorize(defLoc, Colors.cyan)}`);
    lines.push(`🔍 分析方向: ${result.direction}, 深度: ${result.depth}`);
    lines.push('');

    // Incoming（誰呼叫我）
    if (result.direction === 'incoming' || result.direction === 'both') {
      lines.push(`📥 呼叫者 (Incoming): ${result.incoming.length} 個`);
      if (result.incoming.length > 0) {
        const grouped = this.groupCallsByFile(result.incoming, 'caller');
        for (const [file, items] of grouped) {
          lines.push(`  ${this.colorize(file, Colors.cyan)}`);
          (items as IncomingCallItem[]).slice(0, 10).forEach(item => {
            lines.push(`    ⬅️  ${item.caller} (L${item.line})`);
          });
          if (items.length > 10) {
            lines.push(`    ... 還有 ${items.length - 10} 個呼叫者`);
          }
        }
      }
      lines.push('');
    }

    // Outgoing（我呼叫誰）
    if (result.direction === 'outgoing' || result.direction === 'both') {
      lines.push(`📤 被呼叫者 (Outgoing): ${result.outgoing.length} 個`);
      if (result.outgoing.length > 0) {
        const grouped = this.groupCallsByFile(result.outgoing, 'callee');
        for (const [file, items] of grouped) {
          lines.push(`  ${this.colorize(file, Colors.cyan)}`);
          (items as OutgoingCallItem[]).slice(0, 10).forEach(item => {
            lines.push(`    ➡️  ${item.callee} (L${item.line})`);
          });
          if (items.length > 10) {
            lines.push(`    ... 還有 ${items.length - 10} 個被呼叫者`);
          }
        }
      }
      lines.push('');
    }

    // 統計
    const uniqueFiles = new Set([
      ...result.incoming.map(i => i.file),
      ...result.outgoing.map(o => o.file)
    ]).size;
    lines.push(`📊 統計: ${result.incoming.length} incoming, ${result.outgoing.length} outgoing, ${uniqueFiles} 個檔案`);

    return lines.join('\n');
  }

  /**
   * 按檔案分組呼叫項目
   */
  private groupCallsByFile<T extends { file: string }>(items: T[], _nameKey: string): Map<string, T[]> {
    const byFile = new Map<string, T[]>();
    items.forEach(item => {
      const list = byFile.get(item.file) || [];
      list.push(item);
      byFile.set(item.file, list);
    });
    return byFile;
  }

  /**
   * 格式化預設摘要（fallback）
   */
  private formatDefaultSummary(result: QueryResult): string {
    const lines: string[] = [];

    lines.push(`命令: ${result.command}`);
    lines.push(`成功: ${result.success ? '是' : '否'}`);

    if (result.summary) {
      lines.push('');
      lines.push('摘要:');
      Object.entries(result.summary).forEach(([key, value]) => {
        lines.push(`  ${key}: ${value}`);
      });
    }

    if (result.issues && result.issues.length > 0) {
      lines.push('');
      lines.push(`問題數: ${result.issues.length}`);
    }

    return lines.join('\n');
  }

  /**
   * 套用顏色（如果啟用）
   */
  private colorize(text: string, color: string): string {
    if (!this.color) { return text; }
    return `${color}${text}${Colors.reset}`;
  }
}

/**
 * 建立 QueryFormatter 的工廠函數
 */
export function createQueryFormatter(options: Partial<QueryFormatterOptions> = {}): QueryFormatter {
  const finalOptions: Partial<QueryFormatterOptions> = {
    color: options.color ?? (process.stdout.isTTY ?? false)
  };
  return new QueryFormatter(finalOptions);
}
