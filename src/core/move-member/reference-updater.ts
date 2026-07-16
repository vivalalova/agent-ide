/**
 * Reference Updater
 * 負責掃描和更新引用（import 語句）
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { MemberType, type MemberDefinition, type ReferenceUpdate, type MoveMemberOptions, type FileChange } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';
import { createIdentifierBoundaryRegex, maskNonCode } from '@core/foundations/index.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils, withEsmRuntimeExtension } from '@core/move/path-utils.js';
import { UNICODE_IDENTIFIER_PATTERN_SOURCE } from './utils/identifier-pattern.js';
import { isInsideStringOrComment } from './utils/source-text.js';
import {
  collectImportExportStatement,
  createStatementLocation,
  type ImportExportStatement
} from './utils/import-export-statement.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';

/**
 * Reference Updater 的路徑解析設定（tsconfig paths + baseUrl）
 * pathAliases 期望已解析為絕對路徑（見 tsconfig-loader）
 */
export interface ReferenceUpdaterPathConfig {
  readonly pathAliases?: PathAliasInput;
  readonly baseUrl?: string;
}

/**
 * 解析的 import 成員
 */
interface ParsedImportMember {
  /** 原始名稱 */
  name: string;
  /** 別名（如 A as B 中的 B） */
  alias?: string;
  /** 是否為 type-only specifier（如 export { type A }） */
  typeOnly?: boolean;
}

type ImportExportStatementKind = 'import' | 'import type' | 'export' | 'export type';

type NamespaceMemberUsage = 'none' | 'moved-only' | 'mixed';

/**
 * Reference Updater
 * 負責掃描專案檔案中的 import 語句並準備更新
 */
export class ReferenceUpdater {
  private readonly pathUtils: PathUtils;

  constructor(
    private readonly fileSystem: IFileSystem,
    pathConfig?: ReferenceUpdaterPathConfig
  ) {
    // 重用 file-move 的 PathUtils 解析任意 tsconfig 別名 / baseUrl，
    // 取代硬寫的 src/ 與 @/ 分支（Single Source of Truth）
    this.pathUtils = new PathUtils(
      new ImportResolver({
        pathAliases: pathConfig?.pathAliases ?? {},
        baseUrl: pathConfig?.baseUrl,
        supportedExtensions: ALLOWED_EXTENSIONS
      }),
      fileSystem
    );
  }

  /**
   * 準備引用更新
   * 直接掃描 import 語句，不依賴 SymbolFinder 的引用類型
   * 支援分離 import 語句：當 import 包含多個成員時，只更新被移動的成員
   */
  async prepareReferenceUpdates(
    options: MoveMemberOptions,
    member: MemberDefinition,
    sourceFileChange: FileChange
  ): Promise<ReferenceUpdate[]> {
    const updates: ReferenceUpdate[] = [];
    const projectFiles = await this.getProjectFiles(options.projectRoot);

    for (const filePath of projectFiles) {
      // 來源檔案本身不會有「指向自己」的既有 import 語句可改寫，但移除成員後，
      // 檔內其餘程式碼若仍引用該成員，需補上對目標檔的新 import（見 M4 bug：
      // 原本對 sourceFile 一律 continue 跳過，導致同檔殘留引用變成未定義符號）
      if (filePath === options.sourceFile) {
        const selfReferenceUpdate = this.buildSourceSelfReferenceImport(options, member, sourceFileChange);
        if (selfReferenceUpdate) {
          updates.push(selfReferenceUpdate);
        }
        continue;
      }

      const content = await this.readFile(filePath);
      if (!content) {continue;}

      const lines = content.split('\n');

      // 掃描每一行找 import 語句；resumeColumn 記錄同一物理行上一筆語句結束後的
      // 欄位，供同行有第二筆 import/export 時（如 `import { a } from './x';
      // import { b } from './y';`）從該欄位重新掃描同一行，而非整行跳過導致
      // 第二筆語句連同其存在一併被忽略（見缺陷：同行第二個 import 消失）。
      let i = 0;
      let resumeColumn = 0;
      while (i < lines.length) {
        const statement = collectImportExportStatement(lines, i, resumeColumn);
        if (!statement) {
          i++;
          resumeColumn = 0;
          continue;
        }

        const statementOffset = lines
          .slice(0, statement.startLineIndex)
          .reduce((offset, sourceLine) => offset + sourceLine.length + 1, 0)
          + statement.startColumnIndex;
        if (isInsideStringOrComment(content, statementOffset)) {
          i++;
          resumeColumn = 0;
          continue;
        }

        // 先算好下一輪的掃描起點：語句結束行若還有殘餘內容（同行下一筆語句），
        // 停在原地、從結束欄位續掃；否則移到下一行從行首開始。之後所有 continue
        // 皆沿用這裡算好的 i/resumeColumn，等同原本 for 迴圈的自動遞增。
        if (statement.endColumnIndex < lines[statement.endLineIndex].length) {
          i = statement.endLineIndex;
          resumeColumn = statement.endColumnIndex;
        } else {
          i = statement.endLineIndex + 1;
          resumeColumn = 0;
        }
        const line = statement.text;

        // 檢查是否是 import 語句且包含成員名稱和來源路徑
        const importPathMatch = this.extractImportPath(line);
        if (!importPathMatch) {continue;}

        // 解析 import 路徑為絕對路徑並比較（PathUtils 支援任意 tsconfig 別名 / baseUrl）
        const resolvedImportPath = await this.pathUtils.resolveImportPathAsync(importPathMatch, filePath);

        // 比較路徑（考慮副檔名與 index 目錄解析）
        if (!this.pathUtils.pathsMatch(resolvedImportPath, options.sourceFile)) {continue;}

        // 依原始 import specifier 的樣式（是否帶副檔名、alias/baseUrl 相對路徑）
        // 回填新路徑，重用 file-move 既有的 PathUtils 邏輯（Single Source of Truth），
        // 避免像 calculateRelativePath 一樣一律去除副檔名而破壞 NodeNext/ESM 解析
        const newRelativePath = this.pathUtils.calculateNewImportPathPreservingStyle(
          importPathMatch,
          filePath,
          options.sourceFile,
          options.target.filePath
        );
        const quoteChar = this.detectQuoteChar(line);

        if (this.isStarReExport(line)) {
          // 目標檔已直接擁有搬入的成員，保留原本的 star re-export 即可；
          // 不能再插入指向自己的 `export { member } from './target'`。
          if (filePath === options.target.filePath) {
            continue;
          }

          const newImport = `${this.createMemberReExport(member, newRelativePath, quoteChar)}\n${line}`;
          updates.push({
            filePath,
            originalImport: line,
            newImport,
            location: createStatementLocation(filePath, statement)
          });
          continue;
        }

        // 解析 import 中的所有成員
        const importedMembers = this.parseImportedMembers(line);
        if (importedMembers.length === 0) {
          const namespaceImport = this.extractNamespaceImport(line);
          if (!namespaceImport) {
            continue;
          }

          const namespaceUsage = this.getNamespaceMemberUsage(content, statement, namespaceImport, member.name);
          if (namespaceUsage === 'mixed' ||
            (namespaceUsage === 'moved-only' && filePath === options.target.filePath)) {
            throw new Error(
              `無法安全更新 namespace import '${line}'：${member.name} 與來源模組其他成員的引用無法在一次移動中保留`
            );
          }
          if (namespaceUsage !== 'moved-only') {continue;}

          // namespace import 只有在 consumer 沒有使用來源模組其他成員時，
          // 才能安全地直接改模組路徑；混用情境已在上面直接拒絕，避免留下壞引用。
          const newImport = this.replaceImportPath(line, importPathMatch, newRelativePath);
          if (newImport !== line) {
            updates.push({
              filePath,
              originalImport: line,
              newImport,
              location: createStatementLocation(filePath, statement)
            });
          }
          continue;
        }

        // 找出需要移動的成員（可能帶別名）
        const memberToMove = importedMembers.find(m => m.name === member.name);
        if (!memberToMove) {continue;}

        // 其餘留在原位置的 named 成員，以及 default / namespace 前綴（P-D）
        const otherMembers = importedMembers.filter(m => m.name !== member.name);
        const defaultPrefix = this.extractDefaultPrefix(line);
        const statementKind = this.getStatementKind(line);

        // 生成保留在來源檔的 import（保留 default 前綴與其餘 named 成員）
        // 若 default 與 named 皆已無剩餘，則回傳空字串代表整條移除
        const remainingImport = this.buildRemainingSourceImport(
          statementKind,
          defaultPrefix,
          otherMembers,
          importPathMatch,
          quoteChar
        );

        // 嘗試把 moved 併入同檔已存在、指向目標檔的 named import（P-E）
        const existingTargetImport = filePath === options.target.filePath
          ? null
          : await this.findExistingTargetImport(lines, options, filePath, statement);

        const sourceLocation = createStatementLocation(filePath, statement);

        if (existingTargetImport) {
          // 來源語句改為僅保留 remaining（default + 其餘 named），moved 併入既有目標 import
          updates.push({
            filePath,
            originalImport: line,
            newImport: remainingImport,
            location: sourceLocation
          });

          const mergedMembers = [...existingTargetImport.members, memberToMove];
          const mergedImport = this.buildMergedTargetImport(
            existingTargetImport.statementKind,
            mergedMembers,
            existingTargetImport.importPath,
            existingTargetImport.quoteChar,
            existingTargetImport.defaultPrefix
          );
          updates.push({
            filePath,
            originalImport: existingTargetImport.statement.text,
            newImport: mergedImport,
            location: createStatementLocation(filePath, existingTargetImport.statement)
          });
          continue;
        }

        let newImport: string;
        if (filePath === options.target.filePath) {
          // 目標檔的成員本體會在同一 Changeset 中寫入；只保留來源 import
          // 中尚未搬移的 bindings，避免留下來源 import 與本地宣告同名的衝突。
          newImport = remainingImport;
        } else if (remainingImport) {
          // 仍有 default 或其餘 named 留在來源檔 → 重建：目標 import 在前、來源 remaining 在後
          const movedMemberStr = this.formatImportedMember(memberToMove);
          const newLocationImport = `${statementKind} { ${movedMemberStr} } from ${quoteChar}${newRelativePath}${quoteChar};`;
          newImport = `${newLocationImport}\n${remainingImport}`;
        } else {
          // 來源僅剩單一 moved（無 default、無其餘 named）→ 對原始語句做 path-only 替換，
          // 保留多行格式 / 縮排 / type-only / 別名，不重建 { member } 部分
          newImport = this.replaceImportPath(line, importPathMatch, newRelativePath);
        }

        if (newImport !== line) {
          updates.push({
            filePath,
            originalImport: line,
            newImport,
            location: sourceLocation
          });
        }
      }

      // require() / 動態 import() 路徑更新（F30）：ESM import/export 掃完後，
      // 再掃 CommonJS require 與 dynamic import()，對齊 move/import-resolver。
      const callUpdates = await this.prepareCallPathUpdates(content, filePath, options, member);
      updates.push(...callUpdates);
    }

    return updates;
  }

  /**
   * 檢查來源檔在成員移除後是否仍殘留對該成員的引用，若有則補上對目標檔的 import（M4）
   *
   * 範圍座標固定為檔案最開頭（line 1, column 1 的零寬插入），而非依 sourceFileChange.newCode
   * 計算「現有 import 之後」等相對位置：因為 Changeset 會將這筆更新與 sourceFileChange 的
   * 整檔替換合併為同一個 FileTextChange，兩者的 offset 都以「移除成員前的原始檔案」座標系統
   * 計算（見 ChangeApplicator.applyEdits：同一檔案的多個 edits 共用同一份、僅計算一次的
   * lines/offset）。檔案開頭（offset 0）在任何座標系統下皆恆為同一位置，是唯一不受此限制、
   * 可安全採用的插入點。
   *
   * @returns 需要補上的 import 更新；來源檔移除成員後已無殘留引用則回傳 null
   */
  private buildSourceSelfReferenceImport(
    options: MoveMemberOptions,
    member: MemberDefinition,
    sourceFileChange: FileChange
  ): ReferenceUpdate | null {
    // class method 被搬走後，class 內其他成員若仍以 `this.<name>()` 呼叫，補一個
    // 頂層 import 救不回語意：`this.<name>` 是實例成員存取，與模組作用域的
    // import binding 是兩回事，塞這個 import 只會產生指向不存在導出的假 import
    // （且與剩餘 class 內任何同名成員/binding 衝突遮蔽），故 method 類成員一律
    // 跳過來源檔自我引用 import 插入（見 T4 ground：此路徑在 buildSourceSelfReferenceImport
    // 對 member.type 無判斷時必然觸發，非臆測防衛）
    if (member.type === MemberType.Method) {
      return null;
    }

    // 成員搬到目標檔後若未被 export，目標檔本身就無法提供這個 binding，
    // 任何指向它的 import 都無效（見 C9 bug）；prepareTargetFileChange 只有
    // `member.modifiers` 含 'export' 時才會保留/補上 export，判定基準與其一致
    if (!member.modifiers.includes('export')) {
      return null;
    }

    // 只在真實程式碼中比對是否仍有殘留引用，排除字串常量與註解裡「提到」成員名稱
    // 的情況（見 C9 bug）。SSOT：maskNonCode（code-state-mask）保留 template
    // substitution 內的真實引用（F10：`${moved()}` 不得被整段抹掉）。
    // 識別符邊界用 createIdentifierBoundaryRegex：JS `\b` 以 ASCII `\w` 定義，
    // 純 Unicode 名稱（如 `工具`）前後皆非 `\w` 時 `\b` 不成立、會漏補 import（M1）。
    const codeOnly = maskNonCode(sourceFileChange.newCode);
    const referencePattern = createIdentifierBoundaryRegex(member.name);
    if (!referencePattern.test(codeOnly)) {
      return null;
    }

    // 新建 self-import 無「原始路徑樣式」可保留，依 C10/F8 ESM 慣例補 .js
    const relativePath = withEsmRuntimeExtension(
      this.pathUtils.calculateNewImportPath(options.sourceFile, options.target.filePath),
      options.target.filePath
    );
    const importKeyword = this.isTypeOnlyMember(member) ? 'import type' : 'import';
    const importStatement = `${importKeyword} { ${member.name} } from '${relativePath}';`;

    return {
      filePath: options.sourceFile,
      originalImport: '',
      newImport: `${importStatement}\n`,
      location: {
        filePath: options.sourceFile,
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 }
        }
      }
    };
  }

  /**
   * 掃描 require() / 動態 import() 並在路徑指向來源檔時改寫為目標檔（F30）。
   * 僅在呼叫附近確實使用到被搬成員名稱時才更新，避免誤改只載入其他 export 的 require。
   */
  private async prepareCallPathUpdates(
    content: string,
    filePath: string,
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<ReferenceUpdate[]> {
    const updates: ReferenceUpdate[] = [];
    const lines = content.split('\n');
    // 在原文上找呼叫形狀，再以 code-state mask 排除字串/註解內假 require
    // （maskNonCode 會抹掉引號，無法直接在遮罩文字上跑路徑正則）
    const callPattern = /\b(require|import)\s*\(\s*['"`][^'"`]+['"`]\s*\)/g;

    for (const match of content.matchAll(callPattern)) {
      const matchIndex = match.index ?? 0;
      if (isInsideStringOrComment(content, matchIndex)) {
        continue;
      }

      const originalCall = match[0];
      const pathMatch = originalCall.match(/['"`]([^'"`]+)['"`]/);
      if (!pathMatch) {
        continue;
      }
      const importPath = pathMatch[1];

      const resolvedImportPath = await this.pathUtils.resolveImportPathAsync(importPath, filePath);
      if (!this.pathUtils.pathsMatch(resolvedImportPath, options.sourceFile)) {
        continue;
      }

      // 呼叫所在列若未提到成員名稱，多半是載入其他 export 或 side-effect，不改路徑。
      // 同上用 Unicode 識別符邊界，避免純 Unicode 成員名被 `\b` 漏判（M2）。
      const { lineNumber, columnIndex } = this.offsetToLineColumn(content, matchIndex);
      const lineText = lines[lineNumber - 1] ?? '';
      const memberRef = createIdentifierBoundaryRegex(member.name);
      if (!memberRef.test(lineText)) {
        continue;
      }

      const newRelativePath = this.pathUtils.calculateNewImportPathPreservingStyle(
        importPath,
        filePath,
        options.sourceFile,
        options.target.filePath
      );
      const newCall = originalCall.replace(
        new RegExp(`(['"\`])${this.pathUtils.escapeRegex(importPath)}\\1`),
        `$1${newRelativePath}$1`
      );
      if (newCall === originalCall) {
        continue;
      }

      updates.push({
        filePath,
        originalImport: originalCall,
        newImport: newCall,
        location: {
          filePath,
          range: {
            start: { line: lineNumber, column: columnIndex + 1 },
            end: {
              line: lineNumber,
              column: columnIndex + originalCall.length + 1
            }
          }
        }
      });
    }

    return updates;
  }

  /** 0-based offset → 1-based line + 0-based column */
  private offsetToLineColumn(content: string, offset: number): { lineNumber: number; columnIndex: number } {
    const preceding = content.slice(0, offset);
    const lineOffset = preceding.split('\n').length - 1;
    const columnIndex = offset - (preceding.lastIndexOf('\n') + 1);
    return { lineNumber: lineOffset + 1, columnIndex };
  }

  /**
   * 判斷成員是否為僅型別存在的宣告（interface / type alias）
   * 與 createMemberReExport 共用同一判定，避免兩處各自實作條件判斷分歧
   */
  private isTypeOnlyMember(member: MemberDefinition): boolean {
    return member.type === MemberType.Interface || member.type === MemberType.TypeAlias;
  }

  /**
   * 建立保留在來源檔的 import 語句
   * 保留 default / namespace 前綴與其餘 named 成員；皆無剩餘則回傳空字串（代表整條移除）
   */
  private buildRemainingSourceImport(
    statementKind: ImportExportStatementKind,
    defaultPrefix: string | null,
    otherMembers: readonly ParsedImportMember[],
    importPath: string,
    quoteChar: string
  ): string {
    const hasNamed = otherMembers.length > 0;
    if (!defaultPrefix && !hasNamed) {
      return '';
    }

    const namedClause = hasNamed
      ? `{ ${otherMembers.map(m => this.formatImportedMember(m)).join(', ')} }`
      : '';
    const clause = defaultPrefix && hasNamed
      ? `${defaultPrefix}, ${namedClause}`
      : defaultPrefix ?? namedClause;

    return `${statementKind} ${clause} from ${quoteChar}${importPath}${quoteChar};`;
  }

  /**
   * 對 import/export 語句做 path-only 替換：只替換引號內的路徑 token，
   * 保留語句其餘所有內容（多行格式、縮排、type-only、別名）
   */
  private replaceImportPath(line: string, oldPath: string, newPath: string): string {
    const escaped = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return line.replace(
      new RegExp(`(['"\`])${escaped}\\1`),
      `$1${newPath}$1`
    );
  }

  /**
   * 建立合併後的目標 import 語句（既有成員 + 新移入成員）
   */
  private buildMergedTargetImport(
    statementKind: ImportExportStatementKind,
    members: readonly ParsedImportMember[],
    importPath: string,
    quoteChar: string,
    defaultPrefix: string | null
  ): string {
    const membersStr = members.map(m => this.formatImportedMember(m)).join(', ');
    // 既有語句帶 default / namespace 前綴（import Foo, { ... } / import * as NS, { ... }）
    // 時必須保留，否則 merge 重建會讓前綴綁定從檔案中消失
    const prefixStr = defaultPrefix ? `${defaultPrefix}, ` : '';
    return `${statementKind} ${prefixStr}{ ${membersStr} } from ${quoteChar}${importPath}${quoteChar};`;
  }

  /**
   * 在同一檔案中尋找已指向目標檔的 named import（P-E）
   * 找到時回傳該語句資訊，供把 moved 併入既有 import 而非新增重複 import
   */
  private async findExistingTargetImport(
    lines: readonly string[],
    options: MoveMemberOptions,
    fromFile: string,
    excludeStatement: ImportExportStatement
  ): Promise<{
    statement: ImportExportStatement;
    statementKind: ImportExportStatementKind;
    members: ParsedImportMember[];
    importPath: string;
    quoteChar: string;
    defaultPrefix: string | null;
  } | null> {
    // 比照 prepareReferenceUpdates 主掃描迴圈：resumeColumn 記錄同一物理行上一筆
    // 語句結束後的欄位，避免同行第二筆 import（如既有目標 import 恰與其他 import
    // 共用一行）被整行跳過而找不到可合併的既有 import。
    let i = 0;
    let resumeColumn = 0;
    while (i < lines.length) {
      const statement = collectImportExportStatement(lines, i, resumeColumn);
      if (!statement) {
        i++;
        resumeColumn = 0;
        continue;
      }
      if (statement.endColumnIndex < lines[statement.endLineIndex].length) {
        i = statement.endLineIndex;
        resumeColumn = statement.endColumnIndex;
      } else {
        i = statement.endLineIndex + 1;
        resumeColumn = 0;
      }

      // 跳過正在處理的來源語句本身
      if (statement.startLineIndex === excludeStatement.startLineIndex
        && statement.startColumnIndex === excludeStatement.startColumnIndex) {continue;}

      const importPath = this.extractImportPath(statement.text);
      if (!importPath) {continue;}

      // star re-export 不是可併入的 named import
      if (this.isStarReExport(statement.text)) {continue;}

      const resolved = await this.pathUtils.resolveImportPathAsync(importPath, fromFile);
      if (!this.pathUtils.pathsMatch(resolved, options.target.filePath)) {continue;}

      // 只有純值 import（非 import type、非 export/export-from）才產生本地值綁定，
      // 可安全併入 moved 成員；export-from 不產生本地綁定、import type 併入後值綁定會消失，
      // 兩者皆不可併入，走既有 else 路徑另建新的值 import
      const statementKind = this.getStatementKind(statement.text);
      if (statementKind !== 'import') {continue;}

      const members = this.parseImportedMembers(statement.text);
      if (members.length === 0) {continue;}

      return {
        statement,
        statementKind,
        members,
        importPath,
        quoteChar: this.detectQuoteChar(statement.text),
        defaultPrefix: this.extractDefaultPrefix(statement.text)
      };
    }

    return null;
  }

  /**
   * 解析 import 語句中的成員列表
   */
  private parseImportedMembers(line: string): ParsedImportMember[] {
    const members: ParsedImportMember[] = [];

    // 匹配 { A, B as C, D } 形式
    // 允許可選的 default / namespace 前綴（如 import Default, { ... }）
    const match = line.match(new RegExp(
      `(?:import|export)\\s+(?:type\\s+)?(?:${UNICODE_IDENTIFIER_PATTERN_SOURCE}\\s*,\\s*|\\*\\s+as\\s+${UNICODE_IDENTIFIER_PATTERN_SOURCE}\\s*,\\s*)?\\{([^}]+)\\}\\s*from`,
      'u'
    ));
    if (!match) {return members;}

    const membersStr = match[1];
    const memberParts = membersStr.split(',');

    for (const part of memberParts) {
      const trimmed = part.trim();
      if (!trimmed) {continue;}
      const typeOnly = trimmed.startsWith('type ');
      const memberText = typeOnly ? trimmed.slice('type '.length).trim() : trimmed;

      // 檢查是否有別名 (name as alias)
      const aliasMatch = memberText.match(new RegExp(
        `^(${UNICODE_IDENTIFIER_PATTERN_SOURCE})\\s+as\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})$`,
        'u'
      ));
      if (aliasMatch) {
        members.push({ name: aliasMatch[1], alias: aliasMatch[2], typeOnly });
      } else {
        members.push({ name: memberText, typeOnly });
      }
    }

    return members;
  }

  /**
   * 取得純 namespace import 的本地 binding 名稱。
   * `import * as source from './source'` 沒有 named specifier，不能交給
   * parseImportedMembers 處理。
   */
  private extractNamespaceImport(line: string): string | null {
    const match = line.match(
      /^\s*import\s+\*\s+as\s+([\p{ID_Start}_$][\p{ID_Continue}$]*)\s+from\s+['"`]/u
    );
    return match?.[1] ?? null;
  }

  /**
   * 判斷 namespace import 對來源成員的使用形狀。
   * 若還有其他 property 存取，不能只改 import path，否則會把那些仍留在來源檔的
   * exports 一起切斷；目前沒有安全的單一 import 替換可保留兩邊 namespace。
   */
  private getNamespaceMemberUsage(
    content: string,
    statement: ImportExportStatement,
    namespaceName: string,
    memberName: string
  ): NamespaceMemberUsage {
    const lines = content.split('\n');
    const codeWithoutImport = lines
      .slice(0, statement.startLineIndex)
      .concat(lines.slice(statement.endLineIndex + 1))
      .join('\n');
    const code = maskNonCode(codeWithoutImport);
    const escapedNamespace = this.pathUtils.escapeRegex(namespaceName);
    const propertyPattern = new RegExp(
      `(?<![.\\p{ID_Continue}$])${escapedNamespace}\\s*\\.\\s*([\\p{ID_Start}_$][\\p{ID_Continue}$]*)`,
      'gu'
    );
    const properties = [...code.matchAll(propertyPattern)].map(match => match[1]);
    const namespaceReferencePattern = new RegExp(
      `(?<![.\\p{ID_Continue}$])${escapedNamespace}(?![\\p{ID_Continue}$])`,
      'gu'
    );
    const referenceCount = [...code.matchAll(namespaceReferencePattern)].length;

    if (referenceCount === 0) {return 'none';}
    if (properties.length !== referenceCount) {return 'mixed';}
    return properties.every(property => property === memberName) ? 'moved-only' : 'mixed';
  }

  /**
   * 提取 import 語句中位於 named import 子句之前的 default / namespace 前綴
   * 如 `import defaultThing, { moved } from '...'` → `defaultThing`
   *    `import * as NS, { moved } from '...'`      → `* as NS`
   * 無前綴時回傳 null
   */
  private extractDefaultPrefix(line: string): string | null {
    const match = line.match(new RegExp(
      `(?:import|export)\\s+(?:type\\s+)?(${UNICODE_IDENTIFIER_PATTERN_SOURCE}|\\*\\s+as\\s+${UNICODE_IDENTIFIER_PATTERN_SOURCE})\\s*,\\s*\\{`,
      'u'
    ));
    return match ? match[1].trim() : null;
  }

  /**
   * 判斷是否為星號 re-export（`export * from '...'`），含具名 namespace 別名形式
   * （`export * as ns from '...'`）。原本只認得無別名形式，`export * as ns from`
   * 完全落不進任何分支（parseImportedMembers 需要 `{}` 具名區塊而不比對、
   * extractNamespaceImport 只認 `import` 不認 `export`），導致整條語句被略過、
   * 從未被視為需要處理的 barrel re-export，讓 `ns.movedMember` 的消費者在
   * 成員搬出 source 後失去引用（見缺陷：namespace re-export 完全未被辨識）。
   * 兩種形式命中後走同一分支，在星號 re-export 上方插入針對搬移成員的具名
   * `export { member } from '<target>'`，讓直接具名存取（`import { member }
   * from './barrel'`）維持可用；`ns.movedMember` 這種屬性存取形式跨檔案追蹤
   * namespace 綁定鏈屬於更大範圍的功能（rename 模組已有的 forward-chain
   * 解析），非本次修復範圍。
   */
  private isStarReExport(line: string): boolean {
    return new RegExp(
      `^\\s*export\\s+\\*(?:\\s+as\\s+${UNICODE_IDENTIFIER_PATTERN_SOURCE})?\\s+from\\s+['"\`]`,
      'u'
    ).test(line);
  }

  private createMemberReExport(member: MemberDefinition, importPath: string, quoteChar: string): string {
    const statementKind = this.isTypeOnlyMember(member) ? 'export type' : 'export';

    return `${statementKind} { ${member.name} } from ${quoteChar}${importPath}${quoteChar};`;
  }

  private formatImportedMember(member: ParsedImportMember): string {
    const memberText = member.alias ? `${member.name} as ${member.alias}` : member.name;
    return member.typeOnly ? `type ${memberText}` : memberText;
  }

  private getStatementKind(line: string): ImportExportStatementKind {
    const trimmed = line.trim();
    if (trimmed.startsWith('export type ')) {
      return 'export type';
    }
    if (trimmed.startsWith('export ')) {
      return 'export';
    }
    if (trimmed.startsWith('import type ')) {
      return 'import type';
    }
    return 'import';
  }

  /**
   * 檢測 import 語句使用的引號類型
   */
  private detectQuoteChar(line: string): string {
    if (line.includes('\'')) {return '\'';}
    if (line.includes('"')) {return '"';}
    return '\'';
  }

  /**
   * 從 import/export 語句中提取路徑
   */
  private extractImportPath(line: string): string | null {
    const trimmed = line.trim();

    // 檢查是否是 import/export 語句
    if (!trimmed.startsWith('import ') && !(trimmed.startsWith('export ') && trimmed.includes('from'))) {
      return null;
    }

    // 提取引號內的路徑
    const match = line.match(/from\s+['"`]([^'"`]+)['"`]/);
    if (!match) {
      // 嘗試匹配 import 'path' 形式
      const directImport = line.match(/import\s+['"`]([^'"`]+)['"`]/);
      return directImport ? directImport[1] : null;
    }
    return match[1];
  }

  /**
   * 取得專案檔案
   */
  private async getProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];
    await this.collectFiles(projectRoot, files);
    return files;
  }

  /**
   * 遞迴收集檔案
   */
  private async collectFiles(dirPath: string, files: string[]): Promise<void> {
    const entries = await this.fileSystem.readDirectory(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 跳過 node_modules、build 輸出目錄和隱藏目錄
      const skipDirs = ['node_modules', 'dist', 'build', 'coverage', '.git'];
      if (skipDirs.includes(entry.name) || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory) {
        await this.collectFiles(fullPath, files);
      } else if (entry.isFile && this.isSupportedFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  /**
   * 檢查是否為支援的檔案類型
   */
  private isSupportedFile(filename: string): boolean {
    return SOURCE_FILE_EXTENSIONS.some(ext => filename.endsWith(ext));
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch (error) {
      diagnostics.warn('move-member/reference-updater', 'FILE_READ_ERROR', `Failed to read file: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return null;
    }
  }
}
