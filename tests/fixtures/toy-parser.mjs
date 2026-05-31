function createRange(line, column, length) {
  return {
    start: { line, column },
    end: { line, column: column + length }
  };
}

function createSymbol(name, filePath, line, column, type) {
  return {
    name,
    type,
    location: {
      filePath,
      range: createRange(line, column, name.length)
    },
    scope: undefined,
    modifiers: []
  };
}

export function createParser() {
  return {
    name: 'toy-worker',
    version: '1.0.0',
    supportedExtensions: ['.toy'],
    supportedLanguages: ['toy'],

    async parse(code, filePath) {
      const lines = code.split('\n');
      const endLine = Math.max(lines.length, 1);
      const endColumn = Math.max(lines[endLine - 1]?.length ?? 0, 1);
      return {
        sourceFile: filePath,
        root: {
          type: 'ToyProgram',
          range: {
            start: { line: 1, column: 1 },
            end: { line: endLine, column: endColumn }
          },
          properties: { code },
          children: []
        },
        metadata: {
          language: 'toy',
          version: '1.0.0',
          parserOptions: {},
          parseTime: 0,
          nodeCount: 1
        }
      };
    },

    async extractSymbols(ast) {
      const code = typeof ast.root.properties.code === 'string' ? ast.root.properties.code : '';
      const symbols = [];
      code.split('\n').forEach((line, index) => {
        const match = /^(?:symbol|fn)\s+([A-Za-z_]\w*)/.exec(line.trim());
        if (!match) {
          return;
        }
        const name = match[1];
        symbols.push(createSymbol(
          name,
          ast.sourceFile,
          index + 1,
          line.indexOf(name) + 1,
          line.trim().startsWith('fn ') ? 'function' : 'variable'
        ));
      });
      return symbols;
    },

    async findReferences() {
      return [];
    },

    async extractDependencies(ast) {
      const code = typeof ast.root.properties.code === 'string' ? ast.root.properties.code : '';
      const dependencies = [];
      const importPattern = /^\s*import\s+['"]([^'"]+)['"]/gm;
      let match;
      while ((match = importPattern.exec(code)) !== null) {
        dependencies.push({
          path: match[1],
          type: 'import',
          isRelative: match[1].startsWith('.'),
          importedSymbols: []
        });
      }
      return dependencies;
    },

    async rename() {
      return [];
    },

    async findDefinition() {
      return null;
    },

    async findUsages() {
      return [];
    },

    async validate() {
      return { valid: true, errors: [], warnings: [] };
    },

    async dispose() {},

    getCapabilities() {
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
  };
}
