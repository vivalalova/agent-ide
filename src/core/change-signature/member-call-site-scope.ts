/**
 * 成員（class／object literal method）目標的跨檔方法呼叫點範圍
 *
 * 方法目標的呼叫點形如 `<receiver>.<method>(...)`，consumer 檔 import 的是 owner
 * （類別名／object 變數名），不會有叫方法名的本地繫結；若以方法名解析繫結，範圍恆只剩
 * 定義檔，跨檔呼叫點會被靜默漏掉。此模組改以 owner 名解析「引用 owner 的檔案」（含
 * type-only import，以及跨檔 `class Sub extends Owner` 的子類遞迴），再以方法名掃出這些
 * 檔案中的 property-access 呼叫點，交由呼叫端 fast-fail（方法呼叫點重寫需 receiver 型別解析）。
 * 同名方法呼叫點只在 receiver 有「名目證據」證明是無關 class 時排除（見 isProvablyUnrelatedReceiver）；
 * 型別註記不作證據（結構型別下 `x: Other` 可持有 owner 實例），其餘一律保守保留。
 *
 * 界線：未 import owner、透過其他函式回傳值取得實例的檔案（`getSvc().m()`）不在範圍內；
 * element access（`svc['m']()`）不視為呼叫點。
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { FileUtils } from '@core/foundations/index.js';
import type { PathUtils } from '@core/move/path-utils.js';
import type { SymbolFinder } from '@core/foundations/index.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import { getScriptKind } from '@shared/script-kind.js';
import { collectBindingNames } from './scope-shadow-analyzer.js';
import type { CallSiteBindingResolver } from './call-site-binding-resolver.js';
import type { FunctionDeclarationLocator } from './function-declaration-locator.js';
import type { FunctionSignature } from './types.js';

/**
 * 成員目標資訊。ownerName 為 undefined 表示 owner 無法以名稱引用（匿名 default class、
 * `export default { ... }`、巢狀 object literal）→ 呼叫端須保守掃描全部專案檔。
 */
export interface MemberTarget {
  readonly ownerName: string | undefined;
}

/**
 * owner 家族（owner 與已發現子類）：各檔引用家族的本地名，以及家族 class 宣告的 `檔案#名稱` 鍵。
 */
interface OwnerFamily {
  readonly localNamesByFile: Map<string, Set<string>>;
  readonly declarationKeys: Set<string>;
}

interface FileAnalysis {
  readonly sourceFile: ts.SourceFile;
  readonly declarations: ReadonlyMap<string, readonly ts.Node[]>;
}

/** receiver 所指 class 值的來源：本檔 class 宣告，或 import 繫結（module specifier + 匯出名） */
type ClassValueSource =
  | { readonly kind: 'local'; readonly declaration: ts.ClassDeclaration }
  | { readonly kind: 'import'; readonly moduleSpecifier: string; readonly exportName: string };

/** 去掉括號與純型別層包裝（`as`／`satisfies`／`!`／`<T>`），取 runtime 值運算式 */
function skipTypeWrappers(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current) || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export class MemberCallSiteScope {
  constructor(
    private readonly fileUtils: FileUtils,
    private readonly locator: FunctionDeclarationLocator,
    private readonly bindingResolver: CallSiteBindingResolver,
    private readonly symbolFinder: SymbolFinder,
    private readonly pathUtils: PathUtils
  ) {}

  /**
   * 以 AST 判斷目標是否為成員方法（class method，含 static；object literal method）。
   * 不依賴 signature.isMethod（regex 推斷），非成員回傳 null。
   */
  async resolveMemberTarget(signature: FunctionSignature): Promise<MemberTarget | null> {
    const sourceFile = await this.parse(signature.location.filePath);
    if (!sourceFile) {
      return null;
    }
    const node = this.locator.findFunctionLikeDeclaration(sourceFile, signature);
    if (!node || !ts.isMethodDeclaration(node)) {
      return null;
    }
    return { ownerName: this.getOwnerName(node.parent) };
  }

  /**
   * 收集目標方法在「引用 owner 的檔案」（含定義檔）中的方法呼叫點（`x.m(...)`，不含 new），
   * 排除 receiver 可證明為無關 class 的同名方法呼叫。
   */
  async findMemberMethodCallSites(
    target: MemberTarget,
    definitionFile: string,
    methodName: string,
    projectFiles: readonly string[]
  ): Promise<CallSite[]> {
    if (target.ownerName === undefined) {
      const sites = await this.symbolFinder.findCallSites(methodName, [...projectFiles]);
      return sites.filter(site => site.isMethodCall && site.isNewExpression !== true);
    }

    const family = await this.collectOwnerFamily(target.ownerName, definitionFile, projectFiles);
    const definitionKey = path.resolve(definitionFile);
    if (!family.localNamesByFile.has(definitionKey)) {
      family.localNamesByFile.set(definitionKey, new Set([target.ownerName]));
    }

    const sites = await this.symbolFinder.findCallSites(methodName, [...family.localNamesByFile.keys()]);
    const analyses = new Map<string, Promise<FileAnalysis | null>>();
    const kept: CallSite[] = [];
    for (const site of sites) {
      if (!site.isMethodCall || site.isNewExpression === true) {
        continue;
      }
      if (!await this.isProvablyUnrelatedReceiver(site, methodName, family, projectFiles, analyses)) {
        kept.push(site);
      }
    }
    return kept;
  }

  /**
   * 引用 owner 的檔案：直接／alias／default／namespace／type-only import owner 的檔案，
   * 並遞迴納入跨檔子類（`class Sub extends Owner`）的引用檔（子類實例同樣繼承目標方法）。
   */
  private async collectOwnerFamily(
    ownerName: string,
    definitionFile: string,
    projectFiles: readonly string[]
  ): Promise<OwnerFamily> {
    const localNamesByFile = new Map<string, Set<string>>();
    const declarationKeys = new Set<string>();
    const worklist: Array<{ owner: string; file: string }> = [{ owner: ownerName, file: definitionFile }];

    let next = worklist.pop();
    for (; next !== undefined; next = worklist.pop()) {
      const { owner, file } = next;
      const key = `${path.resolve(file)}#${owner}`;
      if (declarationKeys.has(key)) {
        continue;
      }
      declarationKeys.add(key);

      const bindings = await this.bindingResolver.resolveTargetBindings(
        projectFiles,
        file,
        owner,
        { includeTypeOnly: true }
      );
      for (const [bindingFile, binding] of bindings) {
        const fileKey = path.resolve(bindingFile);
        const names = localNamesByFile.get(fileKey) ?? new Set<string>();
        binding.localNames.forEach(name => names.add(name));
        localNamesByFile.set(fileKey, names);
        const subclasses = await this.findSubclassNames(bindingFile, binding.localNames, binding.namespaceReceivers, owner);
        for (const subclass of subclasses) {
          worklist.push({ owner: subclass, file: bindingFile });
        }
      }
    }

    return { localNamesByFile, declarationKeys };
  }

  /**
   * receiver 是否有名目證據證明不是 owner 家族：`new X()`、以 `new X()` 初始化的 const、
   * 或 class 值本身（static 呼叫），且 X 解析到無 `extends` 的非家族 class 宣告。
   * 名稱在檔內宣告不只一次（可能遮蔽）或任何一環無法確定時回傳 false（保守保留）。
   */
  private async isProvablyUnrelatedReceiver(
    site: CallSite,
    methodName: string,
    family: OwnerFamily,
    projectFiles: readonly string[],
    analyses: Map<string, Promise<FileAnalysis | null>>
  ): Promise<boolean> {
    const file = path.resolve(site.location.filePath);
    const analyzed = await this.getAnalysis(file, analyses);
    if (!analyzed) {
      return false;
    }
    const { sourceFile, declarations } = analyzed;
    const call = this.findMethodCallAt(sourceFile, site, methodName);
    if (!call) {
      return false;
    }

    const familyNames = family.localNamesByFile.get(file) ?? new Set<string>();
    const source = this.resolveReceiverClassValue(
      skipTypeWrappers(call.expression.expression),
      declarations,
      familyNames
    );
    if (!source) {
      return false;
    }

    if (source.kind === 'local') {
      return this.isUnrelatedClassDeclaration(file, source.declaration, family);
    }
    const exportedClass = await this.resolveImportedClassDeclaration(file, source, projectFiles, analyses);
    return exportedClass !== null
      && this.isUnrelatedClassDeclaration(exportedClass.file, exportedClass.declaration, family);
  }

  private getAnalysis(
    file: string,
    analyses: Map<string, Promise<FileAnalysis | null>>
  ): Promise<FileAnalysis | null> {
    const key = path.resolve(file);
    let analysis = analyses.get(key);
    if (!analysis) {
      analysis = this.parse(key).then(sourceFile =>
        sourceFile ? { sourceFile, declarations: this.collectValueDeclarations(sourceFile) } : null
      );
      analyses.set(key, analysis);
    }
    return analysis;
  }

  private findMethodCallAt(
    sourceFile: ts.SourceFile,
    site: CallSite,
    methodName: string
  ): (ts.CallExpression & { expression: ts.PropertyAccessExpression }) | undefined {
    const { line, column } = site.location.range.start;
    const offset = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
    const find = (node: ts.Node): (ts.CallExpression & { expression: ts.PropertyAccessExpression }) | undefined => {
      if (
        ts.isCallExpression(node)
        && node.getStart(sourceFile) === offset
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === methodName
      ) {
        return node as ts.CallExpression & { expression: ts.PropertyAccessExpression };
      }
      return node.pos <= offset && offset < node.end ? ts.forEachChild(node, find) : undefined;
    };
    return find(sourceFile);
  }

  private resolveReceiverClassValue(
    receiver: ts.Expression,
    declarations: ReadonlyMap<string, readonly ts.Node[]>,
    familyNames: ReadonlySet<string>
  ): ClassValueSource | undefined {
    if (ts.isNewExpression(receiver)) {
      const callee = skipTypeWrappers(receiver.expression);
      return ts.isIdentifier(callee) ? this.resolveClassValue(callee, declarations, familyNames) : undefined;
    }
    if (!ts.isIdentifier(receiver) || familyNames.has(receiver.text)) {
      return undefined;
    }
    const declaration = this.uniqueVisibleDeclaration(receiver, declarations);
    if (
      declaration
      && ts.isVariableDeclaration(declaration)
      && (declaration.parent.flags & ts.NodeFlags.Const) !== 0
      && declaration.initializer
    ) {
      const initializer = skipTypeWrappers(declaration.initializer);
      if (ts.isNewExpression(initializer)) {
        const callee = skipTypeWrappers(initializer.expression);
        return ts.isIdentifier(callee) ? this.resolveClassValue(callee, declarations, familyNames) : undefined;
      }
      return undefined;
    }
    return this.resolveClassValue(receiver, declarations, familyNames);
  }

  /** 識別字作為 class 值：本檔唯一的 class 宣告，或 named／default import 繫結 */
  private resolveClassValue(
    identifier: ts.Identifier,
    declarations: ReadonlyMap<string, readonly ts.Node[]>,
    familyNames: ReadonlySet<string>
  ): ClassValueSource | undefined {
    if (familyNames.has(identifier.text)) {
      return undefined;
    }
    const declaration = this.uniqueVisibleDeclaration(identifier, declarations);
    if (!declaration) {
      return undefined;
    }
    if (ts.isClassDeclaration(declaration)) {
      return { kind: 'local', declaration };
    }
    const importDeclaration = ts.isImportSpecifier(declaration)
      ? declaration.parent.parent.parent
      : ts.isImportClause(declaration) ? declaration.parent : undefined;
    if (!importDeclaration || !ts.isStringLiteral(importDeclaration.moduleSpecifier)) {
      return undefined;
    }
    const exportName = ts.isImportSpecifier(declaration)
      ? (declaration.propertyName ?? declaration.name).text
      : 'default';
    return { kind: 'import', moduleSpecifier: importDeclaration.moduleSpecifier.text, exportName };
  }

  /** 名稱在檔內恰宣告一次且宣告所在作用域涵蓋使用處，才回傳該宣告 */
  private uniqueVisibleDeclaration(
    identifier: ts.Identifier,
    declarations: ReadonlyMap<string, readonly ts.Node[]>
  ): ts.Node | undefined {
    const candidates = declarations.get(identifier.text);
    if (candidates?.length !== 1) {
      return undefined;
    }
    const declaration = candidates[0];
    const scope = ts.isVariableDeclaration(declaration)
      ? (ts.isVariableStatement(declaration.parent.parent) ? declaration.parent.parent.parent : declaration.parent.parent)
      : ts.isClassDeclaration(declaration) ? declaration.parent : declaration.getSourceFile();
    return scope.pos <= identifier.pos && identifier.end <= scope.end ? declaration : undefined;
  }

  /** 檔內所有值層宣告（變數、參數、函式、class、import、enum、namespace），名稱 → 宣告節點 */
  private collectValueDeclarations(sourceFile: ts.SourceFile): Map<string, ts.Node[]> {
    const declarations = new Map<string, ts.Node[]>();
    const add = (name: string, node: ts.Node): void => {
      const list = declarations.get(name) ?? [];
      list.push(node);
      declarations.set(name, list);
    };
    const addBinding = (name: ts.BindingName, node: ts.Node): void => {
      const names = new Set<string>();
      collectBindingNames(name, names);
      names.forEach(bound => add(bound, ts.isIdentifier(name) ? node : name));
    };
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        addBinding(node.name, node);
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node)
          || ts.isClassExpression(node) || ts.isEnumDeclaration(node))
        && node.name
      ) {
        add(node.name.text, node);
      } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        add(node.name.text, node);
      } else if (ts.isImportClause(node) && node.name) {
        add(node.name.text, node);
      } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) {
        add(node.name.text, node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return declarations;
  }

  private isUnrelatedClassDeclaration(file: string, declaration: ts.ClassDeclaration, family: OwnerFamily): boolean {
    const hasExtends = declaration.heritageClauses?.some(clause => clause.token === ts.SyntaxKind.ExtendsKeyword) ?? false;
    const key = declaration.name ? `${path.resolve(file)}#${declaration.name.text}` : undefined;
    return !hasExtends && key !== undefined && !family.declarationKeys.has(key);
  }

  /**
   * import 繫結解析到專案檔中直接匯出的 class 宣告（`export class X`、`export default class`、
   * `export { X as Y }`）；re-export 轉發、值別名等其他形式回傳 null（保守保留）。
   */
  private async resolveImportedClassDeclaration(
    importerFile: string,
    source: Extract<ClassValueSource, { kind: 'import' }>,
    projectFiles: readonly string[],
    analyses: Map<string, Promise<FileAnalysis | null>>
  ): Promise<{ file: string; declaration: ts.ClassDeclaration } | null> {
    const resolved = await this.pathUtils.resolveImportPathAsync(source.moduleSpecifier, importerFile);
    const file = projectFiles.find(candidate => this.pathUtils.pathsMatch(resolved, candidate));
    const analyzed = file ? await this.getAnalysis(file, analyses) : null;
    if (!file || !analyzed) {
      return null;
    }
    const { sourceFile, declarations } = analyzed;

    const topLevelClasses = sourceFile.statements.filter(ts.isClassDeclaration);
    const hasModifier = (node: ts.ClassDeclaration, kind: ts.SyntaxKind): boolean =>
      ts.getModifiers(node)?.some(modifier => modifier.kind === kind) ?? false;

    let localName: string | undefined;
    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && !statement.isTypeOnly
        && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const element = statement.exportClause.elements.find(item => item.name.text === source.exportName);
        if (element) {
          localName = (element.propertyName ?? element.name).text;
        }
      }
    }

    const declaration = topLevelClasses.find(node =>
      source.exportName === 'default'
        ? hasModifier(node, ts.SyntaxKind.ExportKeyword) && hasModifier(node, ts.SyntaxKind.DefaultKeyword)
        : node.name?.text === source.exportName
          && hasModifier(node, ts.SyntaxKind.ExportKeyword) && !hasModifier(node, ts.SyntaxKind.DefaultKeyword)
    ) ?? (localName === undefined ? undefined : topLevelClasses.find(node => node.name?.text === localName));
    if (!declaration?.name) {
      return null;
    }
    const sameNameDeclarations = declarations.get(declaration.name.text);
    return sameNameDeclarations?.length === 1 ? { file, declaration } : null;
  }

  /**
   * 找出檔案中 `class Sub extends <localName>` 或 `extends <ns>.<owner>` 的具名子類。
   */
  private async findSubclassNames(
    file: string,
    localNames: ReadonlySet<string>,
    namespaceReceivers: ReadonlySet<string>,
    owner: string
  ): Promise<string[]> {
    const sourceFile = await this.parse(file);
    if (!sourceFile) {
      return [];
    }

    const extendsOwner = (expr: ts.Expression): boolean => {
      if (ts.isIdentifier(expr)) {
        return localNames.has(expr.text);
      }
      return ts.isPropertyAccessExpression(expr)
        && ts.isIdentifier(expr.expression)
        && namespaceReceivers.has(expr.expression.text)
        && expr.name.text === owner;
    };

    const names: string[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.heritageClauses) {
        const extendsClause = node.heritageClauses.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword);
        const baseExpr = extendsClause?.types[0]?.expression;
        if (baseExpr && extendsOwner(baseExpr)) {
          const name = this.getOwnerName(node);
          if (name !== undefined) {
            names.push(name);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return names;
  }

  /**
   * owner 的可引用名稱：具名 class、`const X = class {}`、`const obj = { ... }`。
   */
  private getOwnerName(owner: ts.Node): string | undefined {
    if ((ts.isClassDeclaration(owner) || ts.isClassExpression(owner)) && owner.name) {
      return owner.name.text;
    }
    if (ts.isClassExpression(owner) || ts.isObjectLiteralExpression(owner)) {
      let parent: ts.Node = owner.parent;
      while (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent)) {
        parent = parent.parent;
      }
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }
    return undefined;
  }

  private async parse(file: string): Promise<ts.SourceFile | null> {
    const content = await this.fileUtils.readFile(file);
    if (!content) {
      return null;
    }
    return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, getScriptKind(file));
  }
}

export function createMemberCallSiteScope(
  fileUtils: FileUtils,
  locator: FunctionDeclarationLocator,
  bindingResolver: CallSiteBindingResolver,
  symbolFinder: SymbolFinder,
  pathUtils: PathUtils
): MemberCallSiteScope {
  return new MemberCallSiteScope(fileUtils, locator, bindingResolver, symbolFinder, pathUtils);
}
