/**
 * Re-export 轉發解析（barrel 鏈路共用素材）
 *
 * `export { name } from '<spec>'` / `export * from '<spec>'` /
 * `export * as ns from '<spec>'` 的單層轉發解析，供需要「跟隨 barrel re-export 鏈追到
 * 真正定義檔」的模組共用（rename 的 target-exposure-resolver、call-hierarchy 的
 * outgoing/incoming barrel 穿透皆使用同一份，Single Source of Truth）。
 */

import * as ts from 'typescript';

/**
 * 單層 re-export 轉發：`export { name } from '<spec>'`（name 省略代表 `export * from`）。
 * `isNamespaceExport` 標記 `export * as name from '<spec>'`：與具名轉發不同，這種轉發
 * 不是把來源模組的 `name` 匯出原樣轉發（來源模組通常根本沒有叫 `name` 的匯出），而是把
 * 整個來源模組包成一個新的具名匯出 `name`（namespace 物件），需另一套查詢語意。
 */
export interface ReexportForward {
  readonly moduleSpecifier: string;
  readonly importedName?: string;
  readonly exportedName?: string;
  readonly isNamespaceExport?: boolean;
}

/**
 * 解析檔案中的 re-export 轉發宣告：`export { name } from '<spec>'`（未 alias 改名）、
 * `export * from '<spec>'`，以及 `export * as ns from '<spec>'`（NamespaceExport）。
 * 具名轉發保留來源名稱與對外名稱，讓 namespace binding 的 alias chain 可以遞迴追蹤。直接
 * 以 TS AST 解析語法結構，不依賴副檔名（TS parser 亦可解析 .js 檔語法）。
 *
 * type-only 轉發（整句 `export type { X } from './y'` 或單一 specifier
 * `export { type X } from './y'`）一併視為轉發：判定的是「對外曝露成源自定義檔」，
 * 目標符號本身也可能就是 type-only（如 type alias／interface），略過 type-only 轉發
 * 會漏掉這類 barrel。
 */
export function parseReexportForwards(filePath: string, content: string): ReexportForward[] {
  const forwards: ReexportForward[] = [];
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
      continue; // 非 re-export（純 local export，無 from 子句）
    }
    if (!statement.exportClause) {
      forwards.push({ moduleSpecifier: moduleSpecifier.text }); // `export * from`
      continue;
    }
    if (ts.isNamespaceExport(statement.exportClause)) {
      // `export * as ns from '<spec>'`：具名為 ns 本身，非目標符號名
      forwards.push({
        moduleSpecifier: moduleSpecifier.text,
        exportedName: statement.exportClause.name.text,
        isNamespaceExport: true
      });
      continue;
    }
    if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        forwards.push({
          moduleSpecifier: moduleSpecifier.text,
          importedName: element.propertyName?.text ?? element.name.text,
          exportedName: element.name.text
        });
      }
    }
  }

  return forwards;
}
