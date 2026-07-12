/**
 * DeclarationAnalyzer Unit 測試（回歸缺陷 R2-6）
 *
 * R2-6：sourceFileCache 的 key 是弱雜湊 `${length}_${前100字元}_${後100字元}`。
 *       兩份程式碼若長度相同、前 100 與後 100 字元相同，但中段不同，會拿到
 *       同一把 hash key，第二次查詢時誤命中第一次快取的 SourceFile。
 */

import { describe, it, expect } from 'vitest';
import { createDeclarationAnalyzer } from '@plugins/typescript/declaration-analyzer.js';

describe('DeclarationAnalyzer - 回歸缺陷 R2-6', () => {
  it('同長、同前後 100 字元、中段不同的兩份程式碼不應共用彼此的 SourceFile 快取', () => {
    const analyzer = createDeclarationAnalyzer();

    // 前後綴皆為 >100 字元的註解，確保中段的 import 語句完全落在
    // code.slice(0, 100) 與 code.slice(-100) 都涵蓋不到的區間
    const prefix = `// ${'p'.repeat(150)}\n`;
    const suffix = `\n// ${'s'.repeat(150)}`;

    const codeA = `${prefix}import { fooR26 } from './moduleAR26';${suffix}`;
    const codeB = `${prefix}import { barR26 } from './moduleBR26';${suffix}`;

    // 觸發前提：長度、前 100、後 100 字元必須完全相同，中段（import 語句本身）必須不同
    expect(codeA.length).toBe(codeB.length);
    expect(codeA.slice(0, 100)).toBe(codeB.slice(0, 100));
    expect(codeA.slice(-100)).toBe(codeB.slice(-100));
    expect(codeA).not.toBe(codeB);

    // 先查 codeA，建立快取
    const declsA = analyzer.getImportDeclarations(codeA);
    expect(declsA).not.toBeNull();
    expect(declsA![0].namedImports[0].name).toBe('fooR26');

    // 再查 codeB：正確行為應反映 codeB 自身的 import（barR26）；
    // 目前的壞行為是 hash 碰撞命中 codeA 的 SourceFile，回傳 fooR26
    const declsB = analyzer.getImportDeclarations(codeB);
    expect(declsB).not.toBeNull();
    expect(declsB![0].namedImports[0].name).toBe('barR26');
    expect(declsB![0].moduleSpecifier).toBe('./moduleBR26');
  });
});
