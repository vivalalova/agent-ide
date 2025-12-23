/**
 * Call Site Updater
 * 負責呼叫點更新相關邏輯
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type {
  FunctionSignature,
  ParameterDefinition,
  SignatureChange,
  CallSiteUpdate
} from './types.js';
import {
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange
} from './types.js';
import type { CallSite } from '@core/shared/symbol-finder/index.js';

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
  constructor(private readonly fileSystem: IFileSystem) {}

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
      const content = await this.readFile(filePath);
      if (!content) { continue; }

      const lines = content.split('\n');

      // 處理該檔案的所有 callSites
      for (const callSite of fileCallSites) {
        const update = this.processCallSite(
          callSite,
          lines,
          parameterMapping,
          changes,
          originalSignature
        );
        if (update) {
          updates.push(update);
        }
      }
    }

    return updates;
  }

  /**
   * 處理單一呼叫點
   */
  private processCallSite(
    callSite: CallSite,
    lines: readonly string[],
    parameterMapping: Map<number, ParameterMappingInfo>,
    changes: readonly SignatureChange[],
    originalSignature: FunctionSignature
  ): CallSiteUpdate | null {
    const startLineIndex = callSite.location.range.start.line - 1;
    const endLineIndex = callSite.location.range.end.line - 1;
    const isMultiline = startLineIndex !== endLineIndex;

    // 建立新的參數列表
    const newArgs = this.mapCallSiteArguments(
      callSite,
      parameterMapping,
      changes,
      originalSignature
    );

    // 找到呼叫的括號位置
    const startLine = lines[startLineIndex];
    const funcNameIndex = startLine.indexOf(callSite.functionName);
    if (funcNameIndex < 0) { return null; }

    const openParenIndex = startLine.indexOf('(', funcNameIndex);

    if (isMultiline) {
      // 多行呼叫點：提取完整的原始程式碼並替換
      const originalCode = this.extractMultilineCode(lines, startLineIndex, endLineIndex);

      // 檢測原始呼叫的格式風格
      const originalStyle = this.detectCallStyle(lines, startLineIndex, endLineIndex);

      // 生成新的參數字串（保留原始風格）
      const newArgsString = this.formatArgsWithStyle(newArgs, originalStyle);

      // 生成新的程式碼
      const newCode = startLine.substring(0, openParenIndex + 1)
        + newArgsString
        + ')' + this.getTrailingContent(lines, endLineIndex, callSite.location.range.end.column - 1);

      if (newCode !== originalCode) {
        return {
          filePath: callSite.location.filePath,
          originalCode,
          newCode,
          location: callSite.location
        };
      }
    } else {
      // 單行呼叫點：保持原有邏輯
      const closeParenIndex = this.findMatchingParen(startLine, openParenIndex);
      const newArgsString = newArgs.join(', ');

      const newLine = startLine.substring(0, openParenIndex + 1)
        + newArgsString
        + startLine.substring(closeParenIndex);

      if (newLine !== startLine) {
        return {
          filePath: callSite.location.filePath,
          originalCode: startLine,
          newCode: newLine,
          location: callSite.location
        };
      }
    }

    return null;
  }

  /**
   * 映射呼叫點參數
   * 處理省略的可選參數：當可選參數被省略時，重排後需要插入 undefined
   */
  mapCallSiteArguments(
    callSite: CallSite,
    parameterMapping: Map<number, ParameterMappingInfo>,
    changes: readonly SignatureChange[],
    originalSignature: FunctionSignature
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

    // 映射原始參數
    for (const [originalIndex, { newIndex }] of parameterMapping.entries()) {
      if (originalIndex >= 0) {
        if (originalIndex < callSite.arguments.length) {
          // 呼叫點有提供此參數
          result[newIndex] = callSite.arguments[originalIndex].value;
        } else {
          // 呼叫點省略了此可選參數
          // 檢查這個位置是否需要填入 undefined（當後面有其他參數時）
          const param = originalSignature.parameters[originalIndex];
          if (param && (param.optional || param.defaultValue)) {
            // 標記為需要填入 undefined（如果後面有非空參數）
            result[newIndex] = '\0OMITTED\0';
          }
        }
      }
    }

    // 填入新增參數的值
    const addedPositions = new Set<number>();
    for (const change of changes) {
      if (isAddParameterChange(change)) {
        // 使用 callSiteValue 或 defaultValue（驗證階段已確保至少有一個值）
        const value = change.callSiteValue || change.defaultValue!;
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
      if (result[i] !== '' && result[i] !== '\0OMITTED\0') {
        lastNonEmptyIndex = i;
        break;
      }
    }

    // 建立最終結果
    for (let i = 0; i <= lastNonEmptyIndex; i++) {
      if (result[i] === '\0OMITTED\0') {
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
        const index = this.resolveParameterIndex(
          currentParams.map(p => ({ name: p.name } as ParameterDefinition)),
          change.parameterNameOrIndex
        );
        if (index >= 0) {
          currentParams.splice(index, 1);
        }
      }

      if (isReorderParametersChange(change)) {
        const newOrder: typeof currentParams = [];
        for (const nameOrIndex of change.newOrder) {
          const index = this.resolveParameterIndex(
            currentParams.map(p => ({ name: p.name } as ParameterDefinition)),
            nameOrIndex
          );
          if (index >= 0) {
            newOrder.push(currentParams[index]);
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
   * 提取多行程式碼
   */
  extractMultilineCode(
    lines: readonly string[],
    startLine: number,
    endLine: number
  ): string {
    if (startLine === endLine) {
      return lines[startLine];
    }

    const result: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      result.push(lines[i]);
    }
    return result.join('\n');
  }

  /**
   * 檢測呼叫風格
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

    // 檢測是否有尾隨逗號
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

    // 多行格式
    const formattedArgs = args.map(arg => `${style.indent}${arg}`);
    const separator = style.trailingComma ? ',\n' : ',\n';
    return '\n' + formattedArgs.join(separator) + (style.trailingComma ? ',' : '') + '\n';
  }

  /**
   * 取得結束行的尾隨內容（右括號之後的部分）
   */
  getTrailingContent(lines: readonly string[], endLine: number, closeParenColumn: number): string {
    const line = lines[endLine];
    // 找到右括號後的內容
    return line.substring(closeParenColumn + 1);
  }

  /**
   * 找到匹配的括號
   */
  private findMatchingParen(line: string, openIndex: number): number {
    let depth = 1;
    for (let i = openIndex + 1; i < line.length; i++) {
      if (line[i] === '(') { depth++; }
      else if (line[i] === ')') {
        depth--;
        if (depth === 0) { return i; }
      }
    }
    return line.length;
  }

  /**
   * 解析參數索引
   */
  private resolveParameterIndex(parameters: readonly (Pick<ParameterDefinition, 'name'>)[], nameOrIndex: string | number): number {
    if (typeof nameOrIndex === 'number') {
      return nameOrIndex >= 0 && nameOrIndex < parameters.length ? nameOrIndex : -1;
    }
    return parameters.findIndex(p => p.name === nameOrIndex);
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
  }
}

/**
 * 建立 CallSiteUpdater 實例
 */
export function createCallSiteUpdater(fileSystem: IFileSystem): CallSiteUpdater {
  return new CallSiteUpdater(fileSystem);
}
