/**
 * 目標符號「曝露來源」解析器
 *
 * 解決 rename 錨定層（TypeScript language-service）的兩個限制：
 * - C3：consumer 透過 tsconfig path alias（`@app/target`）匯入目標符號時，錨定層的
 *   moduleSpecifierMatchesDefinition 對非相對 specifier 一律回 false（無專案設定），漏改 consumer。
 * - C4：多層 barrel re-export 鏈（`user → barrel2 → barrel1 → def`）只更新最靠近定義的一層，
 *   因為錨定層只做「specifier 直接解析到定義檔」的單跳比對、不遞迴 re-export 轉發。
 *
 * 本解析器在 rename 引擎層（有 IFileSystem、專案檔清單、tsconfig 設定）預先計算「哪些檔案會把目標
 * 符號名對外曝露成源自定義檔」（定義檔本身，加上遞迴轉發它的 barrel 檔），並回傳一個同步述詞：
 * 給定「匯入檔 + module specifier」判定該 specifier 是否解析到任一曝露檔。錨定層只需呼叫此述詞、
 * 無需自行讀檔或懂 tsconfig（見 language-service 的 moduleResolver 參數）。
 *
 * import specifier 的解析（相對路徑、tsconfig paths 別名、baseUrl、省略副檔名、index 檔慣例）
 * 一律交由 file-move 的 PathUtils，與 move / change-signature 同一把尺（Single Source of Truth）。
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ModuleSpecifierResolver } from '@infrastructure/parser/types.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';
import { resolveBarePathAlias } from '@shared/path-alias-resolver.js';

export interface TargetExposureConfig {
  readonly fileSystem: IFileSystem;
  /** 專案內所有原始碼檔案（絕對或相對路徑皆可，內部一律正規化為絕對） */
  readonly projectFiles: readonly string[];
  /** 目標符號定義檔（絕對路徑） */
  readonly definitionFilePath: string;
  /** 目標符號名稱 */
  readonly symbolName: string;
  /** tsconfig path aliases（已解析為絕對路徑，見 tsconfig-loader） */
  readonly pathAliases?: PathAliasInput;
  /** tsconfig baseUrl（絕對路徑） */
  readonly baseUrl?: string;
}

/**
 * 單層 re-export 轉發：`export { name } from '<spec>'`（name 省略代表 `export * from`）。
 * `isNamespaceExport` 標記 `export * as name from '<spec>'`：與具名轉發不同，這種轉發
 * 不是把來源模組的 `name` 匯出原樣轉發（來源模組通常根本沒有叫 `name` 的匯出），而是把
 * 整個來源模組包成一個新的具名匯出 `name`（namespace 物件），需另一套查詢語意
 * （見 isNamespaceLocalNameExposed）。
 */
interface ReexportForward {
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
 * `export { type X } from './y'`）一併視為轉發：本解析器判定的是「對外曝露成源自定義檔」，
 * 目標符號本身也可能就是 type-only（如 type alias／interface），略過 type-only 轉發
 * 會漏掉這類 barrel，導致 consumer 端的 `import type` 引用未被同步改到。
 *
 * `export * as ns from '<spec>'` 把來源模組整個包成單一具名匯出 `ns`（namespace 物件），
 * 目標符號透過 `ns.member` 間接曝露，而非直接以自己的名稱曝露成 barrel 的頂層匯出——與
 * 一般具名轉發（`export { X } from`）不同，consumer 端不能 `import { X } from './barrel'`，
 * 只能 `import { ns } from './barrel'` 再 `ns.X`。故記錄精確的具名（`ns` 本身，而非目標
 * 符號名）並標記 `isNamespaceExport`，供 isNamespaceLocalNameExposed 另外查詢（見 R2 finding
 * 1：漏掉此轉發會讓 barrel 內 `export * as ns from './def'` 對外曝露 def.ts 的符號完全無法
 * 被 rename 引擎判定為「來源於定義檔」，consumer 端 `ns.X()` 因此漏改）。
 */
function parseReexportForwards(filePath: string, content: string): ReexportForward[] {
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

/**
 * 建立目標符號曝露述詞。預先讀取並解析所有專案檔的 re-export 轉發，回傳的述詞為同步（供
 * language-service 同步錨定層呼叫），內部以 memo + visited set 做遞迴轉發判定並防環。
 */
export async function createTargetExposureResolver(
  config: TargetExposureConfig
): Promise<ModuleSpecifierResolver> {
  const pathUtils = new PathUtils(
    new ImportResolver({
      pathAliases: config.pathAliases ?? {},
      baseUrl: config.baseUrl,
      supportedExtensions: ALLOWED_EXTENSIONS
    })
  );

  const definitionAbsolute = path.resolve(config.definitionFilePath);
  const projectAbsolute = config.projectFiles.map(file => path.resolve(file));

  // 預先解析各專案檔的 re-export 轉發（唯一的 I/O 階段，之後述詞全同步）
  const forwardsByFile = new Map<string, ReexportForward[]>();
  for (const fileAbs of projectAbsolute) {
    let content: string | null = null;
    try {
      content = await config.fileSystem.readFile(fileAbs, 'utf-8') as string;
    } catch {
      continue; // 讀不到（已被移動/刪除等）視為無轉發
    }
    // 快篩：無 re-export 語句的檔案直接跳過 AST 解析
    if (!content || !content.includes('export') || !content.includes('from')) {
      continue;
    }
    const forwards = parseReexportForwards(fileAbs, content);
    if (forwards.length > 0) {
      forwardsByFile.set(fileAbs, forwards);
    }
  }

  /** 將 specifier 從 importingFile 解析後，找出對應的專案檔絕對路徑（含省略副檔名/index 慣例） */
  const resolveToProjectFile = (importingFile: string, specifier: string): string | null => {
    const aliasResolved = resolveBarePathAlias(
      specifier,
      config.pathAliases ?? {},
      candidate => projectAbsolute.some(fileAbs => pathUtils.pathsMatch(candidate, fileAbs))
    );
    const resolved = aliasResolved ?? pathUtils.resolveImportPath(specifier, importingFile);
    if (pathUtils.pathsMatch(resolved, definitionAbsolute)) {
      return definitionAbsolute;
    }
    return projectAbsolute.find(fileAbs => pathUtils.pathsMatch(resolved, fileAbs)) ?? null;
  };

  // 只快取「確定曝露（true）」的結果：true 一旦找到即為定論（存在一條轉發鏈到定義檔）。
  // false 可能是被 visited 環偵測提前截斷的「此路徑不成立」，非全域定論，故不快取以免污染
  // 其他路徑（同一檔可能經另一條非成環路徑抵達定義檔）。
  const exposingMemo = new Set<string>();

  /** file 是否把目標符號名對外曝露成「源自定義檔」（定義檔本身，或遞迴轉發回定義檔的 barrel） */
  const exposesTarget = (fileAbs: string, visited: Set<string>): boolean => {
    if (fileAbs === definitionAbsolute) {
      return true;
    }
    if (exposingMemo.has(fileAbs)) {
      return true;
    }
    if (visited.has(fileAbs)) {
      return false; // re-export 成環：此路徑不成立（其他路徑另行判定）
    }
    visited.add(fileAbs);

    let result = false;
    for (const forward of forwardsByFile.get(fileAbs) ?? []) {
      // namespace-export 轉發（`export * as ns from`）不是直接以目標符號名曝露 barrel
      // 頂層匯出，須走 isNamespaceLocalNameExposed 另外查詢，此處（任意具名/直接曝露）排除
      if (forward.isNamespaceExport) {
        continue;
      }
      // 具名轉發須為目標符號名；`export *` 轉發全部匯出（exportedName 省略）一律納入
      if (forward.exportedName !== undefined && forward.exportedName !== config.symbolName) {
        continue;
      }
      const forwardTarget = resolveToProjectFile(fileAbs, forward.moduleSpecifier);
      if (forwardTarget && exposesTarget(forwardTarget, visited)) {
        result = true;
        break;
      }
    }

    visited.delete(fileAbs);
    if (result) {
      exposingMemo.add(fileAbs);
    }
    return result;
  };

  /**
   * file 內名為 `localName` 的具名匯出，是否為 `export * as localName from '<spec>'`
   * 轉發、且該轉發（遞迴）曝露目標符號。用於判定 consumer 端 `import { localName } from
   * '<file 的 specifier>'` 綁定的實際是「來源於定義檔的 namespace 物件」，等同 namespace
   * import（`import * as localName from ...`）對 `localName.member` 的引用語意（見 R2
   * finding 1）。與 exposesTarget 分屬不同查詢：後者問「file 是否曝露目標符號」，此處問
   * 「file 的『這一個』具名匯出是否為指向目標符號的 namespace 轉發」。
   */
  const namespaceExposingMemo = new Set<string>();
  const isNamespaceLocalNameExposed = (
    fileAbs: string,
    localName: string,
    visited: Set<string> = new Set<string>()
  ): boolean => {
    const visitKey = `${fileAbs}:${localName}`;
    if (namespaceExposingMemo.has(visitKey)) {
      return true;
    }
    if (visited.has(visitKey)) {
      return false;
    }
    visited.add(visitKey);

    for (const forward of forwardsByFile.get(fileAbs) ?? []) {
      const forwardTarget = resolveToProjectFile(fileAbs, forward.moduleSpecifier);
      if (!forwardTarget) {
        continue;
      }

      if (forward.isNamespaceExport && forward.exportedName === localName) {
        if (exposesTarget(forwardTarget, new Set<string>())) {
          namespaceExposingMemo.add(visitKey);
          visited.delete(visitKey);
          return true;
        }
        continue;
      }

      // `export * from './barrel1'`（或 `export { ns as api } from ...`）把 namespace
      // binding 一起轉發；沿來源名稱往內追蹤，不能只看目前這一層。
      if (
        !forward.isNamespaceExport
        && (forward.exportedName === undefined || forward.exportedName === localName)
        && isNamespaceLocalNameExposed(
          forwardTarget,
          forward.importedName ?? localName,
          visited
        )
      ) {
        namespaceExposingMemo.add(visitKey);
        visited.delete(visitKey);
        return true;
      }
    }

    visited.delete(visitKey);
    return false;
  };

  return (importingFileName: string, moduleSpecifier: string, namedImportLocalName?: string): boolean => {
    const target = resolveToProjectFile(importingFileName, moduleSpecifier);
    if (!target) {
      return false;
    }
    if (namedImportLocalName !== undefined) {
      return isNamespaceLocalNameExposed(target, namedImportLocalName);
    }
    return exposesTarget(target, new Set<string>());
  };
}
