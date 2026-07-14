/**
 * Reference Updater
 * 負責掃描和更新引用（import 語句）
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { MemberType, type MemberDefinition, type ReferenceUpdate, type MoveMemberOptions, type FileChange } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';
import { UNICODE_IDENTIFIER_PATTERN_SOURCE } from './utils/identifier-pattern.js';
import { isInsideStringOrComment } from './utils/source-text.js';

/**
 * Reference Updater 的路徑解析設定（tsconfig paths + baseUrl）
 * pathAliases 期望已解析為絕對路徑（見 tsconfig-loader）
 */
export interface ReferenceUpdaterPathConfig {
  readonly pathAliases?: Record<string, string>;
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

interface ImportExportStatement {
  readonly text: string;
  readonly startLineIndex: number;
  readonly endLineIndex: number;
}

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
      })
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

      // 掃描每一行找 import 語句
      for (let i = 0; i < lines.length; i++) {
        const statement = this.collectImportExportStatement(lines, i);
        if (!statement) {continue;}

        const statementOffset = lines
          .slice(0, statement.startLineIndex)
          .reduce((offset, sourceLine) => offset + sourceLine.length + 1, 0);
        if (isInsideStringOrComment(content, statementOffset)) {
          continue;
        }

        i = statement.endLineIndex;
        const line = statement.text;

        // 檢查是否是 import 語句且包含成員名稱和來源路徑
        const importPathMatch = this.extractImportPath(line);
        if (!importPathMatch) {continue;}

        // 解析 import 路徑為絕對路徑並比較（PathUtils 支援任意 tsconfig 別名 / baseUrl）
        const resolvedImportPath = this.pathUtils.resolveImportPath(importPathMatch, filePath);

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
            location: {
              filePath,
              range: {
                start: { line: statement.startLineIndex + 1, column: 1 },
                end: {
                  line: statement.endLineIndex + 1,
                  column: lines[statement.endLineIndex].length + 1
                }
              }
            }
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
              location: this.createStatementLocation(filePath, statement, lines)
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
          : this.findExistingTargetImport(lines, options, filePath, statement);

        const sourceLocation = this.createStatementLocation(filePath, statement, lines);

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
            location: this.createStatementLocation(filePath, existingTargetImport.statement, lines)
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
    // 的情況（見 C9 bug：整檔 raw word regex 誤把字串內容當成真實引用）
    const codeOnly = this.stripStringsAndComments(sourceFileChange.newCode);
    const referencePattern = new RegExp(`\\b${this.pathUtils.escapeRegex(member.name)}\\b`);
    if (!referencePattern.test(codeOnly)) {
      return null;
    }

    const relativePath = this.pathUtils.calculateNewImportPath(options.sourceFile, options.target.filePath);
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
   * 移除字串常量與註解內容，只留下可能構成真實引用的程式碼本體
   * 供 buildSourceSelfReferenceImport 判斷殘留引用時排除「字串/註解裡提到成員名稱」
   * 的誤判（見 C9 bug）。regex-based 近似（非完整 tokenizer），與本檔其餘以正則
   * 掃描 import/export 語句的既有作法一致
   */
  private stripStringsAndComments(code: string): string {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
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
  private findExistingTargetImport(
    lines: readonly string[],
    options: MoveMemberOptions,
    fromFile: string,
    excludeStatement: ImportExportStatement
  ): {
    statement: ImportExportStatement;
    statementKind: ImportExportStatementKind;
    members: ParsedImportMember[];
    importPath: string;
    quoteChar: string;
    defaultPrefix: string | null;
  } | null {
    for (let i = 0; i < lines.length; i++) {
      const statement = this.collectImportExportStatement(lines, i);
      if (!statement) {continue;}
      i = statement.endLineIndex;

      // 跳過正在處理的來源語句本身
      if (statement.startLineIndex === excludeStatement.startLineIndex) {continue;}

      const importPath = this.extractImportPath(statement.text);
      if (!importPath) {continue;}

      // star re-export 不是可併入的 named import
      if (this.isStarReExport(statement.text)) {continue;}

      const resolved = this.pathUtils.resolveImportPath(importPath, fromFile);
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
   * 由 import/export 語句建立 ReferenceUpdate 的 location 範圍
   */
  private createStatementLocation(
    filePath: string,
    statement: ImportExportStatement,
    lines: readonly string[]
  ): ReferenceUpdate['location'] {
    return {
      filePath,
      range: {
        start: { line: statement.startLineIndex + 1, column: 1 },
        end: {
          line: statement.endLineIndex + 1,
          column: lines[statement.endLineIndex].length + 1
        }
      }
    };
  }

  private collectImportExportStatement(
    lines: readonly string[],
    startLineIndex: number
  ): ImportExportStatement | null {
    const startLine = lines[startLineIndex];
    const trimmedStart = startLine.trim();
    if (!trimmedStart.startsWith('import ') && !trimmedStart.startsWith('export ')) {
      return null;
    }

    let text = startLine;
    if (this.extractImportPath(text)) {
      return { text, startLineIndex, endLineIndex: startLineIndex };
    }

    // 起始行本身已是完整語句（含 ';'）卻取不到路徑 → 這是與 import/export-from
    // 無關的完整語句（如無 from 的 `export { x };`），不得繼續吸收下一行造成跨語句融合
    if (text.includes(';')) {
      return null;
    }

    for (let endLineIndex = startLineIndex + 1; endLineIndex < lines.length; endLineIndex++) {
      text += `\n${lines[endLineIndex]}`;
      if (this.extractImportPath(text)) {
        return { text, startLineIndex, endLineIndex };
      }

      // 累積文字已終止（含 ';'）仍未取得路徑 → 語句已結束但不是我們要處理的
      // import/export-from，終止延續，禁止再吸收下一條無關語句
      if (text.includes(';')) {
        return null;
      }
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
    const code = this.stripStringsAndComments(codeWithoutImport);
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

  private isStarReExport(line: string): boolean {
    return /^\s*export\s+\*\s+from\s+['"`]/.test(line);
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
