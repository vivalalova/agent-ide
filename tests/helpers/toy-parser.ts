import type {
  AST,
  Dependency,
  Reference,
  Symbol
} from '@shared/types/index.js';
import {
  DependencyType,
  SymbolType,
  createAST,
  createASTMetadata,
  createASTNode,
  createDependency,
  createLocation,
  createPosition,
  createRange,
  createSymbol
} from '@shared/types/index.js';
import type {
  CodeEdit,
  Definition,
  ParserCapabilities,
  ParserPlugin,
  Usage,
  ValidationResult
} from '@infrastructure/parser/index.js';

export function createToyParser(capabilities: Partial<ParserCapabilities> = {}): ParserPlugin {
  return new ToyParser(capabilities);
}

class ToyParser implements ParserPlugin {
  readonly name = 'toy';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.toy'] as const;
  readonly supportedLanguages = ['toy'] as const;

  constructor(private readonly capabilities: Partial<ParserCapabilities>) {}

  async parse(code: string, filePath: string): Promise<AST> {
    const lines = code.split('\n');
    const endLine = Math.max(lines.length, 1);
    const endColumn = Math.max(lines[endLine - 1]?.length ?? 0, 1);
    const root = createASTNode(
      'ToyProgram',
      createRange(createPosition(1, 1), createPosition(endLine, endColumn)),
      { code },
      []
    );

    return createAST(filePath, root, createASTMetadata('toy', this.version));
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const code = this.getCode(ast);
    const symbols: Symbol[] = [];

    code.split('\n').forEach((line, index) => {
      const match = /^(?:symbol|fn)\s+([A-Za-z_]\w*)/.exec(line.trim());
      if (!match) {
        return;
      }

      const name = match[1];
      const lineNumber = index + 1;
      const column = line.indexOf(name) + 1;
      const range = createRange(
        createPosition(lineNumber, column),
        createPosition(lineNumber, column + name.length)
      );
      const type = line.trim().startsWith('fn ') ? SymbolType.Function : SymbolType.Variable;
      symbols.push(createSymbol(name, type, createLocation(ast.sourceFile, range)));
    });

    return symbols;
  }

  async findReferences(): Promise<Reference[]> {
    return [];
  }

  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const code = this.getCode(ast);
    const dependencies: Dependency[] = [];
    const importPattern = /^\s*import\s+['"]([^'"]+)['"]/gm;
    let match: RegExpExecArray | null;

    while ((match = importPattern.exec(code)) !== null) {
      dependencies.push(createDependency(match[1], DependencyType.Import, match[1].startsWith('.')));
    }

    return dependencies;
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
      supportsMoveMember: false,
      ...this.capabilities
    };
  }

  private getCode(ast: AST): string {
    const code = ast.root.properties.code;
    return typeof code === 'string' ? code : '';
  }
}
