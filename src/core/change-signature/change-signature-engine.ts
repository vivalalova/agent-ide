/**
 * Change Signature Engine
 * 參數重構核心引擎
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset, TextEdit } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType } from '@infrastructure/changeset/index.js';
import { SignatureParser } from './signature-parser.js';
import { SignatureValidator } from './signature-validator.js';
import { SignatureTransformer } from './signature-transformer.js';
import { CallSiteUpdater } from './call-site-updater.js';
import type {
  ChangeSignatureOptions,
  ChangeSignatureResult,
  FunctionSignature,
  ParameterDefinition,
  CallSiteUpdate,
  SignatureChange
} from './types.js';
import {
  ChangeSignatureErrorCode,
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange
} from './types.js';
import { SymbolFinder, FileUtils, createFileUtils } from '@core/foundations/index.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';
import { createFunctionDeclarationLocator, type FunctionDeclarationLocator } from './function-declaration-locator.js';
import { createParameterReferenceScanner, type ParameterReferenceScanner } from './parameter-reference-scanner.js';
import { createDefinitionUpdater, type DefinitionUpdater } from './definition-updater.js';
import { createCallSiteBindingResolver, type CallSiteBindingResolver } from './call-site-binding-resolver.js';

/** tsconfig 路徑解析設定（pathAliases 期望已解析為絕對路徑，見 tsconfig-loader） */
export interface ChangeSignaturePathConfig {
  readonly pathAliases?: PathAliasInput;
  readonly baseUrl?: string;
}

/**
 * Change Signature Engine
 */
export class ChangeSignatureEngine {
  private readonly fileUtils: FileUtils;
  private readonly signatureParser: SignatureParser;
  private readonly symbolFinder: SymbolFinder;
  private readonly validator: SignatureValidator;
  private readonly transformer: SignatureTransformer;
  private readonly callSiteUpdater: CallSiteUpdater;
  private readonly pathUtils: PathUtils;
  private readonly functionLocator: FunctionDeclarationLocator;
  private readonly scanner: ParameterReferenceScanner;
  private readonly definitionUpdater: DefinitionUpdater;
  private readonly bindingResolver: CallSiteBindingResolver;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    pathConfig?: ChangeSignaturePathConfig
  ) {
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
    this.signatureParser = new SignatureParser(parserRegistry, fileSystem);
    this.symbolFinder = new SymbolFinder(parserRegistry, fileSystem);
    this.validator = new SignatureValidator();
    this.transformer = new SignatureTransformer();
    this.callSiteUpdater = new CallSiteUpdater(fileSystem, parserRegistry);
    // 重用 file-move 的 PathUtils 解析 import specifier（相對路徑、tsconfig paths 別名、
    // baseUrl、index 檔慣例），與 move / move-member 同一把尺（Single Source of Truth）
    this.pathUtils = new PathUtils(
      new ImportResolver({
        pathAliases: pathConfig?.pathAliases ?? {},
        baseUrl: pathConfig?.baseUrl,
        supportedExtensions: ALLOWED_EXTENSIONS
      }),
      fileSystem
    );
    this.functionLocator = createFunctionDeclarationLocator(this.fileUtils);
    this.scanner = createParameterReferenceScanner(this.fileUtils, this.transformer, this.functionLocator);
    this.definitionUpdater = createDefinitionUpdater(this.fileUtils, this.functionLocator);
    this.bindingResolver = createCallSiteBindingResolver(
      this.parserRegistry,
      this.fileUtils,
      this.pathUtils,
      this.symbolFinder
    );
  }

  /**
   * 執行 Change Signature
   */
  async changeSignature(options: ChangeSignatureOptions): Promise<ChangeSignatureResult> {
    // 1. 解析原始簽名
    const originalSignature = await this.signatureParser.parseSignature(
      options.filePath,
      options.functionName
    );

    if (!originalSignature) {
      return this.createErrorResult(
        ChangeSignatureErrorCode.FunctionNotFound,
        `找不到函式: ${options.functionName}`
      );
    }

    // 1b. overload 簽章群偵測（T3）：同 scope 有多個同名 function-like 宣告且含無 body 的
    // overload 簽章時，任何簽章變更只會命中其中一個宣告（findFunctionNode 前序取第一個），
    // 且 reorder/add 對各異參數列的 overload 群語意不明確 → 偵測即拒絕，不做「聰明地」全群改寫。
    // 偵測邏輯放定位層，不改共用 findFunctionNode 的回傳語意（deadcode 亦依賴之），防跨模組回歸。
    const overloadDeclarationLines = await this.functionLocator.detectOverloadSignatureGroup(originalSignature);
    if (overloadDeclarationLines) {
      const positions = overloadDeclarationLines
        .map(line => `${originalSignature.location.filePath}:${line}`)
        .join(', ');
      return this.createErrorResult(
        ChangeSignatureErrorCode.OverloadSignatureGroup,
        `不支援 overload 簽章群的簽章變更：${options.functionName} 有 ${overloadDeclarationLines.length} 個同名宣告（${positions}）`
      );
    }

    // 2. 驗證變更
    const validationErrors = this.validator.validateChanges(originalSignature, options.changes);
    if (validationErrors.length > 0) {
      return this.createErrorResult(
        validationErrors[0].code,
        validationErrors[0].message
      );
    }

    const removedParameterUsageError = await this.scanner.validateRemovedParameterBodyReferences(originalSignature, options.changes);
    if (removedParameterUsageError) {
      return this.createErrorResult(
        ChangeSignatureErrorCode.RequiredParameterInUse,
        removedParameterUsageError
      );
    }

    // 2a. --add 預設值若引用同函式其他參數、且呼叫點值未經 --call-site-value 明確指定，
    // 該預設值運算式文字會逐字塞進每個呼叫點（CallSiteUpdater 對 add 的呼叫點填值即取
    // callSiteValue ?? defaultValue），呼叫端並無同名區域繫結 → 產生的引數是懸空識別字
    // （TS2304）。及早 fast-fail，不修改任何檔案。
    const ambiguousDefaultValueError = this.scanner.validateAddParameterCallSiteSafety(originalSignature, options.changes);
    if (ambiguousDefaultValueError) {
      return this.createErrorResult(
        ambiguousDefaultValueError.code,
        ambiguousDefaultValueError.message
      );
    }

    // 2b. 參數 rename 時，先於 transform 前修正其他參數預設值字串中對該參數的引用
    // （AST 位置改寫，見 rewriteOtherParameterDefaultsForRename），讓後續由結構欄位
    // 重建的定義文字天然帶有正確引用，避免另外產生會與定義區塊整體重寫互相重疊的 text edit。
    const signatureForTransform = await this.scanner.rewriteOtherParameterDefaultsForRename(originalSignature, options.changes);

    // 3. 計算新簽名
    const newSignature = this.transformer.applyChangesToSignature(signatureForTransform, options.changes);

    // 3b. 驗證變更後的最終參數順序：rest 參數必須位於最後。此檢查作用於 transformer
    // 算出的最終列表，無論觸發原因是 reorder、add 或其他變更組合皆一併涵蓋，不需在
    // 各變更類型分支各自模擬一套順序邏輯（Single Source of Truth：與 transformer 同一份計算）。
    const restOrderError = this.validator.validateRestParameterIsLast(newSignature.parameters);
    if (restOrderError) {
      return this.createErrorResult(restOrderError.code, restOrderError.message);
    }

    // 4. 取得所有呼叫點
    // 純 rename / change-type（不含 add/remove/reorder）不改變呼叫點的參數映射，
    // 對呼叫點而言語意等價 → 跳過掃描與重寫，避免產生純重新排版（如 `fn(a,b)` -> `fn(a, b)`）的噪音 diff。
    const requiresCallSiteRewrite = this.changesRequireCallSiteRewrite(options.changes);
    let callSites: CallSite[] = [];

    if (requiresCallSiteRewrite) {
      // 當檔案路徑是絕對路徑且不在 projectRoot 內時，自動推斷 projectRoot
      let effectiveProjectRoot = options.projectRoot;
      // 邊界比對須含路徑分隔符，避免 /repo/src-gen 誤判為 /repo/src 的子路徑
      const isFilePathWithinRoot = options.filePath === effectiveProjectRoot
        || options.filePath.startsWith(effectiveProjectRoot + path.sep);
      if (path.isAbsolute(options.filePath) && !isFilePathWithinRoot) {
        effectiveProjectRoot = path.dirname(options.filePath);
        // 嘗試向上找到 package.json 所在目錄
        let searchDir = effectiveProjectRoot;
        while (searchDir !== path.dirname(searchDir)) {
          const packageJsonPath = path.join(searchDir, 'package.json');
          try {
            const exists = await this.fileSystem.exists(packageJsonPath);
            if (exists) {
              effectiveProjectRoot = searchDir;
              break;
            }
          } catch {
            // graceful-degradation: 無法存取此目錄的 package.json，繼續向上搜索
          }
          searchDir = path.dirname(searchDir);
        }
      }

      const projectFiles = options.targetFiles ?? await this.bindingResolver.getProjectFiles(effectiveProjectRoot);

      // T2：constructor 目標的呼叫點是 `new ClassName(...)`（NewExpression），以「類別名」定位，
      // 與一般函式的名稱比對同保真度；非 constructor 目標維持以函式名定位一般呼叫點。
      const constructorClassName = (originalSignature.name === 'constructor' && originalSignature.className)
        ? originalSignature.className
        : undefined;
      const isConstructorTarget = constructorClassName !== undefined;
      const searchName = constructorClassName ?? options.functionName;

      // 限縮呼叫點掃描範圍：僅「語意上可能引用目標」的檔案。逐檔解析出目標符號的本地繫結
      // （named／alias／default import 的本地名、namespace import 的 receiver，以及遞迴 barrel
      // re-export 轉發），避免全專案掃同名而誤改跨檔同名符號。
      const bindings = await this.bindingResolver.resolveTargetBindings(
        projectFiles,
        options.filePath,
        searchName
      );

      if (isConstructorTarget || originalSignature.isMethod) {
        // constructor／method 目標維持既有「以目標名全域掃描 + 型別安全性拒絕」路徑：
        // 僅取「以本地名 === 目標名」繫結的檔案（不含 alias／namespace），與舊行為對齊。
        const relevantFiles = [...bindings.keys()].filter(
          file => bindings.get(file)?.localNames.has(searchName)
        );
        // constructor 目標才 opt-in 掃描 new-expression，避免變更其他消費端（如 call-hierarchy）行為。
        const allCallSites = await this.symbolFinder.findCallSites(
          searchName,
          relevantFiles,
          { includeNewExpressions: isConstructorTarget }
        );

        if (isConstructorTarget) {
          // `new ns.ClassName(...)`（帶 receiver）需型別解析才能確認指向同一類別，無此基礎設施 → 拒絕。
          const qualifiedNewCallSites = allCallSites.filter(cs => cs.isNewExpression && cs.isMethodCall);
          if (qualifiedNewCallSites.length > 0) {
            return this.createErrorResult(
              ChangeSignatureErrorCode.MethodCallSiteUnsupported,
              `偵測到 ${qualifiedNewCallSites.length} 個限定式建構子呼叫點（new receiver.Class(...)），` +
              `無型別解析無法安全重寫：${this.formatCallSitePositions(qualifiedNewCallSites)}`
            );
          }
          callSites = allCallSites.filter(cs => cs.isNewExpression === true && !cs.isMethodCall);
        } else {
          // T1：目標「本身是 class 方法」時，同名的方法呼叫點（`calc.add(1, 2)`）確為對目標的引用，
          // 但重寫需 receiver 型別解析才能避免把無關類別的同名方法（各種 `.add()`）一起改壞；本工具
          // 無型別解析基礎設施。故偵測到即拒絕，不再靜默丟棄——靜默丟棄會造成定義改了、方法呼叫點
          // 沒動的毀損（success:true 但呼叫端停在舊引數順序）。
          const methodCallSites = allCallSites.filter(cs => cs.isMethodCall);
          if (methodCallSites.length > 0) {
            return this.createErrorResult(
              ChangeSignatureErrorCode.MethodCallSiteUnsupported,
              `偵測到 ${methodCallSites.length} 個方法呼叫點，方法呼叫點重寫不受支援（需 receiver 型別解析）：` +
              `${this.formatCallSitePositions(methodCallSites)}`
            );
          }
          callSites = allCallSites.filter(cs => !cs.isMethodCall);
        }
      } else {
        // 目標是頂層函數／變數函數：逐檔以「該檔實際繫結目標的本地名」定位呼叫點——
        // 直接／具名／別名 import 以本地識別字呼叫（`combine(...)`、別名 `merge(...)`），
        // namespace import 以 `<receiver>.<functionName>(...)` 呼叫。以本地名精確比對，
        // 天然排除無關同名符號（不需再靠 method-call 全域過濾，該過濾會誤殺 namespace 呼叫）。
        callSites = await this.bindingResolver.collectTopLevelFunctionCallSites(bindings, options.functionName);
      }

      // 呼叫點含 spread 引數（如 `f(...values)`）時，CallSiteUpdater 依「定位索引」重新映射
      // 引數（add/remove/reorder 皆會改變定位映射，見 changesRequireCallSiteRewrite），但單一
      // spread 引數在原始碼中只佔一個 AST 引數位置、實際可能展開對應多個宣告參數，其真正數量
      // 與內容只能在執行期得知，無法靜態決定要搬到哪個新位置——連「只在尾端新增參數」也一樣會壞
      // （spread 涵蓋不到的後續必要參數位置會被誤判成「省略」而補 undefined，見 call-site-updater
      // mapCallSiteArguments 對 `param.optional || param.defaultValue !== undefined` 的省略判斷）。
      // 純 rename／change-type 不需要呼叫點重寫（見 changesRequireCallSiteRewrite），不會走到此檢查。
      const spreadCallSiteError = this.findSpreadCallSiteError(callSites);
      if (spreadCallSiteError) {
        return this.createErrorResult(
          ChangeSignatureErrorCode.SpreadArgumentCallSite,
          spreadCallSiteError
        );
      }
    }

    // 5. 生成定義更新
    const definitionUpdate = await this.definitionUpdater.generateDefinitionUpdate(
      options.filePath,
      originalSignature,
      newSignature
    );

    // 6. 生成呼叫點更新
    const callSiteUpdates = requiresCallSiteRewrite
      ? await this.callSiteUpdater.generateCallSiteUpdates(
        callSites,
        originalSignature,
        newSignature,
        options.changes
      )
      : [];

    // 7. 計算影響的檔案
    const affectedFiles = new Set<string>();
    affectedFiles.add(definitionUpdate.filePath);
    for (const update of callSiteUpdates) {
      affectedFiles.add(update.filePath);
    }

    return {
      success: true,
      originalSignature,
      newSignature,
      definitionUpdate,
      callSiteUpdates,
      // 本方法從不直接寫入檔案：實際寫入統一經由 generateChangeset() 產生的
      // Changeset + ChangeApplicator 完成（見 CLI 呼叫路徑），故恆為 false。
      executed: false,
      stats: {
        callSitesUpdated: callSiteUpdates.length,
        filesAffected: affectedFiles.size
      }
    };
  }

  /**
   * 生成參數簽名變更的 Changeset
   * 使用 preview 模式收集變更，轉換為統一的 Changeset 格式
   *
   * @param options - 變更選項（強制使用 preview 模式）
   * @returns Changeset 物件
   */
  async generateChangeset(options: ChangeSignatureOptions): Promise<Changeset> {
    const builder = createChangesetBuilder().forCommand(ChangesetCommand.ChangeSignature);

    // 使用現有邏輯（preview 模式）收集變更
    const result = await this.changeSignature({
      ...options,
      preview: true
    });

    if (!result.success) {
      return builder
        .addError(result.error ?? 'Change signature failed')
        .withDescription(result.error ?? 'Change signature failed')
        .build();
    }

    // 轉換 definitionUpdate
    const { filePath, originalCode, newCode, location } = result.definitionUpdate;

    if (!this.areParametersEquivalent(
      result.originalSignature.parameters,
      result.newSignature.parameters
    )) {
      builder.addTextChange(filePath, [{
        range: {
          start: location.range.start,
          end: location.range.end
        },
        newText: newCode,
        description: `Update definition: ${originalCode.trim()} -> ${newCode.trim()}`
      }], TextEditOperationType.Modify);
    }

    const parameterRenameEdits = await this.scanner.generateParameterRenameBodyEdits(
      result.originalSignature,
      options.changes
    );
    if (parameterRenameEdits.length > 0) {
      builder.addTextChange(filePath, parameterRenameEdits, TextEditOperationType.Modify);
    }

    // 轉換 callSiteUpdates
    // 按檔案分組，合併同一檔案的多個變更
    const updatesByFile = new Map<string, CallSiteUpdate[]>();
    for (const update of result.callSiteUpdates) {
      const existing = updatesByFile.get(update.filePath);
      if (existing) {
        existing.push(update);
      } else {
        updatesByFile.set(update.filePath, [update]);
      }
    }

    for (const [updateFilePath, updates] of updatesByFile) {
      const effectiveUpdates = updates.filter(update => update.originalCode !== update.newCode);
      if (effectiveUpdates.length === 0) {
        continue;
      }

      // 跳過與 definitionUpdate 同一檔案（避免重複）
      // 已經在上面處理過了，呼叫點和定義可能在同一行
      const edits = effectiveUpdates.map(update => this.createCallSiteTextEdit(update));

      builder.addTextChange(updateFilePath, edits, TextEditOperationType.Modify);
    }

    // 設定描述
    const originalParams = result.originalSignature.parameters.map(p => p.name).join(', ');
    const newParams = result.newSignature.parameters.map(p => p.name).join(', ');
    builder.withDescription(
      `Changed signature of ${result.originalSignature.name}: (${originalParams}) -> (${newParams})`
    );

    return builder.build();
  }

  private createCallSiteTextEdit(update: CallSiteUpdate): TextEdit {
    // 直接使用呼叫點的精確範圍（函式名第一個字元到右括號之後），
    // newText 為重建後的呼叫運算式。如此同一行的不同呼叫會產生互不重疊的 edit。
    return {
      range: {
        start: update.location.range.start,
        end: update.location.range.end
      },
      newText: update.newCode,
      description: `Update call: ${update.originalCode.trim()} -> ${update.newCode.trim()}`
    };
  }

  /**
   * 檢查呼叫點清單中是否有引數為 spread element（如 `...values`）。
   * 只需文字前綴判斷：CallSiteArgument.value 是引數節點的原始原始碼文字（見
   * call-site-parser.ts extractArguments／parseArgumentsMultiline），
   * `...` 只會出現在 spread/rest 引數的開頭，不會是其他合法運算式文字的前三個字元
   * （optional chaining 是 `?.`，字串/樣板字面量以引號開頭），故無誤判風險。
   * 回傳第一個命中的呼叫點對應的錯誤訊息；無命中回傳 null。
   */
  private findSpreadCallSiteError(callSites: readonly CallSite[]): string | null {
    for (const callSite of callSites) {
      const hasSpreadArgument = callSite.arguments.some(arg => arg.value.startsWith('...'));
      if (hasSpreadArgument) {
        return `呼叫點 ${callSite.functionName}(...) 於 ${callSite.location.filePath}:${callSite.location.range.start.line} 含 spread 引數，` +
          '無法靜態重新映射定位引數，change-signature 的新增/移除/重排參數操作已中止';
      }
    }
    return null;
  }

  /**
   * 判斷變更集合是否需要重寫呼叫點。
   * 呼叫點的參數映射（順序/數量）只受 Add/Remove/Reorder 影響（見 CallSiteUpdater.createParameterMapping）；
   * 純 rename、change-type（或兩者組合）不改變呼叫點的引數順序或數量，跳過呼叫點掃描與重寫。
   * 混合變更（如 rename + reorder）因含 Reorder 仍會回傳 true。
   */
  private changesRequireCallSiteRewrite(changes: readonly SignatureChange[]): boolean {
    return changes.some(change =>
      isAddParameterChange(change) || isRemoveParameterChange(change) || isReorderParametersChange(change)
    );
  }

  private areParametersEquivalent(
    left: readonly ParameterDefinition[],
    right: readonly ParameterDefinition[]
  ): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((parameter, index) => {
      const other = right[index];
      return parameter.name === other.name &&
        parameter.type === other.type &&
        parameter.defaultValue === other.defaultValue &&
        parameter.optional === other.optional &&
        parameter.rest === other.rest;
    });
  }

  /** 將呼叫點清單格式化為 `filePath:line` 的逗號分隔字串（供拒絕訊息列位置） */
  private formatCallSitePositions(callSites: readonly CallSite[]): string {
    return callSites
      .map(cs => `${cs.location.filePath}:${cs.location.range.start.line}`)
      .join(', ');
  }

  /**
   * 建立錯誤結果
   */
  private createErrorResult(_code: ChangeSignatureErrorCode, message: string): ChangeSignatureResult {
    // 錯誤情況下必須提供佔位簽名資訊
    const emptyRange = { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } };
    const emptyLocation = { filePath: '', range: emptyRange };
    const emptySignature: FunctionSignature = {
      name: '',
      parameters: [],
      location: emptyLocation,
      isMethod: false,
      modifiers: []
    };
    return {
      success: false,
      error: message,
      originalSignature: emptySignature,
      newSignature: emptySignature,
      definitionUpdate: { filePath: '', originalCode: '', newCode: '', location: emptyLocation },
      callSiteUpdates: [],
      executed: false,
      stats: {
        callSitesUpdated: 0,
        filesAffected: 0
      }
    };
  }
}

/**
 * 建立 ChangeSignatureEngine 實例
 */
export function createChangeSignatureEngine(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): ChangeSignatureEngine {
  return new ChangeSignatureEngine(parserRegistry, fileSystem);
}
