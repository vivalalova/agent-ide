import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IndexEngine,
  createIndexConfig
} from '@core/foundations/indexing/index.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type {
  AST,
  CodeEdit,
  Definition,
  Dependency,
  Reference,
  Symbol,
  Usage,
  ValidationResult
} from '@shared/types/index.js';
import {
  SymbolType,
  createAST,
  createASTMetadata,
  createASTNode,
  createLocation,
  createPosition,
  createRange,
  createSymbol
} from '@shared/types/index.js';
import type { ParserCapabilities, ParserPlugin } from '@infrastructure/parser/index.js';

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * 可控制阻塞時機的假 parser：內容以 `GATE:` 開頭時，parse() 會先通知測試「已進入 parse」，
 * 再等待測試明確釋放才繼續完成——用來模擬「較舊的索引操作被卡住，較新的操作先完成」的競態。
 */
class GatedParser implements ParserPlugin {
  readonly name = 'gated';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.gt'] as const;
  readonly supportedLanguages = ['gated'] as const;

  private gate: { reached: ReturnType<typeof createDeferred>; release: ReturnType<typeof createDeferred> } | null = null;

  arm(): { reached: Promise<void>; release: () => void } {
    const reached = createDeferred();
    const release = createDeferred();
    this.gate = { reached, release };
    return { reached: reached.promise, release: release.resolve };
  }

  async parse(code: string, filePath: string): Promise<AST> {
    if (code.startsWith('GATE:') && this.gate) {
      this.gate.reached.resolve();
      await this.gate.release.promise;
    }
    const root = createASTNode(
      'Program',
      createRange(createPosition(1, 1), createPosition(1, 1)),
      { code },
      []
    );
    return createAST(filePath, root, createASTMetadata('gated', this.version));
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const code = (ast.root.properties.code as string).replace(/^GATE:/, '').trim();
    const range = createRange(createPosition(1, 1), createPosition(1, code.length + 1));
    return [createSymbol(code, SymbolType.Variable, createLocation(ast.sourceFile, range))];
  }

  async findReferences(): Promise<Reference[]> {
    return [];
  }

  async extractDependencies(): Promise<Dependency[]> {
    return [];
  }

  async rename(): Promise<CodeEdit[]> {
    return [];
  }

  async findDefinition(): Promise<Definition | null> {
    return null;
  }

  async findUsages(): Promise<Usage[]> {
    return [];
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true, errors: [], warnings: [] };
  }

  async dispose(): Promise<void> {}

  getCapabilities(): ParserCapabilities {
    return {
      supportsRename: false,
      supportsGoToDefinition: false,
      supportsFindUsages: false,
      supportsCodeActions: false,
      supportsChangeSignature: false,
      supportsCallHierarchy: false,
      supportsMoveMember: false
    };
  }
}

/** 讓目前所有已排入佇列的 microtask 先跑完（巨集任務 phase 保證微任務已清空） */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('IndexEngine 同路徑並行 indexFile 必須依發起順序序列化，不得「後完成蓋過先完成」', () => {
  let parser: GatedParser;

  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    parser = new GatedParser();
    registerDefaultParserFactory(() => parser);
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('較早發起但較慢完成的索引操作，不得在較晚發起且較快完成的操作之後覆蓋結果', async () => {
    const filePath = '/project/src/a.gt';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'GATE:Alpha'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    const gate = parser.arm();

    // op1：較早發起，會在 parse() 內卡住
    const op1 = engine.indexFile(filePath);
    await gate.reached; // 確認 op1 已經讀到 'GATE:Alpha' 並進入 parse() 的阻塞點

    // op2：較晚發起，內容已改成 'Beta'，parse() 不會阻塞
    await fileSystem.writeFile(filePath, 'Beta');
    const op2 = engine.indexFile(filePath);

    // 若目前實作沒有把同路徑操作序列化，op2 會在這段時間內就跑完並寫入 Beta
    await flushMicrotasks();

    // 現在才釋放 op1，讓它繼續完成（寫回它當初讀到的 Alpha）
    gate.release();

    await Promise.all([op1, op2]);

    // op2 是「較晚發起」的操作，必須是最終勝出的結果；
    // 若序列化正確，op2 要等 op1 完全結束才會真正開始執行、讀到當下檔案內容（Beta）
    const betaResults = await engine.findSymbol('Beta');
    const alphaResults = await engine.findSymbol('Alpha');

    expect(betaResults).toHaveLength(1);
    expect(alphaResults).toHaveLength(0);
  });
});
