/**
 * 依賴提取器
 * 負責從檔案內容中提取 import 依賴
 */

import * as path from 'path';
import * as ts from 'typescript';
import {
  type Dependency,
  DependencyType,
  isJavaScriptSourceExtension,
  isSourceFileExtension,
  isTypeScriptSourceExtension
} from '@shared/types/index.js';
import type { ParserRegistry } from '@infrastructure/parser/index.js';
import type { PathResolver } from './path-resolver.js';
import type { FileScanner } from './file-scanner.js';

interface DependencySpec {
  importPath: string;
  type: DependencyType;
  isTypeOnly: boolean;
}

/**
 * 依賴提取器類別
 */
export class DependencyExtractor {
  private pathResolver: PathResolver;
  private fileScanner: FileScanner;

  constructor(
    pathResolver: PathResolver,
    fileScanner: FileScanner,
    private readonly parserRegistry?: ParserRegistry
  ) {
    this.pathResolver = pathResolver;
    this.fileScanner = fileScanner;
  }

  /**
   * 從檔案內容中提取依賴關係
   * @param content 檔案內容
   * @param filePath 檔案路徑
   * @returns 依賴列表
   */
  async extractDependencies(content: string, filePath: string): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const fileExt = path.extname(filePath);

    if (!isSourceFileExtension(fileExt) && !this.parserRegistry?.getParser(fileExt)) {
      return dependencies;
    }

    if (!isTypeScriptSourceExtension(fileExt) && !isJavaScriptSourceExtension(fileExt)) {
      return this.extractParserDependencies(content, filePath);
    }

    const dependencySpecs = this.extractDependencySpecs(content, filePath);

    for (const dependencySpec of dependencySpecs) {
      const resolvedPath = await this.pathResolver.resolvePath(dependencySpec.importPath, filePath);

      if (resolvedPath && this.fileScanner.shouldIncludeDependency(resolvedPath.resolvedPath)) {
        dependencies.push({
          path: resolvedPath.resolvedPath,
          type: dependencySpec.type,
          isRelative: resolvedPath.isRelative,
          importedSymbols: [],
          isTypeOnly: dependencySpec.isTypeOnly,
        });
      }
    }

    return dependencies;
  }

  private async extractParserDependencies(content: string, filePath: string): Promise<Dependency[]> {
    const parser = this.parserRegistry?.getParser(path.extname(filePath));
    if (!parser) {
      return [];
    }

    const ast = await parser.parse(content, filePath);
    const parserDependencies = await parser.extractDependencies(ast);
    const dependencies: Dependency[] = [];

    for (const parserDependency of parserDependencies) {
      const resolvedPath = await this.pathResolver.resolvePath(parserDependency.path, filePath);

      if (resolvedPath && this.fileScanner.shouldIncludeDependency(resolvedPath.resolvedPath)) {
        dependencies.push({
          ...parserDependency,
          path: resolvedPath.resolvedPath,
          isRelative: resolvedPath.isRelative
        });
      }
    }

    return dependencies;
  }

  private extractDependencySpecs(content: string, filePath: string): DependencySpec[] {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );
    const dependencySpecs: DependencySpec[] = [];

    const visit = (node: ts.Node): void => {
      const dependencySpec = this.extractDependencySpecFromNode(node);
      if (dependencySpec) {
        dependencySpecs.push(dependencySpec);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return dependencySpecs;
  }

  private extractDependencySpecFromNode(node: ts.Node): DependencySpec | null {
    if (ts.isImportDeclaration(node)) {
      const importPath = this.getStaticModulePath(node.moduleSpecifier);
      if (!importPath) {
        return null;
      }

      return {
        importPath,
        type: DependencyType.Import,
        isTypeOnly: this.isImportDeclarationTypeOnly(node)
      };
    }

    if (ts.isExportDeclaration(node)) {
      const importPath = node.moduleSpecifier
        ? this.getStaticModulePath(node.moduleSpecifier)
        : null;
      if (!importPath) {
        return null;
      }

      return {
        importPath,
        type: DependencyType.Import,
        isTypeOnly: this.isExportDeclarationTypeOnly(node)
      };
    }

    if (ts.isImportEqualsDeclaration(node)) {
      return this.extractImportEqualsDependency(node);
    }

    if (ts.isCallExpression(node)) {
      return this.extractCallExpressionDependency(node);
    }

    return null;
  }

  private extractImportEqualsDependency(node: ts.ImportEqualsDeclaration): DependencySpec | null {
    if (!ts.isExternalModuleReference(node.moduleReference)) {
      return null;
    }

    const importPath = this.getStaticModulePath(node.moduleReference.expression);
    if (!importPath) {
      return null;
    }

    return {
      importPath,
      type: DependencyType.Require,
      isTypeOnly: false
    };
  }

  private extractCallExpressionDependency(node: ts.CallExpression): DependencySpec | null {
    const importPath = node.arguments.length > 0
      ? this.getStaticModulePath(node.arguments[0])
      : null;
    if (!importPath) {
      return null;
    }

    if (this.isRequireCall(node)) {
      return {
        importPath,
        type: DependencyType.Require,
        isTypeOnly: false
      };
    }

    if (this.isDynamicImportCall(node)) {
      return {
        importPath,
        type: DependencyType.Import,
        isTypeOnly: false
      };
    }

    return null;
  }

  private isRequireCall(node: ts.CallExpression): boolean {
    return ts.isIdentifier(node.expression) && node.expression.text === 'require';
  }

  private isDynamicImportCall(node: ts.CallExpression): boolean {
    return node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'import');
  }

  private getStaticModulePath(expression: ts.Expression): string | null {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }

    return null;
  }

  private isImportDeclarationTypeOnly(node: ts.ImportDeclaration): boolean {
    const importClause = node.importClause;
    if (!importClause) {
      return false;
    }

    if (importClause.isTypeOnly) {
      return true;
    }

    const namedBindings = importClause.namedBindings;
    if (importClause.name || !namedBindings || !ts.isNamedImports(namedBindings)) {
      return false;
    }

    return namedBindings.elements.length > 0
      && namedBindings.elements.every(element => element.isTypeOnly);
  }

  private isExportDeclarationTypeOnly(node: ts.ExportDeclaration): boolean {
    if (node.isTypeOnly) {
      return true;
    }

    const exportClause = node.exportClause;
    if (!exportClause || !ts.isNamedExports(exportClause)) {
      return false;
    }

    return exportClause.elements.length > 0
      && exportClause.elements.every(element => element.isTypeOnly);
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx')) {
      return ts.ScriptKind.TSX;
    }

    if (filePath.endsWith('.jsx')) {
      return ts.ScriptKind.JSX;
    }

    if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
      return ts.ScriptKind.JS;
    }

    return ts.ScriptKind.TS;
  }
}
