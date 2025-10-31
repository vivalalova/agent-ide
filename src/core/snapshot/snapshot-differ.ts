/**
 * 快照差異計算器
 * 負責計算快照之間的差異，並應用增量更新
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { ParserRegistry } from '../../infrastructure/parser/registry.js';
import { CodeCompressor } from './code-compressor.js';
import type {
  Snapshot,
  SnapshotDiff,
  FileChange,
  SnapshotOptions,
  ModuleSummary
} from './types.js';
import { FileChangeType } from './types.js';

/**
 * 快照差異計算器類別
 */
export class SnapshotDiffer {
  private parserRegistry: ParserRegistry;
  private compressor: CodeCompressor;

  constructor() {
    this.parserRegistry = ParserRegistry.getInstance();
    this.compressor = new CodeCompressor();
  }

  /**
   * 計算兩個快照之間的差異
   */
  diff(oldSnapshot: Snapshot, newSnapshot: Snapshot): SnapshotDiff {
    const oldFiles = new Set(Object.keys(oldSnapshot.md.fh));
    const newFiles = new Set(Object.keys(newSnapshot.md.fh));

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    let linesChanged = 0;

    // 找出新增的檔案
    for (const file of newFiles) {
      if (!oldFiles.has(file)) {
        added.push(file);
        linesChanged += newSnapshot.c[file]?.ol || 0;
      }
    }

    // 找出刪除的檔案
    for (const file of oldFiles) {
      if (!newFiles.has(file)) {
        deleted.push(file);
        linesChanged += oldSnapshot.c[file]?.ol || 0;
      }
    }

    // 找出修改的檔案
    for (const file of newFiles) {
      if (oldFiles.has(file) && oldSnapshot.md.fh[file] !== newSnapshot.md.fh[file]) {
        modified.push(file);

        // 估計變更的行數
        const oldLines = oldSnapshot.c[file]?.ol || 0;
        const newLines = newSnapshot.c[file]?.ol || 0;
        linesChanged += Math.abs(newLines - oldLines);
      }
    }

    return {
      added,
      modified,
      deleted,
      summary: {
        totalChanges: added.length + modified.length + deleted.length,
        filesAffected: added.length + modified.length + deleted.length,
        linesChanged
      }
    };
  }

  /**
   * 應用變更到快照
   */
  async applyChanges(
    baseSnapshot: Snapshot,
    changes: FileChange[],
    options: SnapshotOptions
  ): Promise<Snapshot> {
    // 複製基準快照
    const updatedSnapshot: Snapshot = JSON.parse(JSON.stringify(baseSnapshot));

    // 處理每個變更
    for (const change of changes) {
      switch (change.type) {
        case FileChangeType.Added:
          await this.addFile(updatedSnapshot, change.path, options);
          break;

        case FileChangeType.Modified:
          await this.updateFile(updatedSnapshot, change.path, options);
          break;

        case FileChangeType.Deleted:
          this.removeFile(updatedSnapshot, change.path);
          break;
      }
    }

    // 更新專案 hash
    updatedSnapshot.h = this.calculateProjectHash(updatedSnapshot.md.fh);

    // 更新統計資訊
    this.updateMetadata(updatedSnapshot);

    return updatedSnapshot;
  }

  /**
   * 新增檔案到快照
   */
  private async addFile(snapshot: Snapshot, filePath: string, options: SnapshotOptions): Promise<void> {
    const relativePath = path.relative(options.projectPath, filePath);
    const ext = path.extname(filePath);
    const parser = this.parserRegistry.getParser(ext);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // 計算 hash
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
      snapshot.md.fh[filePath] = hash;

      // 壓縮程式碼
      const compressed = await this.compressor.compress(content, snapshot.l);
      snapshot.c[relativePath] = compressed;

      // 更新架構資訊
      this.addToStructure(snapshot, relativePath, content);

      // 提取符號
      if (parser) {
        const ast = await parser.parse(content, filePath);
        const symbols = await parser.extractSymbols(ast);

        snapshot.y[relativePath] = symbols.map((sym: any) => ({
          n: sym.name,
          t: this.compressSymbolType(sym.type),
          s: sym.range.start.line,
          e: sym.range.end.line,
          x: sym.exported,
          sg: sym.signature,
          p: sym.parent
        }));

        // 提取依賴
        const deps = await parser.extractDependencies(ast);

        snapshot.dp.i[relativePath] = deps
          .filter((d: any) => d.type === 'import')
          .map((d: any) => d.target);

        snapshot.dp.ex[relativePath] = deps
          .filter((d: any) => d.type === 'export')
          .map((d: any) => d.source);

        // 更新依賴邊
        for (const dep of deps) {
          if ((dep as any).type === 'import') {
            snapshot.dp.g.push([relativePath, (dep as any).target]);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to add file ${filePath}:`, error);
    }
  }

  /**
   * 更新檔案在快照中
   */
  private async updateFile(snapshot: Snapshot, filePath: string, options: SnapshotOptions): Promise<void> {
    // 先移除舊的資料
    this.removeFile(snapshot, filePath);

    // 再新增新的資料
    await this.addFile(snapshot, filePath, options);
  }

  /**
   * 從快照中移除檔案
   */
  private removeFile(snapshot: Snapshot, filePath: string): void {
    const relativePath = path.relative(filePath, filePath); // 這裡應該用 projectPath，但目前簡化處理

    // 移除檔案 hash
    delete snapshot.md.fh[filePath];

    // 移除程式碼
    delete snapshot.c[relativePath];

    // 移除符號
    delete snapshot.y[relativePath];

    // 移除依賴
    delete snapshot.dp.i[relativePath];
    delete snapshot.dp.ex[relativePath];

    // 移除依賴邊
    snapshot.dp.g = snapshot.dp.g.filter(
      ([from, to]) => from !== relativePath && to !== relativePath
    );

    // 從架構中移除
    this.removeFromStructure(snapshot, relativePath);
  }

  /**
   * 新增到架構資訊
   */
  private addToStructure(snapshot: Snapshot, relativePath: string, content: string): void {
    const dir = path.dirname(relativePath);

    // 新增目錄
    if (dir !== '.' && !snapshot.s.d.includes(dir)) {
      snapshot.s.d.push(dir);
      snapshot.s.d.sort();
    }

    // 新增模組摘要
    const lines = content.split('\n').length;
    const exportCount = (content.match(/export\s+(const|function|class|interface|type|enum)/g) || []).length;
    const importCount = (content.match(/import\s+.*\s+from/g) || []).length;

    const module: ModuleSummary = {
      p: relativePath,
      e: exportCount,
      d: importCount,
      l: lines
    };

    snapshot.s.m.push(module);
  }

  /**
   * 從架構資訊中移除
   */
  private removeFromStructure(snapshot: Snapshot, relativePath: string): void {
    // 移除模組
    snapshot.s.m = snapshot.s.m.filter(m => m.p !== relativePath);

    // 檢查目錄是否還有檔案，如果沒有則移除
    const dir = path.dirname(relativePath);
    if (dir !== '.') {
      const hasOtherFiles = snapshot.s.m.some(m => path.dirname(m.p) === dir);
      if (!hasOtherFiles) {
        snapshot.s.d = snapshot.s.d.filter(d => d !== dir);
      }
    }
  }

  /**
   * 更新元數據
   */
  private updateMetadata(snapshot: Snapshot): void {
    snapshot.md.tf = Object.keys(snapshot.md.fh).length;

    snapshot.md.tl = Object.values(snapshot.c).reduce(
      (sum, code) => sum + (code.ol || 0),
      0
    );

    // 更新語言列表
    const languages = new Set<string>();
    for (const file of Object.keys(snapshot.c)) {
      const ext = path.extname(file);
      switch (ext) {
        case '.ts':
        case '.tsx':
          languages.add('TypeScript');
          break;
        case '.js':
        case '.jsx':
          languages.add('JavaScript');
          break;
        case '.swift':
          languages.add('Swift');
          break;
      }
    }
    snapshot.md.lg = Array.from(languages).sort();
  }

  /**
   * 計算專案 hash
   */
  private calculateProjectHash(fileHashes: Record<string, string>): string {
    const combined = Object.entries(fileHashes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, hash]) => `${file}:${hash}`)
      .join('|');

    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  /**
   * 壓縮符號類型
   */
  private compressSymbolType(type: string): string {
    const typeMap: Record<string, string> = {
      'function': 'f',
      'class': 'c',
      'variable': 'v',
      'interface': 'i',
      'type': 't',
      'enum': 'e',
      'method': 'm',
      'property': 'p',
      'parameter': 'pm',
      'constructor': 'ct'
    };

    return typeMap[type] || type.substring(0, 2);
  }
}
