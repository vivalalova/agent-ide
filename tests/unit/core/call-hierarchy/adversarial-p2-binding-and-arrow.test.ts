/**
 * Call-hierarchy recursive resolution regressions.
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

describe('CallHierarchyAnalyzer recursive resolution regressions', () => {
  it('follows the caller import binding when same-named helpers exist', async () => {
    const analyzer = await createAnalyzer({
      '/src/helper-b.ts': 'export function helper() { return leafB(); }\nfunction leafB() { return 2; }',
      '/src/helper-a.ts': 'export function helper() { return leafA(); }\nfunction leafA() { return 1; }',
      '/src/caller.ts': 'import { helper } from "./helper-a.js";\nexport function top() { return helper(); }'
    });

    const result = await analyzer.analyze(
      'top',
      ['/src/helper-b.ts', '/src/helper-a.ts', '/src/caller.ts'],
      { direction: 'outgoing', depth: 2 }
    );

    expect(result?.outgoing.map(call => call.callee)).toContain('leafA');
    expect(result?.outgoing.map(call => call.callee)).not.toContain('leafB');
  });

  it('continues through a const arrow function at depth greater than one', async () => {
    const analyzer = await createAnalyzer({
      '/src/chain.ts': [
        'function leaf() { return 1; }',
        'const helper = () => leaf();',
        'export function top() { return helper(); }'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'top',
      ['/src/chain.ts'],
      { direction: 'outgoing', depth: 2 }
    );

    expect(result?.outgoing.map(call => call.callee)).toContain('leaf');
  });
});
