/**
 * JavaScript Symbol Extractor
 * 從 JavaScript AST（Babel）中提取符號資訊
 */

import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

import type { AST, Symbol, Scope } from '@shared/types/index.js';
import { SymbolType, createSymbol, createScope, DECORATED_ATTRIBUTE } from '@shared/types/index.js';
import { JavaScriptAST, JavaScriptSymbol, ModuleValueExport, getNodeRange } from './types.js';
import { isModuleExportsTarget, isRequireCallExpression } from './cjs-require-ast.js';

/** 宣告檔中「整個值即模組匯出」的節點 → 匯出方式 */
type ModuleValueExports = ReadonlyMap<babel.Node, ModuleValueExport>;

/**
 * 收集頂層 `export default X` 與 `module.exports = X` 的匯出值節點；X 為 Identifier 時
 * 解析到其宣告（VariableDeclarator 一併登錄其 init，供 class／物件表達式成員查詢）。
 */
function collectModuleValueExports(programPath: NodePath<babel.Program>): ModuleValueExports {
  const targets = new Map<babel.Node, ModuleValueExport>();
  const add = (valuePath: NodePath, kind: ModuleValueExport): void => {
    let node: babel.Node = valuePath.node;
    if (babel.isIdentifier(node)) {
      const binding = valuePath.scope.getBinding(node.name);
      if (!binding) {
        return;
      }
      node = binding.path.node;
      if (babel.isVariableDeclarator(node) && node.init) {
        targets.set(node.init, kind);
      }
    }
    targets.set(node, kind);
  };
  for (const statement of programPath.get('body')) {
    if (statement.isExportDefaultDeclaration()) {
      add(statement.get('declaration'), ModuleValueExport.EsmDefault);
      continue;
    }
    if (statement.isExportNamedDeclaration() && !statement.node.source) {
      // `export { X as default }`
      for (const specifier of statement.get('specifiers')) {
        if (specifier.isExportSpecifier() && getExportedName(specifier.node) === 'default') {
          add(specifier.get('local'), ModuleValueExport.EsmDefault);
        }
      }
      continue;
    }
    if (!statement.isExpressionStatement()) {
      continue;
    }
    const expression = statement.get('expression');
    if (
      expression.isAssignmentExpression()
      && babel.isMemberExpression(expression.node.left)
      && isModuleExportsTarget(expression.node.left)
      && !statement.scope.getBinding('module')
    ) {
      add(expression.get('right'), ModuleValueExport.CommonJS);
    }
  }
  return targets;
}

function getExportedName(specifier: babel.ExportSpecifier): string {
  return babel.isIdentifier(specifier.exported) ? specifier.exported.name : specifier.exported.value;
}

/** 宣告檔中以具名匯出對外的值節點 → 匯出名清單 */
type ModuleNamedExports = ReadonlyMap<babel.Node, readonly string[]>;

/**
 * 收集頂層具名匯出（`export const x = …`、`export class X`、`export { x as y }`）的值節點；
 * VariableDeclarator 一併登錄其 init，供 class／物件表達式成員查詢。
 */
function collectModuleNamedExports(programPath: NodePath<babel.Program>): ModuleNamedExports {
  const names = new Map<babel.Node, string[]>();
  const add = (node: babel.Node | null | undefined, name: string): void => {
    if (!node) {
      return;
    }
    names.set(node, [...(names.get(node) ?? []), name]);
    if (babel.isVariableDeclarator(node)) {
      add(node.init, name);
    }
  };
  for (const statement of programPath.get('body')) {
    if (!statement.isExportNamedDeclaration() || statement.node.source) {
      continue;
    }
    const declaration = statement.node.declaration;
    if (babel.isVariableDeclaration(declaration)) {
      for (const declarator of declaration.declarations) {
        if (babel.isIdentifier(declarator.id)) {
          add(declarator, declarator.id.name);
        }
      }
    } else if ((babel.isClassDeclaration(declaration) || babel.isFunctionDeclaration(declaration)) && declaration.id) {
      add(declaration, declaration.id.name);
    }
    for (const specifier of statement.get('specifiers')) {
      const exportedName = specifier.isExportSpecifier() ? getExportedName(specifier.node) : undefined;
      if (!specifier.isExportSpecifier() || exportedName === undefined || exportedName === 'default') {
        continue;
      }
      const local = specifier.node.local;
      add(statement.scope.getBinding(local.name)?.path.node, exportedName);
    }
  }
  return names;
}

/** 宣告檔層級的匯出資訊（供成員擁有者跨檔解析） */
interface ModuleExportInfo {
  readonly valueExports: ModuleValueExports;
  readonly namedExports: ModuleNamedExports;
}

/** 成員所屬容器（class／物件字面量）若本身是模組匯出值或具名匯出，帶出匯出方式與匯出名 */
function ownerExportFields(
  owner: babel.Node | undefined,
  exportInfo: ModuleExportInfo
): Pick<JavaScriptSymbol, 'ownerExport' | 'ownerExportNames'> {
  const ownerExport = owner ? exportInfo.valueExports.get(owner) : undefined;
  const ownerExportNames = owner ? exportInfo.namedExports.get(owner) : undefined;
  return {
    ...(ownerExport ? { ownerExport } : {}),
    ...(ownerExportNames ? { ownerExportNames } : {})
  };
}

/** 宣告本身是否為 `export default` 的匯出值 */
function defaultExportFields(
  declaration: babel.Node,
  exportInfo: ModuleExportInfo
): Pick<JavaScriptSymbol, 'isDefaultExport'> {
  return exportInfo.valueExports.get(declaration) === ModuleValueExport.EsmDefault ? { isDefaultExport: true } : {};
}

/**
 * JavaScript 符號提取器類別
 */
export class JavaScriptSymbolExtractor {
  /**
   * 提取符號
   */
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const typedAst = ast as JavaScriptAST;
    const symbols: JavaScriptSymbol[] = [];
    let exportInfo: ModuleExportInfo = { valueExports: new Map(), namedExports: new Map() };

    // 使用 Babel traverse 遍歷 AST
    traverse(typedAst.babelAST, {
      Program: (path: NodePath<babel.Program>) => {
        exportInfo = {
          valueExports: collectModuleValueExports(path),
          namedExports: collectModuleNamedExports(path)
        };
      },

      // 處理各種宣告節點
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        this.extractFunctionSymbol(path, symbols, typedAst.sourceFile, exportInfo);
        this.extractParameterSymbols(path.node.params, path.node.id?.name, symbols, typedAst.sourceFile);
      },

      ClassDeclaration: (path: NodePath<babel.ClassDeclaration>) => {
        this.extractClassSymbol(path, symbols, typedAst.sourceFile, exportInfo);
      },

      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        this.extractVariableSymbol(
          path, symbols, typedAst.sourceFile, exportInfo, this.getNearestFunctionName(path)
        );
      },

      ImportDefaultSpecifier: (path: NodePath<babel.ImportDefaultSpecifier>) => {
        this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportSpecifier: (path: NodePath<babel.ImportSpecifier>) => {
        this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ImportNamespaceSpecifier: (path: NodePath<babel.ImportNamespaceSpecifier>) => {
        this.extractImportSymbol(path.node, symbols, typedAst.sourceFile);
      },

      ClassMethod: (path: NodePath<babel.ClassMethod>) => {
        this.extractMethodSymbol(path, symbols, typedAst.sourceFile, exportInfo);
        this.extractParameterSymbols(
          path.node.params,
          babel.isIdentifier(path.node.key) ? path.node.key.name : undefined,
          symbols,
          typedAst.sourceFile
        );
      },

      ClassProperty: (path: NodePath<babel.ClassProperty>) => {
        this.extractPropertySymbol(path, symbols, typedAst.sourceFile, exportInfo);
      },

      // ES2022 私有欄位/方法（`#secret`）：AST node kind 是 ClassPrivateProperty/
      // ClassPrivateMethod（key 為 babel.PrivateName），與一般 ClassProperty/ClassMethod
      // 是不同節點型別，未註冊獨立分支會讓 `#secret` 完全不被索引（對齊 TS 側
      // ts.PrivateIdentifier 修復，見 plugins/typescript/symbol-extractor.ts）。
      ClassPrivateProperty: (path: NodePath<babel.ClassPrivateProperty>) => {
        this.extractPrivatePropertySymbol(path, symbols, typedAst.sourceFile);
      },

      ClassPrivateMethod: (path: NodePath<babel.ClassPrivateMethod>) => {
        this.extractPrivateMethodSymbol(path, symbols, typedAst.sourceFile);
        this.extractParameterSymbols(
          path.node.params,
          path.node.key.id.name,
          symbols,
          typedAst.sourceFile
        );
      },

      ObjectMethod: (path: NodePath<babel.ObjectMethod>) => {
        this.extractObjectMethodSymbol(path, symbols, typedAst.sourceFile, exportInfo);
        this.extractParameterSymbols(
          path.node.params,
          babel.isIdentifier(path.node.key) ? path.node.key.name : undefined,
          symbols,
          typedAst.sourceFile
        );
      },

      FunctionExpression: (path: NodePath<babel.FunctionExpression>) => {
        this.extractParameterSymbols(
          path.node.params,
          this.getFunctionExpressionName(path),
          symbols,
          typedAst.sourceFile
        );
      },

      ArrowFunctionExpression: (path: NodePath<babel.ArrowFunctionExpression>) => {
        this.extractParameterSymbols(
          path.node.params,
          this.getFunctionExpressionName(path),
          symbols,
          typedAst.sourceFile
        );
      },

      ObjectProperty: (path: NodePath<babel.ObjectProperty>) => {
        // 解構模式（ObjectPattern）內的 property 是變數/參數綁定，不是物件字面量的
        // key:value 屬性宣告；已由 extractVariableSymbol／extractParameterSymbols
        // 的 collectBindingIdentifiers 處理，此處略過以免產生型別錯誤（Property）
        // 且與 babelNode 綁定不一致的重複符號。
        if (babel.isObjectPattern(path.parent)) {
          return;
        }
        this.extractObjectPropertySymbol(path, symbols, typedAst.sourceFile, exportInfo);
      }
    });

    return symbols as Symbol[];
  }

  private extractFunctionSymbol(
    path: NodePath<babel.FunctionDeclaration>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo
  ): void {
    const node = path.node;
    if (node.id) {
      const symbol = this.createSymbolFromNode(
        node,
        node.id.name,
        SymbolType.Function,
        sourceFile,
        { modifiers: this.getExportModifiers(path.parentPath) },
        undefined,
        node.id
      );
      symbols.push({ ...symbol, ...defaultExportFields(node, exportInfo) });
    }
  }

  private extractClassSymbol(
    path: NodePath<babel.ClassDeclaration>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo
  ): void {
    const node = path.node;
    if (node.id) {
      const symbol = this.createSymbolFromNode(
        node,
        node.id.name,
        SymbolType.Class,
        sourceFile,
        { modifiers: this.getExportModifiers(path.parentPath) },
        undefined,
        node.id
      );
      symbols.push({ ...symbol, ...defaultExportFields(node, exportInfo) });
    }
  }

  private extractVariableSymbol(
    path: NodePath<babel.VariableDeclarator>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo,
    functionScopeName?: string
  ): void {
    const node = path.node;
    // CJS `const { foo } = require('./mod')` / `const mod = require('./mod')`：語意上等同
    // ESM `import`，標記 isImported 使其對齊 extractImportSymbol 的既有標記——不與真正的
    // 定義候選競爭（--at 唯一性判定、rename 定義候選過濾皆以 isImportedSymbol 排除 import
    // binding，CJS require binding 若不標記會被誤當獨立定義，導致同名符號消歧誤判為歧義）。
    const isRequireBinding = isRequireCallExpression(node.init);
    if (babel.isIdentifier(node.id)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.id.name,
        SymbolType.Variable,
        sourceFile,
        {
          modifiers: this.getExportModifiers(path.parentPath?.parentPath),
          ...(isRequireBinding ? { isImported: true } : {})
        },
        functionScopeName ? createScope('function', functionScopeName) : undefined,
        node.id
      );
      symbols.push({ ...symbol, ...defaultExportFields(node, exportInfo) });
      return;
    }

    // 解構綁定（ObjectPattern／ArrayPattern，例如 `const { value } = source;`）：
    // 逐一為每個實際綁定的識別符建立符號，使解構出的每個名稱都可被 search/rename 定位。
    // babelNode 直接採用綁定識別符本身（而非外層 VariableDeclarator），
    // 與 extractParameterSymbols 的簡單參數一致，getBindingIdentifier 對
    // Identifier 節點已原生支援、無需額外特判。
    const modifiers = this.getExportModifiers(path.parentPath?.parentPath);
    const scope = functionScopeName ? createScope('function', functionScopeName) : undefined;
    for (const identifier of this.collectBindingIdentifiers(node.id)) {
      const location = { filePath: sourceFile, range: getNodeRange(identifier) };
      const baseSymbol = createSymbol(identifier.name, SymbolType.Variable, location, scope, modifiers);
      symbols.push({
        ...baseSymbol,
        babelNode: identifier,
        ...(isRequireBinding ? { isImported: true } : {})
      });
    }
  }

  /**
   * 遞迴收集綁定模式（Identifier／ObjectPattern／ArrayPattern／AssignmentPattern／
   * RestElement）中實際綁定的識別符節點。
   *
   * 供 extractVariableSymbol（解構變數）與 extractParameterSymbols（解構參數、
   * 預設值參數、rest 參數）共用同一套遍歷邏輯（Single Source of Truth），
   * 避免變數/參數各自重寫一份、走不同的解構深度。
   */
  private collectBindingIdentifiers(pattern: babel.Node | null | undefined): babel.Identifier[] {
    if (!pattern) {
      return [];
    }

    if (babel.isIdentifier(pattern)) {
      return [pattern];
    }

    if (babel.isAssignmentPattern(pattern)) {
      return this.collectBindingIdentifiers(pattern.left);
    }

    if (babel.isRestElement(pattern)) {
      return this.collectBindingIdentifiers(pattern.argument);
    }

    if (babel.isObjectPattern(pattern)) {
      const result: babel.Identifier[] = [];
      for (const prop of pattern.properties) {
        if (babel.isObjectProperty(prop)) {
          result.push(...this.collectBindingIdentifiers(prop.value));
        } else if (babel.isRestElement(prop)) {
          result.push(...this.collectBindingIdentifiers(prop.argument));
        }
      }
      return result;
    }

    if (babel.isArrayPattern(pattern)) {
      const result: babel.Identifier[] = [];
      for (const element of pattern.elements) {
        result.push(...this.collectBindingIdentifiers(element));
      }
      return result;
    }

    return [];
  }

  /**
   * 計算宣告節點的 export 相關 modifiers（對齊 TS 側 getNodeModifiers 詞彙：'export'、'default'）
   * Babel AST 的 export 資訊不掛在宣告節點本身，而是外層的
   * ExportNamedDeclaration / ExportDefaultDeclaration 容器節點；呼叫端負責傳入正確的容器：
   * - FunctionDeclaration/ClassDeclaration：容器即為自身的 parentPath
   * - VariableDeclarator：export 掛在外層 VariableDeclaration 的 parentPath（statement），
   *   呼叫端需多跳一層傳入 `path.parentPath?.parentPath`
   */
  private getExportModifiers(container: NodePath | null | undefined): string[] {
    if (!container) {
      return [];
    }
    if (babel.isExportDefaultDeclaration(container.node)) {
      return ['export', 'default'];
    }
    if (babel.isExportNamedDeclaration(container.node)) {
      return ['export'];
    }
    return [];
  }

  private extractParameterSymbols(
    params: babel.Function['params'],
    functionScopeName: string | undefined,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    const scope = createScope('function', functionScopeName);
    for (const param of params) {
      // 涵蓋一般識別符參數，也涵蓋解構參數（ObjectPattern／ArrayPattern）、
      // 預設值參數（AssignmentPattern）、rest 參數（RestElement）——
      // 逐一收集實際綁定的識別符節點，使每個綁定名稱都能被 search/rename 定位。
      for (const identifier of this.collectBindingIdentifiers(param)) {
        const location = {
          filePath: sourceFile,
          range: getNodeRange(identifier)
        };
        const baseSymbol = createSymbol(
          identifier.name,
          SymbolType.Variable,
          location,
          scope,
          []
        );

        symbols.push({
          ...baseSymbol,
          babelNode: identifier
        });
      }
    }
  }

  private extractImportSymbol(
    node: babel.ImportDefaultSpecifier | babel.ImportSpecifier | babel.ImportNamespaceSpecifier,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    // 位置錨定於 local binding 識別符（node.local），而非整個 specifier 節點
    // （default/named import 通常等價，但 named alias `foo as bar` 與
    // namespace import `* as ns` 的 specifier 範圍起點會落在 exported name
    // 或 `*`，並非實際綁定於程式碼中的 local name）
    const symbol = this.createSymbolFromNode(
      node,
      node.local.name,
      SymbolType.Variable,
      sourceFile,
      { isImported: true },
      undefined,
      node.local
    );
    symbols.push(symbol);
  }

  private extractMethodSymbol(
    path: NodePath<babel.ClassMethod>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo
  ): void {
    const node = path.node;
    if (babel.isIdentifier(node.key)) {
      // 方法所屬的 class 節點身分：用來在 isReferenceToSymbol 比對
      // `this.method()` 之類無 Babel binding 可查的成員存取時，區分
      // 「同一個 class 內的自我呼叫」與「另一個同名方法的無關 class」
      // （見 bug repro：不同類別同名方法互相誤判為同一符號）。
      const classPath = path.findParent(
        p => p.isClassDeclaration() || p.isClassExpression()
      ) as NodePath<babel.ClassDeclaration | babel.ClassExpression> | null;

      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Function,
        sourceFile,
        {},
        classPath ? createScope('class', classPath.node.id?.name) : undefined,
        node.key
      );
      symbols.push({
        ...symbol,
        enclosingClassNode: classPath?.node,
        ...ownerExportFields(classPath?.node, exportInfo)
      });
    }
  }

  /**
   * ES2022 私有方法（`#method() {}`）符號抽取。對齊 extractMethodSymbol：
   * 名稱取自 `key.id.name`（PrivateName 裸名，Babel 原生不含 `#`），位置錨定於
   * `key`（PrivateName 節點本身，範圍含 `#` 前綴，對齊 TS 側
   * getSymbolIdentifierRange 對 PrivateIdentifier 的處理）。scope 記錄所屬 class，
   * 供 findPrivateFieldReferences 取得 containerName 做同類過濾。
   */
  private extractPrivateMethodSymbol(
    path: NodePath<babel.ClassPrivateMethod>,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    const node = path.node;
    const classPath = path.findParent(
      p => p.isClassDeclaration() || p.isClassExpression()
    ) as NodePath<babel.ClassDeclaration | babel.ClassExpression> | null;

    const symbol = this.createSymbolFromNode(
      node,
      node.key.id.name,
      SymbolType.Function,
      sourceFile,
      {},
      classPath ? createScope('class', classPath.node.id?.name) : undefined,
      node.key
    );
    symbols.push({ ...symbol, enclosingClassNode: classPath?.node });
  }

  /**
   * ES2022 私有欄位（`#secret = 1`）符號抽取。對齊 extractPropertySymbol：
   * 名稱取自 `key.id.name`（PrivateName 裸名），位置錨定於 `key`（範圍含 `#`）。
   */
  private extractPrivatePropertySymbol(
    path: NodePath<babel.ClassPrivateProperty>,
    symbols: JavaScriptSymbol[],
    sourceFile: string
  ): void {
    const node = path.node;
    const classPath = path.findParent(
      p => p.isClassDeclaration() || p.isClassExpression()
    ) as NodePath<babel.ClassDeclaration | babel.ClassExpression> | null;

    const symbol = this.createSymbolFromNode(
      node,
      node.key.id.name,
      SymbolType.Variable,
      sourceFile,
      {},
      classPath ? createScope('class', classPath.node.id?.name) : undefined,
      node.key
    );
    symbols.push({ ...symbol, enclosingClassNode: classPath?.node });
  }

  private extractPropertySymbol(
    path: NodePath<babel.ClassProperty>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo
  ): void {
    const node = path.node;
    if (babel.isIdentifier(node.key)) {
      const classPath = path.findParent(
        p => p.isClassDeclaration() || p.isClassExpression()
      ) as NodePath<babel.ClassDeclaration | babel.ClassExpression> | null;
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Variable,
        sourceFile,
        {},
        undefined,
        node.key
      );
      symbols.push({
        ...symbol,
        enclosingClassNode: classPath?.node,
        ...ownerExportFields(classPath?.node, exportInfo)
      });
    }
  }

  private extractObjectMethodSymbol(
    path: NodePath<babel.ObjectMethod>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo
  ): void {
    const node = path.node;
    if (babel.isIdentifier(node.key)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Function,
        sourceFile,
        {},
        undefined,
        node.key
      );
      symbols.push({ ...symbol, ...this.objectOwnerFields(path, exportInfo) });
    }
  }

  private extractObjectPropertySymbol(
    path: NodePath<babel.ObjectProperty>,
    symbols: JavaScriptSymbol[],
    sourceFile: string,
    exportInfo: ModuleExportInfo
  ): void {
    const node = path.node;
    if (babel.isIdentifier(node.key)) {
      const symbol = this.createSymbolFromNode(
        node,
        node.key.name,
        SymbolType.Property,
        sourceFile,
        {},
        undefined,
        node.key
      );
      symbols.push({ ...symbol, ...this.objectOwnerFields(path, exportInfo) });
    }
  }

  private objectOwnerFields(
    path: NodePath<babel.ObjectProperty | babel.ObjectMethod>,
    exportInfo: ModuleExportInfo
  ): Pick<JavaScriptSymbol, 'enclosingObjectNode' | 'ownerExport' | 'ownerExportNames'> {
    const owner = path.parent;
    if (!babel.isObjectExpression(owner)) {
      return {};
    }
    return { enclosingObjectNode: owner, ...ownerExportFields(owner, exportInfo) };
  }

  private createSymbolFromNode(
    node: babel.Node,
    name: string,
    type: SymbolType,
    sourceFile: string,
    options: { isImported?: boolean; isExported?: boolean; modifiers?: string[] } = {},
    scope?: Scope,
    identifierNode: babel.Node = node
  ): JavaScriptSymbol {
    // 位置錨定於名稱識別符本身（對齊 TS 側 getSymbolIdentifierRange 語意），
    // 而非整個宣告節點的起點；未特別指定 identifierNode 的呼叫端（如 import specifier）
    // 沿用原節點範圍
    const range = getNodeRange(identifierNode);
    const location = { filePath: sourceFile, range };

    // 宣告帶 decorator（Babel `decorators` 屬性）→ 標記 attributes，供 deadcode 保守跳過
    const decorators = (node as { decorators?: readonly babel.Decorator[] | null }).decorators;
    const attributes = decorators && decorators.length > 0 ? [DECORATED_ATTRIBUTE] : undefined;
    const baseSymbol = createSymbol(name, type, location, scope, options.modifiers ?? [], attributes);

    return {
      ...baseSymbol,
      babelNode: node,
      isImported: options.isImported,
      isExported: options.isExported
    };
  }

  private getNearestFunctionName(path: NodePath<babel.Node>): string | undefined {
    let current: NodePath | null = path.parentPath;

    while (current) {
      const node = current.node;

      if (babel.isFunctionDeclaration(node)) {
        return node.id?.name;
      }

      if (babel.isClassMethod(node) || babel.isObjectMethod(node)) {
        return babel.isIdentifier(node.key) ? node.key.name : undefined;
      }

      if (babel.isFunctionExpression(node) || babel.isArrowFunctionExpression(node)) {
        return this.getFunctionExpressionName(current as NodePath<babel.FunctionExpression | babel.ArrowFunctionExpression>);
      }

      current = current.parentPath;
    }

    return undefined;
  }

  private getFunctionExpressionName(
    path: NodePath<babel.FunctionExpression | babel.ArrowFunctionExpression>
  ): string | undefined {
    const parent = path.parent;

    if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id)) {
      return parent.id.name;
    }

    if (babel.isAssignmentExpression(parent) && babel.isIdentifier(parent.left)) {
      return parent.left.name;
    }

    if (babel.isObjectProperty(parent) && babel.isIdentifier(parent.key)) {
      return parent.key.name;
    }

    return undefined;
  }
}
