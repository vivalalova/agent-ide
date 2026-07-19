/**
 * TypeScript 符號引用解析器
 *
 * 負責 findReferences 的完整編排：Language Service anchor 查找、
 * AST 直接引用收集、ES2022 私有欄位的作用域感知掃描回退、
 * 以及無 Language Service 時的基本 AST 遍歷回退。
 */

import * as ts from 'typescript';
import type { AST, Symbol, Reference, Range } from '@shared/types/index.js';
import { ReferenceType, getContainingClassName } from '@shared/types/index.js';
import {
  TypeScriptAST,
  TypeScriptSymbol,
  tsPositionToPosition,
  tsNodeToRange,
  isPrivateFieldDeclaration
} from './types.js';
import { isSameDeclaringFile } from '@plugins/shared/index.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';
import type { ModuleSpecifierResolver } from '@infrastructure/parser/types.js';
import type { ILanguageServiceManager } from './language-service.js';
import type { ScopeAnalyzer } from './scope-analyzer.js';
import type { ReferenceFinder } from './reference-finder.js';
import { getShorthandKeyText } from './shorthand-rename.js';
import { isDeclarationNode } from './node-locator.js';

/**
 * 符號引用解析器類別
 */
export class ReferenceResolver {
  constructor(
    private readonly languageServiceManager: ILanguageServiceManager,
    private readonly scopeAnalyzer: ScopeAnalyzer,
    private readonly referenceFinder: ReferenceFinder
  ) {}

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol, moduleResolver?: ModuleSpecifierResolver): Promise<Reference[]> {
    const typedAst = ast as TypeScriptAST;
    const typedSymbol = symbol as TypeScriptSymbol;

    // ES2022 私有欄位/方法（`#secret`）恆宣告於單一 class、無法跨模組 export/import，
    // 天生檔案（class）作用域封閉。Language Service 的 identifier-anchor 機制
    // （getSymbolPosition → scopeAnalyzer.getIdentifierFromSymbolNode）只認 ts.Identifier，
    // 對 PrivateIdentifier 名稱一律回傳 null，導致 symbolPosition 恆為 undefined、
    // LS 完全找不到引用。私有欄位不需要 LS 的跨檔案/import binding 錨定能力，直接複用
    // referenceFinder 的作用域感知掃描（與 findScopedReferences 同一套邏輯，已原生支援
    // PrivateIdentifier 宣告點與 `this.#x` 使用處偵測），避免重造一套 anchor 機制。
    if (isPrivateFieldDeclaration(typedSymbol.tsNode)) {
      return this.findPrivateFieldReferences(typedAst, typedSymbol);
    }

    // 確保 Language Service 已初始化
    this.languageServiceManager.ensureInitialized(typedAst.tsSourceFile);

    if (!this.languageServiceManager.languageService) {
      // 如果無法使用 Language Service，回退到原始方法
      return this.findReferencesBasic(ast, symbol);
    }

    const fileName = typedAst.tsSourceFile.fileName;

    const references: Reference[] = [];

    // 取得符號位置（同檔定義或 named/default import binding 的 anchor）
    const symbolPosition = this.languageServiceManager.getSymbolPosition(
      typedSymbol,
      typedAst.tsSourceFile,
      (node) => this.scopeAnalyzer.getIdentifierFromSymbolNode(node) ?? undefined,
      moduleResolver
    );

    // 使用 Language Service 從 anchor 查找引用
    if (symbolPosition !== undefined) {
      const referencesResult = this.languageServiceManager.languageService.findReferences(fileName, symbolPosition);

      for (const refSymbol of referencesResult ?? []) {
        for (const ref of refSymbol.references) {
          const sourceFile = this.languageServiceManager.getSourceFileFromFileName(ref.fileName);
          if (!sourceFile) { continue; }

          const range: Range = {
            start: tsPositionToPosition(sourceFile, ref.textSpan.start),
            end: tsPositionToPosition(sourceFile, ref.textSpan.start + ref.textSpan.length)
          };

          const refType: ReferenceType = ref.isDefinition
            ? ReferenceType.Definition
            : ReferenceType.Usage;

          // object literal shorthand（`{ foo }`）與 destructuring shorthand
          // （`const { foo } = opts`）：此 token 同時是 key 與 value/binding，
          // 天真替換成 newName 會把 key 一併改掉（缺陷：見
          // tests/e2e/commands/typescript/cli-rename-shorthand-bugs.e2e.test.ts）。
          // 標記後由 rename edit 產生端展開為 `key: newName`。
          const shorthandKeyText = getShorthandKeyText(sourceFile, ref.textSpan.start);

          references.push({
            symbol,
            location: {
              filePath: ref.fileName,
              range
            },
            type: refType,
            ...(shorthandKeyText !== undefined ? { shorthandKeyText } : {})
          });
        }
      }
    }

    // LS 單檔掛載無法綁回的直接引用（缺陷 F2b：`ns.member`；缺陷 R2-1：barrel re-export
    // specifier）：LS 需跨模組解析才能綁回 export，但此處每次僅掛載單一檔案（memfs/未落盤環境
    // 無法解析），故改由 AST 直接收集當前檔案的命中。
    // 去重：混用 named + namespace/re-export 時，落盤環境下 LS 可能已由 named anchor 一併回傳，
    // 避免同一範圍重複產生 TextChange。
    const seenRanges = new Set(
      references
        .filter(ref => ref.location.filePath === fileName)
        .map(ref => rangeKey(ref.location.range))
    );
    const astDirectSpans = this.languageServiceManager.getAstDirectReferenceSpans(
      typedSymbol,
      typedAst.tsSourceFile,
      moduleResolver
    );
    for (const span of astDirectSpans) {
      const range: Range = {
        start: tsPositionToPosition(typedAst.tsSourceFile, span.start),
        end: tsPositionToPosition(typedAst.tsSourceFile, span.end)
      };
      const key = rangeKey(range);
      if (seenRanges.has(key)) {
        continue;
      }
      seenRanges.add(key);
      references.push({
        symbol,
        location: { filePath: fileName, range },
        type: ReferenceType.Usage
      });
    }

    return references;
  }

  /**
   * ES2022 私有欄位/方法（`#secret`）的引用查找：恆同檔案、恆同 class，
   * 直接複用 referenceFinder 的作用域感知掃描（與 CLI `findScopedReferences` 同一套邏輯），
   * 並以宣告所屬 class 名稱限定範圍，避免不同類別的同名私有成員被誤合併。
   */
  private findPrivateFieldReferences(typedAst: TypeScriptAST, typedSymbol: TypeScriptSymbol): Reference[] {
    const fileName = typedAst.tsSourceFile.fileName;

    // 檔案身份守衛：私有欄位/方法恆宣告於單一 class、無法跨檔案引用。
    // rename 等命令逐檔掃描全專案時，非宣告檔上同名的屬性存取（如 `cfg.secret`）
    // 純屬字面巧合，下方 findScopedReferences 對推不出 receiver 型別的屬性存取
    // 「寧留勿漏」，若不在此擋下會被誤判為引用（見 isSameDeclaringFile 說明與
    // cli-private-field-symbol-defect.e2e.test.ts 的跨檔誤改 regression）。
    if (!isSameDeclaringFile(fileName, typedSymbol.location.filePath)) {
      return [];
    }

    const containerName = getContainingClassName(typedSymbol);
    const scopedRefs = this.referenceFinder.findScopedReferences(
      typedAst.tsSourceFile.getFullText(),
      typedSymbol.name,
      { className: containerName }
    ) ?? [];

    return scopedRefs.map(ref => ({
      symbol: typedSymbol,
      location: { filePath: fileName, range: ref.location.range },
      type: ref.kind === ScopedReferenceKind.Definition ? ReferenceType.Definition : ReferenceType.Usage
    }));
  }

  /**
   * 基本的符號引用查找（回退方法）
   * 使用 AST 遍歷，過濾字串和註解中的符號
   */
  private async findReferencesBasic(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as TypeScriptAST;
    const typedSymbol = symbol as TypeScriptSymbol;

    const references: Reference[] = [];
    const symbolName = typedSymbol.name;

    // 獲取符號的標識符節點
    const symbolIdentifier = this.scopeAnalyzer.getIdentifierFromSymbolNode(typedSymbol.tsNode);
    if (!symbolIdentifier) {
      return references;
    }

    // 使用 TypeScript 原生的節點遍歷，收集所有標識符
    const collectIdentifiers = (node: ts.Node): void => {
      // 過濾：跳過字串字面值
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return; // 不處理子節點
      }

      // 過濾：跳過模板字串
      if (ts.isTemplateExpression(node)) {
        // 只處理模板表達式中的插值部分，跳過字串部分
        node.templateSpans.forEach(span => {
          collectIdentifiers(span.expression);
        });
        return;
      }

      if (ts.isIdentifier(node) && node.text === symbolName) {
        // 檢查這個標識符是否真的引用了我們的符號
        if (this.scopeAnalyzer.isReferenceToSymbol(node, typedSymbol)) {
          const location = {
            filePath: typedAst.tsSourceFile.fileName,
            range: tsNodeToRange(node, typedAst.tsSourceFile)
          };

          const referenceType = this.scopeAnalyzer.getReferenceType(
            node,
            typedSymbol,
            isDeclarationNode
          );

          references.push({
            symbol,
            location,
            type: referenceType
          });
        }
      }

      // 遞歸處理所有子節點
      ts.forEachChild(node, collectIdentifiers);
    };

    // 從 SourceFile 開始遍歷
    collectIdentifiers(typedAst.tsSourceFile);
    return references;
  }
}

/**
 * 產生 Range 的去重鍵（行列座標）
 */
function rangeKey(range: Range): string {
  return `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
}

/**
 * 建立符號引用解析器實例
 */
export function createReferenceResolver(
  languageServiceManager: ILanguageServiceManager,
  scopeAnalyzer: ScopeAnalyzer,
  referenceFinder: ReferenceFinder
): ReferenceResolver {
  return new ReferenceResolver(languageServiceManager, scopeAnalyzer, referenceFinder);
}
