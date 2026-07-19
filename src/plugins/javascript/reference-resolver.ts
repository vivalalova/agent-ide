/**
 * JavaScript 符號引用解析器（Babel AST）
 *
 * 負責 findReferences 的完整編排：Babel traverse 全檔案掃描、
 * CJS require 解構跨檔綁定判定、class method 成員存取 receiver 型別推斷、
 * 以及 ES2022 私有欄位的作用域感知掃描回退。
 */

import { dirname, resolve as pathResolve } from 'node:path';
import * as babel from '@babel/types';
import babelTraverse, { type Binding, NodePath } from '@babel/traverse';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

import type { AST, Reference, Symbol } from '@shared/types/index.js';
import {
  ReferenceType,
  createReference,
  getContainingClassName,
  isFunctionLocalSymbol
} from '@shared/types/index.js';
import { isSameDeclaringFile } from '@plugins/shared/index.js';
import { ScopedReferenceKind, type ScopedReference } from '@infrastructure/parser/index.js';
import { JavaScriptAST, JavaScriptSymbol, getNodeRange, isPrivateFieldDeclaration } from './types.js';
import { isRequireCallExpression } from './cjs-require-ast.js';
import { getShorthandKeyText } from './shorthand-rename.js';
import type { ReferenceFinder } from './reference-finder.js';

/**
 * 符號引用解析器類別
 */
export class ReferenceResolver {
  constructor(private readonly referenceFinder: ReferenceFinder) {}

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const typedAst = ast as JavaScriptAST;
    const typedSymbol = symbol as JavaScriptSymbol;

    // ES2022 私有欄位/方法（`#secret`）：AST node kind 是 ClassPrivateProperty/
    // ClassPrivateMethod（key 為 PrivateName），下方以 Identifier 為主的
    // isReferenceToSymbol 判定完全比對不到 PrivateName 節點。私有欄位天生
    // class 作用域封閉，直接複用 ReferenceFinder.findScopedReferences 的
    // PrivateName 感知掃描（find-references CLI 命令的同一套邏輯），對齊
    // TS 側 findPrivateFieldReferences（見 plugins/typescript/parser.ts）。
    if (isPrivateFieldDeclaration(typedSymbol.babelNode)) {
      return this.findPrivateFieldReferences(typedAst, typedSymbol);
    }

    const references: Reference[] = [];

    // 使用 Babel traverse 查找引用
    traverse(typedAst.babelAST, {
      Identifier: (path: NodePath<babel.Identifier>) => {
        if (path.node.name === typedSymbol.name) {
          // 檢查是否為真正的引用（帶目前檔案路徑，供 CJS require 來源比對）
          if (this.isReferenceToSymbol(path, typedSymbol, typedAst.sourceFile)) {
            const location = {
              filePath: typedAst.sourceFile,
              range: getNodeRange(path.node)
            };

            const referenceType = this.getReferenceType(path, typedSymbol);

            // object literal shorthand（`{ foo }`）與 destructuring shorthand
            // （`const { foo } = opts`）：此 token 同時是 key 與 value/binding，
            // 天真替換成 newName 會把 key 一併改掉（缺陷：見
            // tests/e2e/commands/javascript/cli-rename-shorthand-bugs.e2e.test.ts）。
            // 標記後由 rename edit 產生端展開為 `key: newName`。
            const shorthandKeyText = getShorthandKeyText(path);

            references.push(createReference(symbol, location, referenceType, shorthandKeyText));
          }
        }
      },

      JSXIdentifier: (path: NodePath<babel.JSXIdentifier>) => {
        // 處理 JSX 中的識別符
        if (path.node.name === typedSymbol.name) {
          // 🚨 過濾：跳過 JSX 屬性 key（例如 <div id="x" /> 的 `id`）。
          // JSXAttribute.name 只是屬性名稱字面文字，並非對應同名變數/符號的
          // 綁定使用，不應被當成引用（否則重命名變數會誤改到無關的 JSX 屬性）。
          if (babel.isJSXAttribute(path.parent) && path.parent.name === path.node) {
            return;
          }

          const location = {
            filePath: typedAst.sourceFile,
            range: getNodeRange(path.node)
          };

          references.push(createReference(symbol, location, ReferenceType.Usage));
        }
      }
    });

    return references;
  }

  /**
   * ES2022 私有欄位/方法（`#secret`）的引用查找。對齊 TS 側
   * findPrivateFieldReferences（plugins/typescript/parser.ts）：複用
   * ReferenceFinder.findScopedReferences（find-references CLI 命令的同一套
   * PrivateName 感知掃描），以 containerName 限定同一個 class，避免不同
   * class 的同名私有欄位互相誤判為同一符號。
   */
  private findPrivateFieldReferences(typedAst: JavaScriptAST, typedSymbol: JavaScriptSymbol): Reference[] {
    // 檔案身份守衛：私有欄位/方法恆宣告於單一 class、無法跨檔案引用。
    // rename 等命令逐檔掃描全專案時，非宣告檔上同名的屬性存取（如 `cfg.secret`）
    // 純屬字面巧合，下方 findScopedReferences 對推不出 receiver 型別的屬性存取
    // 「寧留勿漏」，若不在此擋下會被誤判為引用（見 isSameDeclaringFile 說明與
    // cli-private-field-symbol-defect.e2e.test.ts 的跨檔誤改 regression，對齊
    // TS 側 findPrivateFieldReferences）。
    if (!isSameDeclaringFile(typedAst.sourceFile, typedSymbol.location.filePath)) {
      return [];
    }

    const containerName = getContainingClassName(typedSymbol);
    const scopedRefs: ScopedReference[] = this.referenceFinder.findScopedReferences(
      typedAst.sourceCode,
      typedSymbol.name,
      { className: containerName }
    ) ?? [];

    return scopedRefs.map(ref => createReference(
      typedSymbol,
      { filePath: typedAst.sourceFile, range: ref.location.range },
      ref.kind === ScopedReferenceKind.Definition ? ReferenceType.Definition : ReferenceType.Usage
    ));
  }

  private isReferenceToSymbol(
    path: NodePath<babel.Identifier>,
    symbol: JavaScriptSymbol,
    consumerFilePath?: string
  ): boolean {
    // 檢查名稱是否相同且在合理的作用域內，過濾字串和屬性名
    const node = path.node;

    if (!babel.isIdentifier(node)) {
      return false;
    }

    if (node.name !== symbol.name) {
      return false;
    }

    // 🚨 過濾：跳過物件「字面量」屬性名（key 位置）
    // 例如：{ oldName: value } 中的 oldName 不應被重命名
    // 例外：解構 pattern（ObjectPattern）內的 key 是 binding／被匯入名，
    // 例如 `const { foo } = require('./mod')` 的 foo 必須可被跨檔 rename（F4）
    const parent = path.parent;
    if (
      babel.isObjectProperty(parent)
      && parent.key === node
      && !parent.computed
      && !babel.isObjectPattern(path.parentPath?.parent)
    ) {
      return false; // 非計算屬性的 key 不是引用
    }

    // 🚨 過濾：跳過物件方法名
    if (babel.isObjectMethod(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // 類別方法定義名（ClassMethod key）：僅當此節點就是目標符號自身定義時才算引用
    // （rename/find-ref 必須包含定義位置）。其他 class 的同名方法定義一律排除。
    if (babel.isClassMethod(parent) && parent.key === node && !parent.computed) {
      return symbol.babelNode === parent;
    }

    // 🚨 過濾：跳過類別屬性名
    if (babel.isClassProperty(parent) && parent.key === node && !parent.computed) {
      return false;
    }

    // import specifier 的 imported（外部/被匯出名稱）節點
    // 例如 `import { greet2 as g }` 中的 greet2
    if (babel.isImportSpecifier(parent) && parent.imported === node) {
      // 別名 import（`import { x as y }`）：本地別名 y 及其呼叫沿用別名、不動，
      //   唯有外部（被匯出）名稱 x 需要跟著 export 一起改名 → 視此節點為引用。
      // 非別名 import（`import { x }`）：imported 與 local 為兩個範圍相同的節點，
      //   交由 local 節點的 visit 處理改名，此處略過以免對同一段文字重複編輯。
      // 函式區域符號不可能被 import 的外部名稱引用。
      const local = parent.local;
      return !isFunctionLocalSymbol(symbol)
        && babel.isIdentifier(local)
        && local.name !== node.name;
    }

    if (isFunctionLocalSymbol(symbol)) {
      if (babel.isMemberExpression(parent) && parent.property === node && !parent.computed) {
        return false;
      }

      return this.isSameBabelBinding(path, symbol);
    }

    // 頂層（模組層）符號：做 module binding 驗證，避免誤改「其他檔案自己的
    // 同名頂層定義」（例如另一檔各自宣告的 `function greet`）。跨檔引用只有透過
    // import 綁定（Babel binding.kind === 'module'）建立關聯、或就在定義檔本身
    // （binding 即符號自身宣告節點）才算目標引用。
    //
    // 僅在具備完整符號（帶 babelNode，如 rename/scoped find-references）時收斂；
    // 無 babelNode 的虛擬符號（findReferencesInFile 以名稱查找，如 deadcode
    // import-cleaner）沿用寬鬆比對。
    if (symbol.babelNode) {
      const binding = path.scope.getBinding(node.name);
      // 綁定到本檔的區域宣告（function/const/let/var/class/param，kind 非 'module'）時，
      // 僅當它就是本符號的定義節點才算引用；否則是另一個同名的獨立符號 → 排除。
      // 例外：`const { foo } = require('./mod')` 在 Babel 是 const binding，但語意等同
      // named import；require 來源指向定義檔時，解構綁定與使用點都是對 export 的引用（F4）。
      if (binding && binding.kind !== 'module') {
        if (this.isRequireDestructuringBindingOf(binding, symbol, consumerFilePath)) {
          return true;
        }
        return this.isSameBabelBinding(path, symbol);
      }
    }

    // Class method 的成員存取（`this.method()` / `obj.method()`）：Babel 不會為
    // method 名稱建立變數 binding，上面的 binding 查詢一律拿到 undefined，
    // 若不特別處理就會落入下方寬鬆候選集、讓不同 class 裡的同名方法互相誤判為
    // 同一符號的引用。
    //
    // 判定順序：
    // 1. 存取發生在同一個 enclosingClassNode 內（this.method / 同類內呼叫）→ 引用
    // 2. 類別外 instance.method：以 receiver 型別（new ClassName / 變數綁定推斷）
    //    比對 class 名稱；型別相符才算引用，避免混入其他 class 的同名方法
    if (
      symbol.enclosingClassNode
      && babel.isMemberExpression(parent)
      && parent.property === node
      && !parent.computed
    ) {
      const enclosingClass = path.findParent(
        p => p.isClassDeclaration() || p.isClassExpression()
      );
      if (enclosingClass?.node === symbol.enclosingClassNode) {
        return true;
      }

      const className = symbol.enclosingClassNode.id?.name;
      if (!className) {
        return false;
      }
      return this.inferMemberReceiverType(parent.object, path) === className;
    }

    // 無 binding（如 namespace 成員存取，交由上層查詢過濾）或為 import/module
    // binding：維持寬鬆候選集，符合 find-references「先廣收候選、再由 CLI 過濾層
    // 依模組消歧」的既有設計。
    return true;
  }

  /**
   * 推斷成員存取 receiver 的類型名稱（供 class method 外部引用判定）。
   * 支援：`(new Greeter()).m`、`const g = new Greeter(); g.m`
   */
  private inferMemberReceiverType(
    object: babel.Expression | babel.Super | babel.V8IntrinsicIdentifier,
    path: NodePath
  ): string | undefined {
    if (babel.isNewExpression(object) && babel.isIdentifier(object.callee)) {
      return object.callee.name;
    }

    if (!babel.isIdentifier(object)) {
      return undefined;
    }

    const binding = path.scope.getBinding(object.name);
    if (!binding || !binding.path.isVariableDeclarator()) {
      return undefined;
    }

    const init = binding.path.node.init;
    if (init && babel.isNewExpression(init) && babel.isIdentifier(init.callee)) {
      return init.callee.name;
    }

    return undefined;
  }

  private isSameBabelBinding(path: NodePath<babel.Identifier>, symbol: JavaScriptSymbol): boolean {
    const targetIdentifier = this.getBindingIdentifier(symbol.babelNode);
    if (!targetIdentifier) {
      return false;
    }

    const binding = path.scope.getBinding(symbol.name);
    return binding?.identifier === targetIdentifier;
  }

  /**
   * 判定 Babel binding 是否為 `const { symbolName } = require(spec)` 解構匯入，
   * 且 spec 解析後指向 symbol 的定義檔（F4：CJS require 跨檔 rename）。
   *
   * 有別名時（`const { foo: bar } = require(...)`）：
   * - 本地 binding 名是 bar，被匯入名是 foo
   * - 此方法在 binding.identifier 名 === symbol.name 時（無別名）回 true；
   * - 別名本地名與 export 名不同時，binding 名是 bar，不進此分支（rename export 只動 key 側，
   *   由 ObjectProperty key 訪點 + 模組來源比對另行處理；F4 主路徑為無別名解構）。
   */
  private isRequireDestructuringBindingOf(
    binding: Binding,
    symbol: JavaScriptSymbol,
    consumerFilePath?: string
  ): boolean {
    if (!symbol.location?.filePath || binding.identifier.name !== symbol.name) {
      return false;
    }

    const declaratorPath = binding.path;
    if (!declaratorPath.isVariableDeclarator()) {
      return false;
    }

    const init = declaratorPath.node.init;
    if (
      !isRequireCallExpression(init)
      || init.arguments.length < 1
      || !babel.isStringLiteral(init.arguments[0])
    ) {
      return false;
    }

    const id = declaratorPath.node.id;
    if (!babel.isObjectPattern(id)) {
      return false;
    }

    // 確認解構中確有被匯入名（或 shorthand 本地名）等於 symbol.name 的元素
    let importsSymbol = false;
    for (const prop of id.properties) {
      if (!babel.isObjectProperty(prop) || prop.computed) {
        continue;
      }
      if (!babel.isIdentifier(prop.key)) {
        continue;
      }
      // 被匯入名稱 = key；shorthand 時 key 即本地名
      if (prop.key.name === symbol.name) {
        importsSymbol = true;
        break;
      }
    }
    if (!importsSymbol) {
      return false;
    }

    const moduleSpecifier = init.arguments[0].value;
    if (!moduleSpecifier.startsWith('.')) {
      return false;
    }

    // 無消費端路徑時無法安全驗證 module specifier → 不錨定（避免跨模組同名誤改）
    if (!consumerFilePath) {
      return false;
    }

    return this.requireSpecifierMatchesDefinition(
      consumerFilePath,
      moduleSpecifier,
      symbol.location.filePath
    );
  }

  private requireSpecifierMatchesDefinition(
    importingFileName: string,
    moduleSpecifier: string,
    definitionFilePath: string
  ): boolean {
    const stripExt = (filePath: string): string => filePath.replace(/\.[^/.]+$/, '');
    const resolvedNoExt = stripExt(pathResolve(dirname(importingFileName), moduleSpecifier));
    const definitionNoExt = stripExt(pathResolve(definitionFilePath));
    if (resolvedNoExt === definitionNoExt) {
      return true;
    }
    // 目錄 import → index.*
    const definitionBase = definitionNoExt.split(/[/\\]/).pop();
    if (
      definitionBase === 'index'
      && pathResolve(dirname(definitionNoExt)) === pathResolve(resolvedNoExt)
    ) {
      return true;
    }
    return false;
  }

  private getBindingIdentifier(node: babel.Node): babel.Identifier | null {
    if (babel.isIdentifier(node)) {
      return node;
    }

    if ((babel.isFunctionDeclaration(node) || babel.isClassDeclaration(node)) && node.id) {
      return node.id;
    }

    if (babel.isVariableDeclarator(node) && babel.isIdentifier(node.id)) {
      return node.id;
    }

    if (
      (babel.isImportDefaultSpecifier(node)
        || babel.isImportSpecifier(node)
        || babel.isImportNamespaceSpecifier(node))
    ) {
      return node.local;
    }

    return null;
  }

  private getReferenceType(
    path: NodePath<babel.Identifier>,
    symbol: JavaScriptSymbol
  ): ReferenceType {
    const node = path.node;

    // 如果是符號的原始定義位置（ClassMethod 的 babelNode 是整段方法，
    // 定義名錨在 key Identifier，需一併辨識）
    if (
      node === symbol.babelNode
      || (babel.isClassMethod(symbol.babelNode)
        && symbol.babelNode.key === node)
    ) {
      return ReferenceType.Definition;
    }

    // 檢查是否為宣告上下文
    // 使用 Babel 的 path.isReferencedIdentifier 方法

    const anyPath = path as NodePath<babel.Node>;
    if (anyPath.isReferencedIdentifier()) {
      return ReferenceType.Usage;
    }

    if (anyPath.isBindingIdentifier()) {
      return ReferenceType.Declaration;
    }

    return ReferenceType.Usage;
  }
}
