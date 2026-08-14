/**
 * PR #61 第二輪 review 缺陷 T4（reproduction，先紅後綠）
 *
 * call-hierarchy-analyzer.ts:1433 `isLexicallyShadowedAtCallSite` 開頭的
 * ASCII-only guard `/^[A-Za-z_$][A-Za-z0-9_$]*$/` 讓 Unicode 識別符
 * （如 `工具`）一律被判為「未遮蔽」，於是本地參數遮蔽了同名 import 時，
 * fallback 仍會跟著 import 追進外部模組，回報不存在的呼叫邊。
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

describe('CallHierarchyAnalyzer Unicode 識別符遮蔽（PR#61 R2 T4）', () => {
  it('[錯誤重現點] Unicode 名稱的本地宣告遮蔽同名 import 時，不得跟著 import 追進外部模組', async () => {
    const analyzer = await createAnalyzer({
      '/src/lib.ts': 'export function 工具() { return leaf(); }\nfunction leaf() { return 1; }',
      '/src/main.ts': [
        'import { 工具 } from "./lib.js";',
        'export function outer() {',
        '  const 工具 = () => local();',
        '  工具();',
        '}',
        'function local() { return 2; }'
      ].join('\n')
    });

    const result = await analyzer.analyze('outer', ['/src/lib.ts', '/src/main.ts'], {
      direction: 'outgoing',
      depth: 2
    });

    expect(result?.outgoing.map((call) => call.callee)).not.toContain('leaf');
  });
});
