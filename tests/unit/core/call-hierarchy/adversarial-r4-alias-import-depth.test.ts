/**
 * R4 (缺陷 D): depth>1 outgoing call-hierarchy 不展開透過 tsconfig path-alias
 * import 的呼叫鏈。
 *
 * `resolveProjectImportPath`（call-hierarchy-analyzer.ts 約 554-561 行）對非 `.`／
 * 非 `/` 開頭的 module specifier 一律直接回傳 null：
 *
 *   if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
 *     return null;
 *   }
 *
 * `CallHierarchyAnalyzer` 完全沒有讀取 tsconfig（建構子只接受 parserRegistry 與
 * fileSystem，`analyze()` 也沒有 pathAliases 選項——見 grep 全檔案無
 * pathAlias/tsconfig/baseUrl/paths 命中），因此透過 alias（如 `@/lib.js`）import 的
 * callee 永遠無法被解析回定義檔，depth>1 時無法繼續往下展開該檔案內的呼叫。
 *
 * 場景：a.ts 的 outer() 呼叫從 `@/lib.js`（tsconfig paths `@/*` -> `src/*`）import 的
 * mid()；lib.ts 的 mid() 呼叫 inner()。查 outer 的 outgoing calls，depth 2 應含
 * inner，現行為只到 mid（因為 mid 所在檔案 lib.ts 解析失敗，無法再往下展開）。
 *
 * 正確契約（期望行為）：depth 2 outgoing 應包含 inner。
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

describe('CallHierarchyAnalyzer path-alias depth expansion (adversarial R4 / 缺陷 D)', () => {
  it('expands through a tsconfig path-alias import at depth greater than one', async () => {
    const analyzer = await createAnalyzer({
      '/proj/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } }
      }),
      '/proj/src/a.ts': [
        'import { mid } from \'@/lib.js\';',
        'export function outer() { return mid(); }'
      ].join('\n'),
      '/proj/src/lib.ts': [
        'export function mid() { return inner(); }',
        'function inner() { return 1; }'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'outer',
      ['/proj/src/a.ts', '/proj/src/lib.ts', '/proj/tsconfig.json'],
      { direction: 'outgoing', depth: 2 }
    );

    expect(result?.outgoing.map(call => call.callee)).toContain('inner');
  });
});
