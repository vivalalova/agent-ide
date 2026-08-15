/**
 * Call-hierarchy shadowed import binding regression.
 */
import { describe, expect, it } from 'vitest';
import { CallHierarchyAnalyzer } from '@core/call-hierarchy/call-hierarchy-analyzer.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';

function createParserRegistryFor(parsers: readonly ParserPlugin[]): ParserRegistry {
  const parsersByExtension = new Map<string, ParserPlugin>();
  for (const parser of parsers) {
    for (const extension of parser.supportedExtensions) {
      parsersByExtension.set(extension, parser);
    }
  }

  return {
    getParser: (extension: string) => parsersByExtension.get(extension) ?? null
  } as unknown as ParserRegistry;
}

async function createAnalyzer(files: Record<string, string>): Promise<CallHierarchyAnalyzer> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return new CallHierarchyAnalyzer(
    createParserRegistryFor([new TypeScriptParser(), new JavaScriptParser()]),
    fileSystem
  );
}

describe('CallHierarchyAnalyzer shadowed import binding (adversarial R5)', () => {
  it('does not follow a top-level import when a local binding of the same name shadows it', async () => {
    const analyzer = await createAnalyzer({
      '/src/a.ts': 'export function run() { return leaf(); }\nfunction leaf() { return 1; }',
      '/src/main.ts': [
        'import { run } from "./a.js";',
        'export function outer() {',
        '  const run = () => local();',
        '  run();',
        '}',
        'function local() { return 2; }'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'outer',
      ['/src/a.ts', '/src/main.ts'],
      { direction: 'outgoing', depth: 2 }
    );

    expect(result?.outgoing.map(call => call.callee)).not.toContain('leaf');
  });
});
