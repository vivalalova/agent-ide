/**
 * Call Site Updater
 * 負責呼叫點更新相關邏輯
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type {
  FunctionSignature,
  SignatureChange,
  CallSiteUpdate
} from './types.js';
import {
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange
} from './types.js';
import { resolveParameterIndex, OMITTED_PARAMETER_MARKER } from './utils.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import { FileUtils, createFileUtils } from '@core/foundations/index.js';
import type { Range } from '@shared/types/core.js';
import { isPositionBefore } from '@shared/types/core.js';

/**
 * 呼叫風格資訊
 */
interface CallStyle {
  /** 是否為多行呼叫 */
  readonly multiline: boolean;
  /** 縮排字串 */
  readonly indent: string;
  /** 是否有尾隨逗號 */
  readonly trailingComma: boolean;
}

/**
 * 參數映射資訊
 */
interface ParameterMappingInfo {
  /** 新的索引位置 */
  readonly newIndex: number;
  /** 預設值（新增參數時使用） */
  readonly value?: string;
}

/**
 * Call Site Updater
 * 處理呼叫點的參數更新
 */
export class CallSiteUpdater {
  private readonly fileUtils: FileUtils;

  constructor(
    fileSystem: IFileSystem,
    parserRegistry: ParserRegistry
  ) {
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
  }

  /**
   * 生成呼叫點更新
   * 效能優化：按檔案分組後批次讀取，避免重複讀取同一檔案
   * 檔案讀取次數從 O(N) 降到 O(M)，N = callSites 數量，M = 不重複檔案數
   * 支援多行呼叫點：正確處理跨多行的函式呼叫
   */
  async generateCallSiteUpdates(
    callSites: readonly CallSite[],
    originalSignature: FunctionSignature,
    newSignature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): Promise<CallSiteUpdate[]> {
    const updates: CallSiteUpdate[] = [];

    // 建立參數映射
    const parameterMapping = this.createParameterMapping(originalSignature, newSignature, changes);

    // 按檔案分組 callSites，避免重複讀取同一檔案
    const callSitesByFile = new Map<string, CallSite[]>();
    for (const callSite of callSites) {
      const filePath = callSite.location.filePath;
      const existing = callSitesByFile.get(filePath);
      if (existing) {
        existing.push(callSite);
      } else {
        callSitesByFile.set(filePath, [callSite]);
      }
    }

    // 批次讀取所有不重複的檔案並處理
    for (const [filePath, fileCallSites] of callSitesByFile) {
      const content = await this.fileUtils.readFile(filePath);
      if (!content) { continue; }

      const lines = content.split('\n');

      // 巢狀呼叫處理：偵測同檔案內呼叫點的範圍包含關係。
      // 由內而外（先處理被包含的呼叫）重建每個呼叫的新呼叫運算式文字，
      // 讓外層呼叫在重建引數時可直接嵌入內層已重排後的文字。
      // 僅對最外層（未被任何其他目標呼叫包含）的呼叫發出 edit，避免重疊的 edit 互撞。
      const ordered = this.orderByContainment(fileCallSites);
      const rebuiltByCallSite = new Map<CallSite, string>();

      for (const callSite of ordered) {
        const rebuilt = this.rebuildCallExpression(
          callSite,
          lines,
          parameterMapping,
          changes,
          originalSignature,
          fileCallSites,
          rebuiltByCallSite
        );
        rebuiltByCallSite.set(callSite, rebuilt);
      }

      for (const callSite of fileCallSites) {
        // 被其他目標呼叫包含的內層呼叫不另外發 edit（已併入外層 newText）
        if (this.isContainedByOther(callSite, fileCallSites)) {
          continue;
        }

        const originalCode = this.extractCallExpression(callSite, lines);
        const newCode = rebuiltByCallSite.get(callSite);
        if (newCode === undefined || newCode === originalCode) {
          continue;
        }

        updates.push({
          filePath: callSite.location.filePath,
          originalCode,
          newCode,
          location: callSite.location
        });
      }
    }

    return updates;
  }

  /**
   * 判斷 outer 是否嚴格包含 inner（範圍包含且不相等）
   */
  private rangeStrictlyContains(outer: Range, inner: Range): boolean {
    const startsAtOrBefore = !isPositionBefore(inner.start, outer.start);
    const endsAtOrAfter = !isPositionBefore(outer.end, inner.end);
    if (!startsAtOrBefore || !endsAtOrAfter) {
      return false;
    }
    // 排除完全相等（避免自我包含）
    const sameStart = inner.start.line === outer.start.line && inner.start.column === outer.start.column;
    const sameEnd = inner.end.line === outer.end.line && inner.end.column === outer.end.column;
    return !(sameStart && sameEnd);
  }

  /**
   * 是否被同檔案內其他目標呼叫包含
   */
  private isContainedByOther(callSite: CallSite, all: readonly CallSite[]): boolean {
    return all.some(other =>
      other !== callSite && this.rangeStrictlyContains(other.location.range, callSite.location.range)
    );
  }

  /**
   * 依包含關係由內而外排序：被包含者排前面，外層排後面。
   * 確保重建外層呼叫時內層文字已就緒。
   *
   * 被包含的呼叫起點必嚴格晚於其外層呼叫（外層為 `name(...` 內層在括號內），
   * 因此以「起點位置由後往前」排序即可保證內層先於外層處理，且為完整全序。
   */
  private orderByContainment(callSites: readonly CallSite[]): CallSite[] {
    return [...callSites].sort((a, b) => {
      const aStart = a.location.range.start;
      const bStart = b.location.range.start;
      if (isPositionBefore(aStart, bStart)) { return 1; }
      if (isPositionBefore(bStart, aStart)) { return -1; }
      return 0;
    });
  }

  /**
   * 從呼叫點的精確範圍擷取原始呼叫運算式文字（函式名第一個字元到右括號之後）
   */
  private extractCallExpression(callSite: CallSite, lines: readonly string[]): string {
    const { start, end } = callSite.location.range;
    const startLineIndex = start.line - 1;
    const endLineIndex = end.line - 1;
    const startCol = start.column - 1; // 0-based
    const endCol = end.column - 1; // 0-based（右括號之後）

    if (startLineIndex === endLineIndex) {
      return lines[startLineIndex].substring(startCol, endCol);
    }

    const segments: string[] = [];
    segments.push(lines[startLineIndex].substring(startCol));
    for (let i = startLineIndex + 1; i < endLineIndex; i++) {
      segments.push(lines[i]);
    }
    segments.push(lines[endLineIndex].substring(0, endCol));
    return segments.join('\n');
  }

  /**
   * 重建單一呼叫點的呼叫運算式文字（不含整行內容）。
   * 巢狀情況：若某引數本身就是被包含的目標呼叫，改用該內層呼叫重排後的文字。
   *
   * @param rebuiltByCallSite - 已重建的內層呼叫文字（由內而外處理，內層先就緒）
   */
  private rebuildCallExpression(
    callSite: CallSite,
    lines: readonly string[],
    parameterMapping: Map<number, ParameterMappingInfo>,
    changes: readonly SignatureChange[],
    originalSignature: FunctionSignature,
    allCallSites: readonly CallSite[],
    rebuiltByCallSite: ReadonlyMap<CallSite, string>
  ): string {
    const startLineIndex = callSite.location.range.start.line - 1;
    const endLineIndex = callSite.location.range.end.line - 1;
    const isMultiline = startLineIndex !== endLineIndex;

    // 計算引數值覆寫：若某引數的範圍包含某個內層目標呼叫，
    // 改用該內層呼叫重排後的文字（遞迴套用）。
    const argumentOverrides = this.computeNestedArgumentOverrides(
      callSite,
      allCallSites,
      rebuiltByCallSite
    );

    // 建立新的參數列表
    const newArgs = this.mapCallSiteArguments(
      callSite,
      parameterMapping,
      changes,
      originalSignature,
      argumentOverrides
    );

    if (isMultiline) {
      // 多行呼叫點：保留原始風格
      const originalStyle = this.detectCallStyle(lines, startLineIndex, endLineIndex);
      const newArgsString = this.formatArgsWithStyle(newArgs, originalStyle);
      return `${callSite.functionName}(${newArgsString})`;
    }

    // 單行呼叫點
    return `${callSite.functionName}(${newArgs.join(', ')})`;
  }

  /**
   * 計算巢狀引數覆寫：將每個包含內層目標呼叫的引數 index 映射到內層重排後的文字。
   */
  private computeNestedArgumentOverrides(
    callSite: CallSite,
    allCallSites: readonly CallSite[],
    rebuiltByCallSite: ReadonlyMap<CallSite, string>
  ): Map<number, string> {
    const overrides = new Map<number, string>();

    for (let argIndex = 0; argIndex < callSite.arguments.length; argIndex++) {
      const argRange = callSite.arguments[argIndex].range;

      for (const inner of allCallSites) {
        if (inner === callSite) {
          continue;
        }
        const rebuilt = rebuiltByCallSite.get(inner);
        if (rebuilt === undefined) {
          continue;
        }
        // 內層呼叫的範圍落在此引數範圍內 → 用內層重排後文字取代
        if (this.rangeContainsOrEquals(argRange, inner.location.range)) {
          overrides.set(argIndex, rebuilt);
          break;
        }
      }
    }

    return overrides;
  }

  /**
   * outer 是否包含 inner（含邊界相等）
   */
  private rangeContainsOrEquals(outer: Range, inner: Range): boolean {
    const startsAtOrBefore = !isPositionBefore(inner.start, outer.start);
    const endsAtOrAfter = !isPositionBefore(outer.end, inner.end);
    return startsAtOrBefore && endsAtOrAfter;
  }

  /**
   * 映射呼叫點參數
   * 處理省略的可選參數：當可選參數被省略時，重排後需要插入 undefined
   */
  mapCallSiteArguments(
    callSite: CallSite,
    parameterMapping: Map<number, ParameterMappingInfo>,
    changes: readonly SignatureChange[],
    originalSignature: FunctionSignature,
    argumentOverrides?: ReadonlyMap<number, string>
  ): string[] {
    const result: string[] = [];

    // 找出新參數的數量
    let maxNewIndex = -1;
    for (const { newIndex } of parameterMapping.values()) {
      maxNewIndex = Math.max(maxNewIndex, newIndex);
    }

    // 初始化結果陣列
    for (let i = 0; i <= maxNewIndex; i++) {
      result.push('');
    }

    // 映射原始參數與新增參數
    const addedPositions = new Set<number>();
    for (const [originalIndex, { newIndex, value }] of parameterMapping.entries()) {
      if (originalIndex >= 0) {
        if (originalIndex < callSite.arguments.length) {
          // 呼叫點有提供此參數
          // 巢狀呼叫：若此引數本身是被包含的目標呼叫，改用內層重排後文字
          result[newIndex] = argumentOverrides?.get(originalIndex)
            ?? callSite.arguments[originalIndex].value;
        } else {
          // 呼叫點省略了此可選參數
          // 檢查這個位置是否需要填入 undefined（當後面有其他參數時）
          const param = originalSignature.parameters[originalIndex];
          if (param && (param.optional || param.defaultValue)) {
            // 標記為需要填入 undefined（如果後面有非空參數）
            result[newIndex] = OMITTED_PARAMETER_MARKER;
          }
        }
      } else {
        if (value !== undefined) {
          result[newIndex] = value;
          addedPositions.add(newIndex);
        }
      }
    }

    // 填入新增參數的值
    for (const change of changes) {
      if (isAddParameterChange(change)) {
        // 使用 callSiteValue 或 defaultValue（驗證階段已確保至少有一個值）
        const value = change.callSiteValue ?? change.defaultValue ?? '';
        const position = change.position < 0 ? result.length - 1 : Math.min(change.position, result.length - 1);
        if (position >= 0 && position < result.length && !result[position]) {
          result[position] = value;
          addedPositions.add(position);
        }
      }
    }

    // 處理省略的可選參數：
    // 如果省略的參數後面有非空參數，則需要填入 undefined
    // 否則可以完全省略
    const processedResult: string[] = [];
    let lastNonEmptyIndex = -1;

    // 找到最後一個非空參數的索引
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i] !== '' && result[i] !== OMITTED_PARAMETER_MARKER) {
        lastNonEmptyIndex = i;
        break;
      }
    }

    // 建立最終結果
    for (let i = 0; i <= lastNonEmptyIndex; i++) {
      if (result[i] === OMITTED_PARAMETER_MARKER) {
        // 省略的可選參數，但後面有其他參數，需要填入 undefined
        processedResult.push('undefined');
      } else if (result[i] === '') {
        // 空值，檢查是否是新增的位置
        if (addedPositions.has(i)) {
          processedResult.push('undefined');
        } else {
          // 不應該出現的情況，填入 undefined 以避免語法錯誤
          processedResult.push('undefined');
        }
      } else {
        processedResult.push(result[i]);
      }
    }

    // 保留超出宣告固定參數個數的尾端多餘引數（對應 rest/variadic 參數）：
    // 參數映射把 rest 參數視為單一位置，只消費了它對應的第一個引數，
    // 其餘 arguments[declaredParameterCount..] 需依原順序接在輸出尾端，避免被靜默丟棄。
    // 被 remove 的參數位於 [0, declaredParameterCount)，其引數已由映射階段處理（丟棄），不受此影響。
    const declaredParameterCount = originalSignature.parameters.length;
    for (let i = declaredParameterCount; i < callSite.arguments.length; i++) {
      processedResult.push(argumentOverrides?.get(i) ?? callSite.arguments[i].value);
    }

    return processedResult;
  }

  /**
   * 建立參數映射
   */
  createParameterMapping(
    originalSignature: FunctionSignature,
    _newSignature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): Map<number, ParameterMappingInfo> {
    const mapping = new Map<number, ParameterMappingInfo>();

    // 初始化：原始索引 -> 新索引
    let currentParams = originalSignature.parameters.map((p, i) => ({ name: p.name, originalIndex: i }));

    // 處理每個變更
    for (const change of changes) {
      if (isRemoveParameterChange(change)) {
        const index = resolveParameterIndex(
          currentParams.map(p => ({ name: p.name })),
          change.parameterNameOrIndex
        );
        if (index >= 0) {
          currentParams.splice(index, 1);
        }
      }

      if (isReorderParametersChange(change)) {
        const newOrder: typeof currentParams = [];
        const usedIndices = new Set<number>();
        for (const nameOrIndex of change.newOrder) {
          const index = resolveParameterIndex(
            currentParams.map(p => ({ name: p.name })),
            nameOrIndex
          );
          if (index >= 0 && !usedIndices.has(index)) {
            newOrder.push(currentParams[index]);
            usedIndices.add(index);
          }
        }
        // 保留未被 newOrder 指名的參數（例如先前 --add 新增的），依原本相對順序附加在後
        for (let i = 0; i < currentParams.length; i++) {
          if (!usedIndices.has(i)) {
            newOrder.push(currentParams[i]);
          }
        }
        currentParams = newOrder;
      }

      if (isAddParameterChange(change)) {
        const newParam = { name: change.name, originalIndex: -1, value: change.callSiteValue || change.defaultValue };
        if (change.position < 0 || change.position >= currentParams.length) {
          currentParams.push(newParam);
        } else {
          currentParams.splice(change.position, 0, newParam);
        }
      }
    }

    // 建立最終映射
    for (let newIndex = 0; newIndex < currentParams.length; newIndex++) {
      const param = currentParams[newIndex];
      if (param.originalIndex >= 0) {
        mapping.set(param.originalIndex, { newIndex });
      } else if ('value' in param) {
        // 新增的參數，設定預設值
        mapping.set(-1 - newIndex, { newIndex, value: param.value as string | undefined });
      }
    }

    return mapping;
  }

  /**
   * 檢測呼叫風格
   *
   * @remarks
   * 限制說明：
   * - trailingComma 檢測使用簡單的 `endsWith(',')` 邏輯
   * - 若參數值本身以逗號結尾（如字串 `"foo,"`），可能產生誤判
   * - 此情況較罕見，目前接受此限制
   */
  detectCallStyle(
    lines: readonly string[],
    startLine: number,
    endLine: number
  ): CallStyle {
    const isMultiline = startLine !== endLine;

    if (!isMultiline) {
      return { multiline: false, indent: '', trailingComma: false };
    }

    // 檢測縮排（從第二行取得）
    const secondLine = lines[startLine + 1] || '';
    const indentMatch = secondLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '  ';

    // 檢測是否有尾隨逗號（簡單啟發式，可能誤判字串內容結尾的逗號）
    const lastArgLine = lines[endLine - 1] || lines[endLine];
    const trailingComma = lastArgLine.trimEnd().endsWith(',');

    return { multiline: true, indent, trailingComma };
  }

  /**
   * 根據風格格式化參數
   */
  formatArgsWithStyle(
    args: readonly string[],
    style: CallStyle
  ): string {
    if (!style.multiline || args.length === 0) {
      return args.join(', ');
    }

    // 多行格式：每個引數間恆以 ',\n' 分隔；trailingComma 只決定「最後一個引數後」是否補逗號（見下行）
    const formattedArgs = args.map(arg => `${style.indent}${arg}`);
    return '\n' + formattedArgs.join(',\n') + (style.trailingComma ? ',' : '') + '\n';
  }

}

/**
 * 建立 CallSiteUpdater 實例
 */
export function createCallSiteUpdater(
  fileSystem: IFileSystem,
  parserRegistry: ParserRegistry
): CallSiteUpdater {
  return new CallSiteUpdater(fileSystem, parserRegistry);
}
