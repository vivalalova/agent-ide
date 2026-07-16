/**
 * audit-fix C4 regression（先紅後綠）
 *
 * IndexEngine dispose 後：
 * - 已在飛行中的 indexFile 不得把結果寫回已釋放引擎；或
 * - dispose 後新發起的 indexFile 應拒絕
 *
 * 根因候選：indexFileSerialized 寫入臨界區未檢查 _disposed；
 * findSymbol 會擋 disposed，但 index 寫入路徑不會。
 */
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

class GatedParser implements ParserPlugin {
  readonly name = 'gated-c4';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.gt'] as const;
  readonly supportedLanguages = ['gated'] as const;

  private gate: {
    reached: ReturnType<typeof createDeferred>;
    release: ReturnType<typeof createDeferred>;
  } | null = null;

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

describe('audit-fix C4：IndexEngine dispose 後 in-flight / 後續 indexFile', () => {
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

  it('dispose 後再 indexFile 應拒絕（不得 silent 寫入）', async () => {
    const filePath = '/project/src/a.gt';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'Alive'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    await engine.indexFile(filePath);
    await engine.disposeAsync();

    await expect(engine.indexFile(filePath)).rejects.toThrow();
  });

  it('in-flight indexFile 在 dispose 後應失敗，不得成功寫回', async () => {
    const filePath = '/project/src/b.gt';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'GATE:StaleAfterDispose'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    const gate = parser.arm();
    const inflight = engine.indexFile(filePath);
    await gate.reached;

    // 解析仍卡住時釋放引擎
    await engine.disposeAsync();
    gate.release();

    // 契約：dispose 後完成的 in-flight 寫入必須 reject（不得 silent resolve 寫回）
    await expect(inflight).rejects.toThrow();
  });
});
