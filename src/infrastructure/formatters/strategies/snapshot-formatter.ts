/**
 * Snapshot 命令格式化策略
 * 包含 Incremental 子類型處理
 */

import {
  type SnapshotResult,
  type ProjectSnapshotData,
  type ModuleSnapshotData,
  type IncrementalSnapshotData
} from '../query-types.js';
import { BaseFormatter, Colors } from './base-formatter.js';

/**
 * Snapshot 結果格式化器
 */
export class SnapshotFormatter extends BaseFormatter<SnapshotResult> {
  /**
   * 格式化 Snapshot 摘要
   */
  formatSummary(result: SnapshotResult): string {
    if (result.snapshotType === 'incremental') {
      return this.formatIncrementalSnapshotSummary(result.snapshot as IncrementalSnapshotData);
    }

    const lines: string[] = [];

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

    if (addedModules === 0 && addedSymbols === 0
      && modModules === 0 && modSymbols === 0
      && delModules === 0 && delSymbols === 0) {
      lines.push(this.colorize('✅ 沒有變更', Colors.dim));
    }

    return lines.join('\n');
  }
}
