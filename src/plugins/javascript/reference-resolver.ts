/**
 * JavaScript 符號引用解析器（Babel AST）
 *
 * 負責 findReferences 的完整編排：Babel traverse 全檔案掃描，以 allowlist 判定同名識別符
 * 是否正向解析到目標符號宣告（import/export specifier、CJS require、模組命名空間、class／
 * 物件成員 receiver），以及 ES2022 私有欄位的作用域感知掃描回退。
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
import { ScopedReferenceKind, type ScopedReference } from '@infrastructure/parser/interface.js';
import type {
  ClassFamilyResolver,
  FindReferencesOptions,
  ModuleSpecifierResolver
} from '@infrastructure/parser/types.js';
import {
  JavaScriptAST,
  JavaScriptSymbol,
  ModuleValueExport,
  getNodeRange,
  isPrivateFieldDeclaration
} from './types.js';
import { isModuleExportsTarget, isRequireCallExpression } from './cjs-require-ast.js';
import { getShorthandKeyText } from './shorthand-rename.js';
import type { ReferenceFinder } from './reference-finder.js';

/** 單次 findReferences 的判定上下文 */
interface ResolutionContext {
  readonly symbol: JavaScriptSymbol;
  /** 目前掃描（引用所在）的檔案 */
  readonly consumerFilePath: string;
  readonly moduleResolver?: ModuleSpecifierResolver;
  readonly classFamilyResolver?: ClassFamilyResolver;
}

/** superclass 鏈解析上限（防環） */
const MAX_CLASS_RESOLUTION_DEPTH = 8;

/**
 * 符號引用解析器類別
 */
export class ReferenceResolver {
  constructor(private readonly referenceFinder: ReferenceFinder) {}

  /**
   * 查找符號引用
   */
  async findReferences(ast: AST, symbol: Symbol, options?: FindReferencesOptions): Promise<Reference[]> {
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

    const ctx: ResolutionContext = {
      symbol: typedSymbol,
      consumerFilePath: typedAst.sourceFile,
      moduleResolver: options?.moduleResolver,
      classFamilyResolver: options?.classFamilyResolver
    };
    const locationOf = (node: babel.Node) => ({ filePath: typedAst.sourceFile, range: getNodeRange(node) });
    const references: Reference[] = [];

    traverse(typedAst.babelAST, {
      Identifier: (path: NodePath<babel.Identifier>) => {
        if (path.node.name !== typedSymbol.name || !this.isReferenceToSymbol(path, ctx)) {
          return;
        }
        const shorthand = this.getShorthandEdit(path, ctx);
        references.push(createReference(
          symbol,
          locationOf(path.node),
          this.getReferenceType(path, ctx),
          shorthand.keyText,
          shorthand.targetIsKey
        ));
      },

      JSXIdentifier: (path: NodePath<babel.JSXIdentifier>) => {
        if (path.node.name === typedSymbol.name && this.isJsxReferenceToSymbol(path, ctx)) {
          references.push(createReference(symbol, locationOf(path.node), ReferenceType.Usage));
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

  /**
   * Allowlist 判定：同名識別符只有在正向解析到目標符號宣告時才算引用，其餘一律不算
   * （rename 的誤判＝靜默改壞無關程式碼）。
   */
  private isReferenceToSymbol(path: NodePath<babel.Identifier>, ctx: ResolutionContext): boolean {
    if (!ctx.symbol.babelNode) {
      return this.isLooseNameReference(path, ctx.symbol);
    }
    if (this.isDeclarationSite(path, ctx)) {
      return true;
    }

    const parent = path.parent;
    if (babel.isImportSpecifier(parent) || babel.isImportDefaultSpecifier(parent) || babel.isImportNamespaceSpecifier(parent)) {
      return this.isImportSpecifierReference(path, parent, ctx);
    }
    if (babel.isExportSpecifier(parent)) {
      return this.isExportSpecifierReference(path, ctx);
    }
    if ((babel.isMemberExpression(parent) || babel.isOptionalMemberExpression(parent))
      && parent.property === path.node && !parent.computed) {
      return this.isMemberAccessOf(parent.object, path, ctx);
    }
    if (babel.isObjectProperty(parent) && path.parentKey === 'key' && !parent.computed) {
      // shorthand 的 key 與 value 同位，交由 value 判定
      return !parent.shorthand
        && babel.isObjectPattern(path.parentPath?.parent)
        && this.isRequirePatternKeyOf(path, ctx);
    }
    const anyPath = path as NodePath<babel.Node>;
    if (anyPath.isReferencedIdentifier() || anyPath.isBindingIdentifier()) {
      return this.bindingResolvesToSymbol(path, ctx);
    }
    return false;
  }

  private isJsxReferenceToSymbol(path: NodePath<babel.JSXIdentifier>, ctx: ResolutionContext): boolean {
    const parent = path.parent;
    // JSX 屬性名只是屬性文字，非綁定使用
    if (babel.isJSXAttribute(parent) && parent.name === path.node) {
      return false;
    }
    if (!ctx.symbol.babelNode) {
      return true;
    }
    if (babel.isJSXMemberExpression(parent) && parent.property === path.node) {
      return this.isMemberAccessOf(parent.object, path, ctx);
    }
    return path.isReferencedIdentifier() && this.bindingResolvesToSymbol(path, ctx);
  }

  /**
   * 無 babelNode 的虛擬符號（以名稱查找，如 deadcode import-cleaner、import binding 補抓）
   * 沒有宣告可解析，沿用名稱比對：只排除物件/class 成員 key 與非別名 import 的外部名。
   */
  private isLooseNameReference(path: NodePath<babel.Identifier>, symbol: JavaScriptSymbol): boolean {
    const node = path.node;
    const parent = path.parent;
    if (babel.isObjectProperty(parent) && parent.key === node && !parent.computed
      && !babel.isObjectPattern(path.parentPath?.parent)) {
      return false;
    }
    if ((babel.isObjectMethod(parent) || babel.isClassMethod(parent) || babel.isClassProperty(parent))
      && parent.key === node && !parent.computed) {
      return false;
    }
    if (babel.isImportSpecifier(parent) && parent.imported === node) {
      return !isFunctionLocalSymbol(symbol) && parent.local.name !== node.name;
    }
    return !isFunctionLocalSymbol(symbol);
  }

  /** 宣告點本身（含同 class getter/setter 配對的另一邊定義） */
  private isDeclarationSite(path: NodePath<babel.Identifier>, ctx: ResolutionContext): boolean {
    const declaration = ctx.symbol.babelNode;
    const parent = path.parent;
    if (babel.isIdentifier(declaration)) {
      const isShorthandKeyClone = babel.isObjectProperty(parent) && parent.shorthand && path.parentKey === 'key';
      return !isShorthandKeyClone && this.isSameNode(path.node, declaration, ctx);
    }
    const slot = getDeclarationNameSlot(declaration);
    if (slot !== undefined && path.parentKey === slot && this.isSameNode(parent, declaration, ctx)) {
      return true;
    }
    return babel.isClassMethod(parent) && path.parentKey === 'key' && !parent.computed
      && this.isPairedAccessor(parent, path, ctx);
  }

  /**
   * getter/setter 配對：同一 class、同 static、同名、get/set 對向的另一個 accessor。
   * rename 任一邊時兩個定義必須同步改名，否則使用點與另一邊定義脫鉤（F4）。
   */
  private isPairedAccessor(candidate: babel.ClassMethod, path: NodePath, ctx: ResolutionContext): boolean {
    const symbolNode = ctx.symbol.babelNode;
    if (!babel.isClassMethod(symbolNode) || symbolNode.computed) {
      return false;
    }
    const kinds = new Set([symbolNode.kind, candidate.kind]);
    if (!(kinds.has('get') && kinds.has('set')) || symbolNode.static !== candidate.static) {
      return false;
    }
    if (!babel.isIdentifier(symbolNode.key) || !babel.isIdentifier(candidate.key)
      || symbolNode.key.name !== candidate.key.name) {
      return false;
    }
    const classBody = path.parentPath?.parent;
    return babel.isClassBody(classBody)
      && classBody.body.some(member => this.isSameNode(member, symbolNode, ctx));
  }

  /** `import { x }`／`import { x as y }`／`import x` 的 specifier 名稱位置 */
  private isImportSpecifierReference(
    path: NodePath<babel.Identifier>,
    specifier: babel.ImportSpecifier | babel.ImportDefaultSpecifier | babel.ImportNamespaceSpecifier,
    ctx: ResolutionContext
  ): boolean {
    if (!this.isModuleExportable(ctx.symbol)) {
      return false;
    }
    if (babel.isImportSpecifier(specifier) && path.parentKey === 'imported') {
      // 非別名時 imported 與 local 同位，交由 local 判定；別名只改外部名、本地別名不動
      const importDecl = path.parentPath?.parent;
      return specifier.local.name !== path.node.name
        && babel.isImportDeclaration(importDecl)
        && this.specifierResolvesToDeclaringFile(importDecl.source.value, ctx);
    }
    return path.parentKey === 'local' && this.bindingResolvesToSymbol(path, ctx);
  }

  /** `export { x }`／`export { x as y }`／`export { x } from '...'` 的 specifier 名稱位置 */
  private isExportSpecifierReference(path: NodePath<babel.Identifier>, ctx: ResolutionContext): boolean {
    // exported：非別名時與 local 同位；別名是另一個對外名稱
    if (path.parentKey !== 'local') {
      return false;
    }
    const exportDecl = path.parentPath?.parent;
    if (babel.isExportNamedDeclaration(exportDecl) && exportDecl.source) {
      return this.isModuleExportable(ctx.symbol)
        && this.specifierResolvesToDeclaringFile(exportDecl.source.value, ctx);
    }
    return this.bindingResolvesToSymbol(path, ctx);
  }

  /** `const { x: y } = require('...')` 的被匯入名 key */
  private isRequirePatternKeyOf(path: NodePath<babel.Identifier>, ctx: ResolutionContext): boolean {
    const pattern = path.parentPath?.parent;
    const declarator = path.parentPath?.parentPath?.parent;
    return this.isModuleExportable(ctx.symbol)
      && babel.isVariableDeclarator(declarator)
      && declarator.id === pattern
      && this.requireSourceResolves(declarator.init, ctx);
  }

  /**
   * 值／綁定位置識別符的 scope binding 是否就是目標符號：符號自身的宣告綁定，或
   * （模組層符號）解析到宣告檔的 import 綁定／CJS require 解構綁定。
   */
  private bindingResolvesToSymbol(
    path: NodePath<babel.Identifier | babel.JSXIdentifier>,
    ctx: ResolutionContext
  ): boolean {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding) {
      return false;
    }
    const target = this.getBindingIdentifier(ctx.symbol.babelNode);
    if (target && this.isSameNode(binding.identifier, target, ctx)) {
      return true;
    }
    if (!this.isModuleExportable(ctx.symbol)) {
      return false;
    }
    return binding.kind === 'module'
      ? this.isImportBindingOf(binding, ctx)
      : this.isRequireDestructuringBindingOf(binding, ctx);
  }

  /** import 綁定是否匯入目標符號：具名匯入名相同，或 default 匯入且符號即宣告檔 default export */
  private isImportBindingOf(binding: Binding, ctx: ResolutionContext): boolean {
    const specifier = binding.path.node;
    const importDecl = binding.path.parent;
    if (!babel.isImportDeclaration(importDecl)) {
      return false;
    }
    const importsSymbol = importsDefault(specifier)
      ? ctx.symbol.isDefaultExport === true
      : babel.isImportSpecifier(specifier) && getImportedName(specifier) === ctx.symbol.name;
    return importsSymbol && this.specifierResolvesToDeclaringFile(importDecl.source.value, ctx);
  }

  /**
   * `const { symbolName } = require(spec)`（含 `{ symbolName = d }`）解構綁定，且 spec 解析到
   * 符號宣告檔（F4：CJS require 跨檔 rename）。別名解構的本地名不同名，不會進到此判定。
   */
  private isRequireDestructuringBindingOf(binding: Binding, ctx: ResolutionContext): boolean {
    const declarator = binding.path.node;
    if (!babel.isVariableDeclarator(declarator) || !babel.isObjectPattern(declarator.id)) {
      return false;
    }
    const bound = binding.identifier;
    const property = declarator.id.properties.find(prop =>
      babel.isObjectProperty(prop)
      && (prop.value === bound || (babel.isAssignmentPattern(prop.value) && prop.value.left === bound))
    );
    return babel.isObjectProperty(property)
      && !property.computed
      && babel.isIdentifier(property.key, { name: ctx.symbol.name })
      && this.requireSourceResolves(declarator.init, ctx);
  }

  /** 非計算成員存取（`x.m`／`x?.m`／`<X.m>`）：receiver 須正向解析到符號的擁有者 */
  private isMemberAccessOf(receiver: babel.Node, path: NodePath, ctx: ResolutionContext): boolean {
    if (ctx.symbol.enclosingClassNode) {
      return this.isClassMemberAccess(receiver, path, ctx);
    }
    if (ctx.symbol.enclosingObjectNode) {
      return this.isObjectMemberAccess(receiver, path, ctx);
    }
    return this.isModuleExportable(ctx.symbol) && this.isModuleNamespaceReceiver(receiver, path, ctx);
  }

  /**
   * 模組命名空間 receiver（其屬性即宣告檔匯出）：`import * as ns`、`const m = require()`、
   * `require().x`、宣告檔自身未綁定的 `exports`／`module.exports`。
   * default import 不是命名空間（`export default {…}` 物件的同名屬性與具名匯出無關）。
   */
  private isModuleNamespaceReceiver(receiver: babel.Node, path: NodePath, ctx: ResolutionContext): boolean {
    if (isRequireCallExpression(receiver)) {
      return this.requireSourceResolves(receiver, ctx);
    }
    if (babel.isMemberExpression(receiver)) {
      return isModuleExportsTarget(receiver) && !path.scope.getBinding('module') && this.isDeclaringFile(ctx);
    }
    const name = getReceiverName(receiver);
    if (name === undefined) {
      return false;
    }
    const binding = path.scope.getBinding(name);
    if (!binding) {
      return name === 'exports' && this.isDeclaringFile(ctx);
    }
    const declaration = binding.path.node;
    if (babel.isImportNamespaceSpecifier(declaration)) {
      const importDecl = binding.path.parent;
      return babel.isImportDeclaration(importDecl)
        && this.specifierResolvesToDeclaringFile(importDecl.source.value, ctx);
    }
    return babel.isVariableDeclarator(declaration)
      && babel.isIdentifier(declaration.id)
      && this.requireSourceResolves(declaration.init, ctx);
  }

  /**
   * class 成員存取：`this.m`／`super.m`（owner 或子類內、static 語境一致）、
   * static 的 `Owner.m`（receiver 解析到 owner class 或其子類）、instance 的
   * `new Owner().m`／`const o = new Owner(); o.m`。
   */
  private isClassMemberAccess(receiver: babel.Node, path: NodePath, ctx: ResolutionContext): boolean {
    const isStatic = isStaticMemberSymbol(ctx.symbol);

    if (babel.isThisExpression(receiver) || babel.isSuper(receiver)) {
      const context = getThisClassContext(path);
      if (!context || context.isStatic !== isStatic) {
        return false;
      }
      return babel.isSuper(receiver)
        ? this.superClassResolvesToOwner(context.classPath, ctx, 0)
        : this.isOwnerOrSubclass(context.classPath, ctx, 0);
    }
    if (isStatic) {
      return this.resolvesToOwnerClass(receiver, path, ctx, 0);
    }
    if (babel.isNewExpression(receiver)) {
      return this.resolvesToOwnerClass(receiver.callee, path, ctx, 0);
    }
    if (!babel.isIdentifier(receiver)) {
      return false;
    }
    const binding = path.scope.getBinding(receiver.name);
    if (!binding?.path.isVariableDeclarator()) {
      return false;
    }
    const init = binding.path.node.init;
    return babel.isNewExpression(init) && this.resolvesToOwnerClass(init.callee, binding.path, ctx, 0);
  }

  /**
   * class 是否為 owner，或其子類且 owner 以下（含自身）無類別 override 目標成員
   * （override 類別及其後代的存取解析到 override，不屬 owner 成員）。
   */
  private isOwnerOrSubclass(classPath: NodePath<babel.Class>, ctx: ResolutionContext, depth: number): boolean {
    if (this.isSameNode(classPath.node, ctx.symbol.enclosingClassNode, ctx)) {
      return true;
    }
    return !declaresSameMember(classPath.node, ctx.symbol)
      && this.superClassResolvesToOwner(classPath, ctx, depth);
  }

  private superClassResolvesToOwner(classPath: NodePath<babel.Class>, ctx: ResolutionContext, depth: number): boolean {
    const superClass = classPath.node.superClass;
    return !!superClass
      && depth < MAX_CLASS_RESOLUTION_DEPTH
      && this.resolvesToOwnerClass(superClass, classPath, ctx, depth + 1);
  }

  /**
   * 表達式是否解析到符號所屬 class（或其子類）：同檔 class 宣告／class 表達式綁定、
   * 具名匯出的 import 綁定／命名空間成員、宣告檔 default export 該 class 時的 default
   * import，以及 `module.exports = Owner` 時的 require 結果。
   */
  private resolvesToOwnerClass(expr: babel.Node, scopePath: NodePath, ctx: ResolutionContext, depth: number): boolean {
    const { ownerExport } = ctx.symbol;
    if (isRequireCallExpression(expr)) {
      return ownerExport === ModuleValueExport.CommonJS && this.requireSourceResolves(expr, ctx);
    }
    if (this.isOwnerNamedExportAccess(expr, scopePath, ctx) || this.isImportedClassInFamily(expr, scopePath, ctx)) {
      return true;
    }
    const name = getReceiverName(expr);
    const binding = name === undefined ? undefined : scopePath.scope.getBinding(name);
    if (!binding) {
      return false;
    }
    const bindingPath = binding.path;
    if (bindingPath.isClassDeclaration()) {
      return this.isOwnerOrSubclass(bindingPath, ctx, depth);
    }
    if (bindingPath.isVariableDeclarator()) {
      const init = bindingPath.get('init');
      if (init.isClassExpression()) {
        return this.isOwnerOrSubclass(init, ctx, depth);
      }
      return ownerExport === ModuleValueExport.CommonJS && this.requireSourceResolves(init.node, ctx);
    }
    const importDecl = bindingPath.parent;
    return babel.isImportDeclaration(importDecl)
      && importsDefault(bindingPath.node)
      && ownerExport === ModuleValueExport.EsmDefault
      && this.specifierResolvesToDeclaringFile(importDecl.source.value, ctx);
  }

  /**
   * 自其他檔匯入的 class（`import { Sub }`、`import Sub`、`ns.Sub`）是否為 owner 或其跨檔子類：
   * 交由 rename 引擎注入的 classFamilyResolver 追 extends 鏈（parser 無法讀其他檔）。
   */
  private isImportedClassInFamily(expr: babel.Node, scopePath: NodePath, ctx: ResolutionContext): boolean {
    const resolver = ctx.classFamilyResolver;
    const className = ctx.symbol.enclosingClassNode?.id?.name;
    if (!resolver || className === undefined) {
      return false;
    }
    let bindingName: string | undefined;
    let memberName: string | undefined;
    if (babel.isMemberExpression(expr) && !expr.computed && babel.isIdentifier(expr.property)) {
      bindingName = getReceiverName(expr.object);
      memberName = expr.property.name;
    } else {
      bindingName = getReceiverName(expr);
    }
    const binding = bindingName === undefined ? undefined : scopePath.scope.getBinding(bindingName);
    const importDecl = binding?.path.parent;
    if (!binding || !babel.isImportDeclaration(importDecl)) {
      return false;
    }
    const specifier = binding.path.node;
    const importedName = memberName !== undefined
      ? (babel.isImportNamespaceSpecifier(specifier) ? memberName : undefined)
      : importsDefault(specifier)
        ? 'default'
        : babel.isImportSpecifier(specifier) ? getImportedName(specifier) : undefined;
    return importedName !== undefined && resolver(
      ctx.consumerFilePath,
      importDecl.source.value,
      importedName,
      {
        filePath: ctx.symbol.location.filePath,
        className,
        memberName: ctx.symbol.name,
        isStatic: isStaticMemberSymbol(ctx.symbol)
      }
    );
  }

  /**
   * 表達式是否取到擁有者（class／物件）在宣告檔的具名匯出：具名／別名 import 綁定
   * （`import { api as a }`），或模組命名空間成員（`ns.api`、`require('./m').api`）。
   */
  private isOwnerNamedExportAccess(expr: babel.Node, scopePath: NodePath, ctx: ResolutionContext): boolean {
    const exportNames = ctx.symbol.ownerExportNames;
    if (!exportNames) {
      return false;
    }
    if (babel.isMemberExpression(expr) && !expr.computed && babel.isIdentifier(expr.property)) {
      return exportNames.includes(expr.property.name) && this.isModuleNamespaceReceiver(expr.object, scopePath, ctx);
    }
    const name = getReceiverName(expr);
    const binding = name === undefined ? undefined : scopePath.scope.getBinding(name);
    const importDecl = binding?.path.parent;
    return !!binding
      && babel.isImportSpecifier(binding.path.node)
      && exportNames.includes(getImportedName(binding.path.node))
      && babel.isImportDeclaration(importDecl)
      && this.specifierResolvesToDeclaringFile(importDecl.source.value, ctx);
  }

  /**
   * 物件字面量成員存取：同檔以該物件初始化的變數、物件自身方法內的 `this`、
   * 物件本身是宣告檔匯出值時的 default import／require 結果／自身 `module.exports`，
   * 以及物件具名匯出的 import 綁定／命名空間成員。
   */
  private isObjectMemberAccess(receiver: babel.Node, path: NodePath, ctx: ResolutionContext): boolean {
    const owner = ctx.symbol.enclosingObjectNode;
    if (babel.isThisExpression(receiver)) {
      return this.isSameNode(getThisObjectOwner(path), owner, ctx);
    }
    if (this.isModuleValueReceiver(receiver, path, ctx) || this.isOwnerNamedExportAccess(receiver, path, ctx)) {
      return true;
    }
    const name = getReceiverName(receiver);
    const declaration = name === undefined ? undefined : path.scope.getBinding(name)?.path.node;
    return babel.isVariableDeclarator(declaration) && this.isSameNode(declaration.init, owner, ctx);
  }

  /** receiver 是否為宣告檔「整個匯出值」（成員擁有者的 ownerExport 決定可接受的形狀） */
  private isModuleValueReceiver(receiver: babel.Node, path: NodePath, ctx: ResolutionContext): boolean {
    const { ownerExport } = ctx.symbol;
    if (ownerExport === ModuleValueExport.CommonJS) {
      if (babel.isMemberExpression(receiver)) {
        return isModuleExportsTarget(receiver) && !path.scope.getBinding('module') && this.isDeclaringFile(ctx);
      }
      if (isRequireCallExpression(receiver)) {
        return this.requireSourceResolves(receiver, ctx);
      }
    }
    const name = getReceiverName(receiver);
    const binding = name === undefined ? undefined : path.scope.getBinding(name);
    if (!binding || ownerExport === undefined) {
      return false;
    }
    if (ownerExport === ModuleValueExport.EsmDefault) {
      const importDecl = binding.path.parent;
      return importsDefault(binding.path.node)
        && babel.isImportDeclaration(importDecl)
        && this.specifierResolvesToDeclaringFile(importDecl.source.value, ctx);
    }
    const declaration = binding.path.node;
    return babel.isVariableDeclarator(declaration)
      && babel.isIdentifier(declaration.id)
      && this.requireSourceResolves(declaration.init, ctx);
  }

  /** 可被其他模組以匯出名存取的模組層符號（非函式區域、非 class／物件成員） */
  private isModuleExportable(symbol: JavaScriptSymbol): boolean {
    return !isFunctionLocalSymbol(symbol)
      && !symbol.enclosingClassNode
      && !symbol.enclosingObjectNode
      && !this.isMemberDeclarationNode(symbol.babelNode);
  }

  /** 以屬性存取（`obj.name`）為正常引用方式的成員宣告節點 */
  private isMemberDeclarationNode(node: babel.Node): boolean {
    return babel.isClassProperty(node)
      || babel.isClassMethod(node)
      || babel.isClassPrivateProperty(node)
      || babel.isClassPrivateMethod(node)
      || babel.isClassAccessorProperty(node)
      || babel.isObjectProperty(node)
      || babel.isObjectMethod(node);
  }

  private isDeclaringFile(ctx: ResolutionContext): boolean {
    return isSameDeclaringFile(ctx.consumerFilePath, ctx.symbol.location.filePath);
  }

  private requireSourceResolves(node: babel.Node | null | undefined, ctx: ResolutionContext): boolean {
    return isRequireCallExpression(node)
      && babel.isStringLiteral(node.arguments[0])
      && this.specifierResolvesToDeclaringFile(node.arguments[0].value, ctx);
  }

  /**
   * module specifier 是否解析到符號宣告檔：rename 注入的 moduleResolver（tsconfig alias、
   * barrel re-export 鏈）優先，否則只認相對路徑直接解析（含省略副檔名、目錄 index）。
   */
  private specifierResolvesToDeclaringFile(specifier: string, ctx: ResolutionContext): boolean {
    if (ctx.moduleResolver?.(ctx.consumerFilePath, specifier)) {
      return true;
    }
    return specifier.startsWith('.')
      && this.requireSpecifierMatchesDefinition(ctx.consumerFilePath, specifier, ctx.symbol.location.filePath);
  }

  /**
   * 節點身分比對。符號可能來自另一次 parse 的 AST（如 deadcode 收集符號與 symbol-finder
   * fallback 各自解析），物件身分不同但指向同一原始碼節點；純 `===` 會讓所有比對失敗、
   * 回 0 引用而把活碼判 dead（J1）。僅在掃描檔即符號宣告檔時退而以 type+位置比對，
   * 避免不同檔同位置節點互相誤認。
   */
  private isSameNode(
    a: babel.Node | null | undefined,
    b: babel.Node | null | undefined,
    ctx: ResolutionContext
  ): boolean {
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    return this.isDeclaringFile(ctx)
      && a.type === b.type
      && a.start !== null
      && a.start !== undefined
      && a.start === b.start
      && a.end === b.end;
  }

  /**
   * shorthand token（`{ foo }`／`const { foo } = opts`）同時是 key 與 value/binding，
   * 需展開成兩側形式（見 getShorthandKeyText）；目標是物件字面量屬性本身時改的是 key 側。
   */
  private getShorthandEdit(
    path: NodePath<babel.Identifier>,
    ctx: ResolutionContext
  ): { keyText?: string; targetIsKey?: boolean } {
    const parent = path.parent;
    if (babel.isObjectProperty(ctx.symbol.babelNode) && babel.isObjectProperty(parent) && path.parentKey === 'key') {
      return parent.shorthand ? { keyText: path.node.name, targetIsKey: true } : {};
    }
    return { keyText: getShorthandKeyText(path) };
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

  private getReferenceType(path: NodePath<babel.Identifier>, ctx: ResolutionContext): ReferenceType {
    const node = path.node;
    const symbol = ctx.symbol;

    // 如果是符號的原始定義位置（ClassMethod 的 babelNode 是整段方法，
    // 定義名錨在 key Identifier，需一併辨識）
    if (
      this.isSameNode(node, symbol.babelNode, ctx)
      || (babel.isClassMethod(symbol.babelNode)
        && this.isSameNode(symbol.babelNode.key, node, ctx))
    ) {
      return ReferenceType.Definition;
    }

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

/** 宣告節點上名稱識別符所在的欄位（供辨識宣告點本身） */
function getDeclarationNameSlot(declaration: babel.Node): 'id' | 'local' | 'key' | undefined {
  if (babel.isFunctionDeclaration(declaration) || babel.isClassDeclaration(declaration)
    || babel.isVariableDeclarator(declaration)) {
    return 'id';
  }
  if (babel.isImportSpecifier(declaration) || babel.isImportDefaultSpecifier(declaration)
    || babel.isImportNamespaceSpecifier(declaration)) {
    return 'local';
  }
  if ((babel.isClassMethod(declaration) || babel.isClassProperty(declaration)
    || babel.isClassAccessorProperty(declaration) || babel.isObjectProperty(declaration)
    || babel.isObjectMethod(declaration)) && !declaration.computed) {
    return 'key';
  }
  return undefined;
}

function getImportedName(specifier: babel.ImportSpecifier): string {
  return babel.isIdentifier(specifier.imported) ? specifier.imported.name : specifier.imported.value;
}

function isStaticMemberSymbol(symbol: JavaScriptSymbol): boolean {
  const member = symbol.babelNode;
  return (babel.isClassMethod(member) || babel.isClassProperty(member) || babel.isClassAccessorProperty(member))
    && member.static === true;
}

/** class 自身是否宣告與目標成員同名同 static 的 method／getter／setter／property（不含 constructor） */
function declaresSameMember(classNode: babel.Class, symbol: JavaScriptSymbol): boolean {
  const isStatic = isStaticMemberSymbol(symbol);
  return classNode.body.body.some(member => {
    const isMember = (babel.isClassMethod(member) && member.kind !== 'constructor')
      || babel.isClassProperty(member) || babel.isClassAccessorProperty(member);
    if (!isMember || member.computed || (member.static === true) !== isStatic) {
      return false;
    }
    const key = member.key;
    return (babel.isIdentifier(key) && key.name === symbol.name)
      || (babel.isStringLiteral(key) && key.value === symbol.name);
  });
}

/** `import X` 或 `import { default as X }` */
function importsDefault(node: babel.Node): boolean {
  return babel.isImportDefaultSpecifier(node)
    || (babel.isImportSpecifier(node) && getImportedName(node) === 'default');
}

function getReceiverName(receiver: babel.Node | null | undefined): string | undefined {
  return babel.isIdentifier(receiver) || babel.isJSXIdentifier(receiver) ? receiver.name : undefined;
}

/** `this`／`super` 所屬的 class 與 static 語境：跳過箭頭函式，一般 function 另立 this 則無 */
function getThisClassContext(path: NodePath): { classPath: NodePath<babel.Class>; isStatic: boolean } | undefined {
  for (let current = path.parentPath; current; current = current.parentPath) {
    if (current.isArrowFunctionExpression()) {
      continue;
    }
    const node = current.node;
    const isClassMember = babel.isClassMethod(node) || babel.isClassPrivateMethod(node)
      || babel.isClassProperty(node) || babel.isClassPrivateProperty(node)
      || babel.isClassAccessorProperty(node) || babel.isStaticBlock(node);
    if (isClassMember) {
      const classPath = current.parentPath?.parentPath;
      if (!classPath?.isClass()) {
        return undefined;
      }
      return { classPath, isStatic: babel.isStaticBlock(node) || node.static === true };
    }
    if (current.isFunction()) {
      return undefined;
    }
  }
  return undefined;
}

/** 物件字面量方法（`m() {}`／`m: function () {}`）內 `this` 所指的物件 */
function getThisObjectOwner(path: NodePath): babel.Node | undefined {
  for (let current = path.parentPath; current; current = current.parentPath) {
    if (current.isArrowFunctionExpression()) {
      continue;
    }
    if (current.isObjectMethod()) {
      return current.parent;
    }
    if (current.isFunction()) {
      return current.parentPath?.isObjectProperty() && current.parentKey === 'value'
        ? current.parentPath.parent
        : undefined;
    }
  }
  return undefined;
}
