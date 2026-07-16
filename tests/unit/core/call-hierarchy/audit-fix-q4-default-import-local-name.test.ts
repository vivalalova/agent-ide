/**
 * audit-fix Q4 regression（先紅後綠）
 *
 * call-hierarchy outgoing depth>1：`import foo from './m'` 綁定的是 m 的
 * default export（`export default function bar`），展開時不得用 local 名 `foo`
 * 去 m 找定義；應解析到 bar 並繼續展開 bar 的 outgoing。
 *
 * 根因候選：findTypeScriptImportedBinding 對 default import 回
 * `importedName: call.callee`（local 名），findCalleeDefinition 再以該名
 * 在 importedFile 找定義 → 失敗，depth 停在 foo 呼叫本身。
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

describe('audit-fix Q4：call-hierarchy default import 不得用 local 名找 exported 定義', () => {
  it('outgoing depth 2 應經 default import 展開到 default export 本體內的 leaf', async () => {
    const analyzer = await createAnalyzer({
      '/src/m.ts': [
        'function leaf() { return 1; }',
        'export default function bar() { return leaf(); }'
      ].join('\n'),
      '/src/caller.ts': [
        "import foo from './m.js';",
        'export function outer() { return foo(); }'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'outer',
      ['/src/m.ts', '/src/caller.ts'],
      { direction: 'outgoing', depth: 2 }
    );

    const callees = result?.outgoing.map(call => call.callee) ?? [];

    // depth 1：呼叫 local binding foo
    expect(callees).toContain('foo');
    // depth 2：應進入 m 的 default export bar 並看到 leaf；不得因用 foo 在 m 找定義而失敗
    expect(callees).toContain('leaf');
  });

  it('default export 為匿名函式賦值時，outgoing depth 仍應展開其本體', async () => {
    const analyzer = await createAnalyzer({
      '/src/anon.ts': [
        'function leafAnon() { return 2; }',
        'export default function() { return leafAnon(); }'
      ].join('\n'),
      '/src/use-anon.ts': [
        "import run from './anon.js';",
        'export function top() { return run(); }'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'top',
      ['/src/anon.ts', '/src/use-anon.ts'],
      { direction: 'outgoing', depth: 2 }
    );

    const callees = result?.outgoing.map(call => call.callee) ?? [];
    expect(callees).toContain('run');
    expect(callees).toContain('leafAnon');
  });
});
