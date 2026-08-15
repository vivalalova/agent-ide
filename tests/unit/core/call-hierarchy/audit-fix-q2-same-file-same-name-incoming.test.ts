/**
 * audit-fix Q2 regression（先紅後綠）
 *
 * call-hierarchy incoming：同檔 outer `function foo` 與 inner/method 同名綁定。
 * 分析 outer 時，只應收指向 outer 的呼叫；不得把呼叫 inner 同名綁定的 enclosing
 * function 誤列為 incoming（findIncomingCalls 對同檔 callSite 目前一律放行）。
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

describe('audit-fix Q2：call-hierarchy 同檔同名不同綁定 incoming 誤收', () => {
  it('分析 outer foo 的 incoming 時，不應把呼叫 inner foo 的 enclosing 函式列進來', async () => {
    const analyzer = await createAnalyzer({
      '/src/same-name.ts': [
        'export function foo() {',
        '  return 1;',
        '}',
        '',
        'export function callsInner() {',
        '  function foo() {',
        '    return 2;',
        '  }',
        '  return foo();',
        '}',
        '',
        'export function callsOuter() {',
        '  return foo();',
        '}'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'foo',
      ['/src/same-name.ts'],
      { direction: 'incoming', depth: 1 }
    );

    const callers = result?.incoming.map(call => call.caller) ?? [];

    // 真正呼叫 outer export foo 的函式必須被找到
    expect(callers).toContain('callsOuter');
    // 只呼叫 shadow 後 inner foo 的函式不得誤列
    expect(callers).not.toContain('callsInner');
  });

  it('分析模組級 process 的 incoming 時，不應把 class method this.process 的 caller 誤列', async () => {
    const analyzer = await createAnalyzer({
      '/src/method-shadow.ts': [
        'export function process() {',
        '  return 0;',
        '}',
        '',
        'export class Handler {',
        '  process() {',
        '    return 1;',
        '  }',
        '  run() {',
        '    return this.process();',
        '  }',
        '}',
        '',
        'export function main() {',
        '  return process();',
        '}'
      ].join('\n')
    });

    const result = await analyzer.analyze(
      'process',
      ['/src/method-shadow.ts'],
      { direction: 'incoming', depth: 1 }
    );

    const callers = result?.incoming.map(call => call.caller) ?? [];

    expect(callers).toContain('main');
    // this.process() 綁定到 Handler.process，與模組級 process 無關
    expect(callers).not.toContain('run');
  });
});
