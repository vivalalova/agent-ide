/**
 * 快照引擎
 * 負責生成、讀取、保存程式碼快照
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { glob } from 'glob';
import { IndexEngine } from '../indexing/index-engine.js';
import { DependencyAnalyzer } from '../dependency/dependency-analyzer.js';
import { ShitScoreAnalyzer } from '../shit-score/shit-score-analyzer.js';
import { ParserRegistry } from '../../infrastructure/parser/registry.js';
import { CodeCompressor } from './code-compressor.js';
import { SnapshotDiffer } from './snapshot-differ.js';
import { createIndexConfig } from '../indexing/types.js';
import type {
  Snapshot,
  SnapshotOptions,
  SnapshotStats,
  ModuleSummary,
  CompressedSymbol,
  QualityMetrics,
  FileChange
} from './types.js';
import {
  CompressionLevel,
  FileChangeType,
  createDefaultSnapshotOptions,
  estimateSnapshotTokens
} from './types.js';

/**
 * 快照引擎類別
 */
export class SnapshotEngine {
  private indexEngine?: IndexEngine;
  private dependencyAnalyzer?: DependencyAnalyzer;
  private shitScoreAnalyzer?: ShitScoreAnalyzer;
  private compressor: CodeCompressor;
  private differ: SnapshotDiffer;
  private parserRegistry: ParserRegistry;

  constructor() {
    this.compressor = new CodeCompressor();
    this.differ = new SnapshotDiffer();
    this.parserRegistry = ParserRegistry.getInstance();
  }

  /**
   * 生成快照
   */
  async generate(options: SnapshotOptions): Promise<Snapshot> {
    const startTime = Date.now();
    const fullOptions = { ...createDefaultSnapshotOptions(options.projectPath), ...options };

    // 初始化必要的組件
    await this.initialize(fullOptions);

    // 如果是增量更新，先嘗試讀取舊快照
    let baseSnapshot: Snapshot | null = null;
    if (fullOptions.incremental && fullOptions.outputPath) {
      baseSnapshot = await this.loadIfExists(fullOptions.outputPath);
    }

    // 掃描專案檔案
    const files = await this.scanFiles(fullOptions);

    // 如果是增量更新且有基準快照，計算差異
    if (baseSnapshot && fullOptions.incremental) {
      const changes = await this.detectChanges(baseSnapshot, files);

      // 如果沒有變更，直接返回舊快照
      if (changes.length === 0) {
        if (!fullOptions.silent) {
          console.log('No changes detected, using existing snapshot');
        }
        return baseSnapshot;
      }

      // 執行增量更新
      return await this.updateSnapshot(baseSnapshot, changes, fullOptions);
    }

    // 執行完整生成
    return await this.generateFull(files, fullOptions, startTime);
  }

  /**
   * 讀取快照
   */
  async load(snapshotPath: string): Promise<Snapshot> {
    const content = await fs.readFile(snapshotPath, 'utf-8');
    return JSON.parse(content) as Snapshot;
  }

  /**
   * 保存快照
   */
  async save(snapshot: Snapshot, outputPath: string): Promise<void> {
    // 確保輸出目錄存在
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // 寫入檔案
    const content = JSON.stringify(snapshot, null, 2);
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * 獲取快照統計資訊
   */
  getStats(snapshot: Snapshot): SnapshotStats {
    const fileCount = Object.keys(snapshot.c).length;
    const totalLines = snapshot.md.tl;
    const symbolCount = Object.values(snapshot.y).reduce((sum, symbols) => sum + symbols.length, 0);
    const dependencyCount = snapshot.dp.g.length;
    const estimatedTokens = estimateSnapshotTokens(snapshot);

    // 計算壓縮比例（原始行數 vs 壓縮後大小）
    const originalSize = totalLines * 50; // 假設每行平均 50 字元
    const compressedSize = JSON.stringify(snapshot).length;
    const compressionRatio = (1 - compressedSize / originalSize) * 100;

    return {
      fileCount,
      totalLines,
      symbolCount,
      dependencyCount,
      estimatedTokens,
      compressionRatio,
      generationTime: 0 // 需要從外部傳入
    };
  }

  /**
   * 初始化引擎組件
   */
  private async initialize(options: SnapshotOptions): Promise<void> {
    // 建立索引引擎
    const indexConfig = createIndexConfig(options.projectPath, {
      includeExtensions: options.extensions,
      excludePatterns: options.exclude
    });
    this.indexEngine = new IndexEngine(indexConfig);

    // 建立依賴分析器
    this.dependencyAnalyzer = new DependencyAnalyzer();

    // 建立 ShitScore 分析器
    this.shitScoreAnalyzer = new ShitScoreAnalyzer(this.parserRegistry);
  }

  /**
   * 掃描專案檔案
   */
  private async scanFiles(options: SnapshotOptions): Promise<string[]> {
    const patterns = options.extensions?.map(ext => `**/*${ext}`) || ['**/*.{ts,tsx,js,jsx,swift}'];
    const files: string[] = [];

    for (const pattern of patterns) {
      const matched = await glob(pattern, {
        cwd: options.projectPath,
        ignore: options.exclude || [],
        absolute: true
      });
      files.push(...matched);
    }

    return files;
  }

  /**
   * 完整生成快照
   */
  private async generateFull(
    files: string[],
    options: SnapshotOptions,
    startTime: number
  ): Promise<Snapshot> {
    if (!this.indexEngine || !this.dependencyAnalyzer || !this.shitScoreAnalyzer) {
      throw new Error('Engine not initialized');
    }

    // 建立索引
    if (!options.silent) {
      console.log(`Indexing ${files.length} files...`);
    }
    await this.indexEngine.indexProject();

    // 提取架構資訊
    if (!options.silent) {
      console.log('Extracting architecture...');
    }
    const structure = await this.extractStructure(files, options.projectPath);

    // 提取符號
    if (!options.silent) {
      console.log('Extracting symbols...');
    }
    const symbols = await this.extractSymbols(files, options.projectPath, options);

    // 分析依賴關係
    if (!options.silent) {
      console.log('Analyzing dependencies...');
    }
    const dependencies = await this.extractDependencies(files, options.projectPath);

    // 壓縮程式碼
    if (!options.silent) {
      console.log('Compressing code...');
    }
    const code = await this.compressCode(files, options.projectPath, options.level);

    // 計算品質指標
    if (!options.silent) {
      console.log('Calculating quality metrics...');
    }
    const quality = await this.calculateQuality(options.projectPath);

    // 計算檔案 hash
    const fileHashes = await this.calculateFileHashes(files);

    // 計算專案 hash
    const projectHash = this.calculateProjectHash(fileHashes);

    // 統計資訊
    const totalLines = Object.values(code).reduce((sum, c) => sum + (c.ol || 0), 0);
    const languages = this.detectLanguages(files);

    const snapshot: Snapshot = {
      v: '1.0.0',
      p: path.basename(options.projectPath),
      t: Date.now(),
      h: projectHash,
      l: options.level || CompressionLevel.Full,
      s: structure,
      y: symbols,
      dp: dependencies,
      c: code,
      q: quality,
      md: {
        fh: fileHashes,
        tf: files.length,
        tl: totalLines,
        lg: languages
      }
    };

    const endTime = Date.now();
    if (!options.silent) {
      console.log(`Snapshot generated in ${endTime - startTime}ms`);
      console.log(`Estimated tokens: ${estimateSnapshotTokens(snapshot)}`);
    }

    return snapshot;
  }

  /**
   * 增量更新快照
   */
  private async updateSnapshot(
    baseSnapshot: Snapshot,
    changes: FileChange[],
    options: SnapshotOptions
  ): Promise<Snapshot> {
    if (!options.silent) {
      console.log(`Updating snapshot with ${changes.length} changes...`);
    }

    // 應用變更
    const updatedSnapshot = await this.differ.applyChanges(baseSnapshot, changes, options);

    // 更新時間戳和 hash
    updatedSnapshot.t = Date.now();

    return updatedSnapshot;
  }

  /**
   * 檢測檔案變更
   */
  private async detectChanges(baseSnapshot: Snapshot, currentFiles: string[]): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    const baseFileHashes = baseSnapshot.md.fh;
    const currentFileHashes = await this.calculateFileHashes(currentFiles);

    // 檢測新增和修改
    for (const [file, hash] of Object.entries(currentFileHashes)) {
      if (!baseFileHashes[file]) {
        changes.push({ path: file, type: FileChangeType.Added, newHash: hash });
      } else if (baseFileHashes[file] !== hash) {
        changes.push({
          path: file,
          type: FileChangeType.Modified,
          oldHash: baseFileHashes[file],
          newHash: hash
        });
      }
    }

    // 檢測刪除
    for (const file of Object.keys(baseFileHashes)) {
      if (!currentFileHashes[file]) {
        changes.push({ path: file, type: FileChangeType.Deleted, oldHash: baseFileHashes[file] });
      }
    }

    return changes;
  }

  /**
   * 提取架構資訊
   */
  private async extractStructure(files: string[], projectPath: string): Promise<Snapshot['s']> {
    // 提取目錄結構
    const directories = new Set<string>();
    const modules: ModuleSummary[] = [];

    for (const file of files) {
      const relativePath = path.relative(projectPath, file);
      const dir = path.dirname(relativePath);
      if (dir !== '.') {
        directories.add(dir);
      }

      // 分析模組
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').length;

        // 計算匯出和依賴（簡化版）
        const exportCount = (content.match(/export\s+(const|function|class|interface|type|enum)/g) || []).length;
        const importCount = (content.match(/import\s+.*\s+from/g) || []).length;

        modules.push({
          p: relativePath,
          e: exportCount,
          d: importCount,
          l: lines
        });
      } catch {
        // 忽略讀取錯誤的檔案
      }
    }

    return {
      d: Array.from(directories).sort(),
      m: modules
    };
  }

  /**
   * 提取符號
   */
  private async extractSymbols(
    files: string[],
    projectPath: string,
    options: SnapshotOptions
  ): Promise<Record<string, CompressedSymbol[]>> {
    const symbols: Record<string, CompressedSymbol[]> = {};

    for (const file of files) {
      const relativePath = path.relative(projectPath, file);
      const ext = path.extname(file);
      const parser = this.parserRegistry.getParser(ext);

      if (!parser) {
        continue;
      }

      try {
        const content = await fs.readFile(file, 'utf-8');
        const ast = await parser.parse(content, file);
        const fileSymbols = await parser.extractSymbols(ast);

        // 壓縮符號資訊
        symbols[relativePath] = fileSymbols.map((sym: any) => ({
          n: sym.name,
          t: this.compressSymbolType(sym.type),
          s: sym.location.range.start.line,
          e: sym.location.range.end.line,
          x: sym.modifiers?.includes('export'),
          sg: undefined, // TODO: 未來可以從 Symbol 中提取簽章
          p: sym.scope?.name
        }));
      } catch (error) {
        // 忽略解析錯誤的檔案
        if (!options.silent) {
          console.warn(`Failed to extract symbols from ${relativePath}:`, error);
        }
      }
    }

    return symbols;
  }

  /**
   * 提取依賴關係
   */
  private async extractDependencies(
    files: string[],
    projectPath: string
  ): Promise<Snapshot['dp']> {
    if (!this.dependencyAnalyzer) {
      throw new Error('Dependency analyzer not initialized');
    }

    const edges: [string, string][] = [];
    const imports: Record<string, string[]> = {};
    const exports: Record<string, string[]> = {};

    for (const file of files) {
      const relativePath = path.relative(projectPath, file);
      const ext = path.extname(file);
      const parser = this.parserRegistry.getParser(ext);

      if (!parser) {
        continue;
      }

      try {
        const content = await fs.readFile(file, 'utf-8');
        const ast = await parser.parse(content, file);
        const deps = await parser.extractDependencies(ast);

        // 收集 import
        imports[relativePath] = deps
          .filter((d: any) => d.type === 'import')
          .map((d: any) => d.target);

        // 收集 export
        exports[relativePath] = deps
          .filter((d: any) => d.type === 'export')
          .map((d: any) => d.source);

        // 建立邊
        for (const dep of deps) {
          if ((dep as any).type === 'import') {
            edges.push([relativePath, (dep as any).target]);
          }
        }
      } catch {
        // 忽略解析錯誤的檔案
      }
    }

    return {
      g: edges,
      i: imports,
      ex: exports
    };
  }

  /**
   * 壓縮程式碼
   */
  private async compressCode(
    files: string[],
    projectPath: string,
    level: CompressionLevel = CompressionLevel.Full
  ): Promise<Snapshot['c']> {
    const code: Snapshot['c'] = {};

    for (const file of files) {
      const relativePath = path.relative(projectPath, file);

      try {
        const content = await fs.readFile(file, 'utf-8');
        const compressed = await this.compressor.compress(content, level);

        code[relativePath] = compressed;
      } catch {
        // 忽略壓縮錯誤的檔案
      }
    }

    return code;
  }

  /**
   * 計算品質指標
   */
  private async calculateQuality(projectPath: string): Promise<QualityMetrics> {
    if (!this.shitScoreAnalyzer) {
      throw new Error('ShitScore analyzer not initialized');
    }

    try {
      const result = await this.shitScoreAnalyzer.analyze(projectPath, {
        detailed: true,
        showFiles: false,
        topCount: 10
      });

      return {
        ss: result.shitScore,
        cx: result.dimensions.complexity.score,
        mt: result.dimensions.maintainability.score,
        is: (result.recommendations || []).slice(0, 10).map(r => r.suggestion)
      };
    } catch {
      // 如果分析失敗，返回預設值
      return {
        ss: 0,
        cx: 0,
        mt: 0,
        is: []
      };
    }
  }

  /**
   * 計算檔案 hash
   */
  private async calculateFileHashes(files: string[]): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
        hashes[file] = hash;
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    return hashes;
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
   * 檢測使用的語言
   */
  private detectLanguages(files: string[]): string[] {
    const languages = new Set<string>();

    for (const file of files) {
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

    return Array.from(languages).sort();
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

  /**
   * 嘗試讀取快照（如果存在）
   */
  private async loadIfExists(snapshotPath: string): Promise<Snapshot | null> {
    try {
      return await this.load(snapshotPath);
    } catch {
      return null;
    }
  }
}
