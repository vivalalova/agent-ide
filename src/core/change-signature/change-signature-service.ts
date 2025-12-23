/**
 * Change Signature Service
 * 參數重構核心服務
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder } from '@infrastructure/changeset/index.js';
import { SignatureParser } from './signature-parser.js';
import {
  type ChangeSignatureOptions,
  type ChangeSignatureResult,
  type FunctionSignature,
  type ParameterDefinition,
  type SignatureChange,
  type CallSiteUpdate,
  type ChangeSignatureValidationError,
  ChangeSignatureErrorCode,
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange,
  isChangeParameterTypeChange,
  isRenameParameterChange,
  isChangeDefaultValueChange,
  isToggleOptionalChange
} from './types.js';
import { SymbolFinder, type CallSite } from '../shared/symbol-finder/index.js';

/**
 * Change Signature Service
 */
export class ChangeSignatureService {
  private readonly signatureParser: SignatureParser;
  private readonly symbolFinder: SymbolFinder;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.signatureParser = new SignatureParser(parserRegistry, fileSystem);
    this.symbolFinder = new SymbolFinder(parserRegistry, fileSystem);
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

    // 2. 驗證變更
    const validationErrors = this.validateChanges(originalSignature, options.changes);
    if (validationErrors.length > 0) {
      return this.createErrorResult(
        validationErrors[0].code,
        validationErrors[0].message
      );
    }

    // 3. 計算新簽名
    const newSignature = this.applyChangesToSignature(originalSignature, options.changes);

    // 4. 取得所有呼叫點
    const projectFiles = options.targetFiles ?? await this.getProjectFiles(options.projectRoot);
    const callSites = await this.symbolFinder.findCallSites(options.functionName, projectFiles);

    // 5. 生成定義更新
    const definitionUpdate = await this.generateDefinitionUpdate(
      options.filePath,
      originalSignature,
      newSignature
    );

    // 6. 生成呼叫點更新
    const callSiteUpdates = await this.generateCallSiteUpdates(
      callSites,
      originalSignature,
      newSignature,
      options.changes
    );

    // 7. 執行或預覽
    if (!options.preview) {
      await this.applyChanges(definitionUpdate, callSiteUpdates);
    }

    // 8. 計算影響的檔案
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
      executed: !options.preview,
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
    const builder = createChangesetBuilder().forCommand('change-signature');

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

    // originalCode 和 newCode 都是完整的一行內容
    // 因此 range 應該從行首（column 1）開始，到行尾結束
    const lineNumber = location.range.start.line;
    const originalLineLength = originalCode.length;

    builder.addTextChange(filePath, [{
      range: {
        start: { line: lineNumber, column: 1 },
        end: { line: lineNumber, column: originalLineLength + 1 }
      },
      newText: newCode,
      description: `Update definition: ${originalCode.trim()} -> ${newCode.trim()}`
    }], 'modify');

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
      // 跳過與 definitionUpdate 同一檔案（避免重複）
      // 已經在上面處理過了，呼叫點和定義可能在同一行
      const edits = updates.map(update => {
        // originalCode 和 newCode 都是完整的一行內容
        // 因此 range 應該從行首（column 1）開始，到行尾結束
        const lineStart = update.location.range.start.line;
        const callOriginalLength = update.originalCode.length;
        return {
          range: {
            start: { line: lineStart, column: 1 },
            end: { line: lineStart, column: callOriginalLength + 1 }
          },
          newText: update.newCode,
          description: `Update call: ${update.originalCode.trim()} -> ${update.newCode.trim()}`
        };
      });

      builder.addTextChange(updateFilePath, edits, 'modify');
    }

    // 設定描述
    const originalParams = result.originalSignature.parameters.map(p => p.name).join(', ');
    const newParams = result.newSignature.parameters.map(p => p.name).join(', ');
    builder.withDescription(
      `Changed signature of ${result.originalSignature.name}: (${originalParams}) -> (${newParams})`
    );

    return builder.build();
  }

  /**
   * 驗證變更
   */
  private validateChanges(signature: FunctionSignature, changes: readonly SignatureChange[]): ChangeSignatureValidationError[] {
    const errors: ChangeSignatureValidationError[] = [];
    const parameterNames = new Set(signature.parameters.map(p => p.name));
    const newParameterNames = new Set(parameterNames);

    for (const change of changes) {
      if (isAddParameterChange(change)) {
        if (newParameterNames.has(change.name)) {
          errors.push({
            code: ChangeSignatureErrorCode.DuplicateParameterName,
            message: `參數名稱重複: ${change.name}`,
            parameterName: change.name
          });
        } else {
          newParameterNames.add(change.name);
        }

        // 驗證新增參數必須有預設值
        if (!change.callSiteValue && !change.defaultValue) {
          errors.push({
            code: ChangeSignatureErrorCode.MissingDefaultValue,
            message: `參數 ${change.name} 缺少預設值，請使用 --default-value 或 --call-site-value 指定`,
            parameterName: change.name
          });
        }
      }

      if (isRemoveParameterChange(change)) {
        const targetName = this.resolveParameterName(signature, change.parameterNameOrIndex);
        if (!targetName || !parameterNames.has(targetName)) {
          errors.push({
            code: ChangeSignatureErrorCode.ParameterNotFound,
            message: `找不到參數: ${change.parameterNameOrIndex}`,
            parameterName: String(change.parameterNameOrIndex)
          });
        } else {
          newParameterNames.delete(targetName);
        }
      }

      if (isReorderParametersChange(change)) {
        for (const nameOrIndex of change.newOrder) {
          const targetName = this.resolveParameterName(signature, nameOrIndex);
          if (!targetName || !parameterNames.has(targetName)) {
            errors.push({
              code: ChangeSignatureErrorCode.ParameterNotFound,
              message: `找不到參數: ${nameOrIndex}`,
              parameterName: String(nameOrIndex)
            });
          }
        }

        if (change.newOrder.length !== signature.parameters.length) {
          errors.push({
            code: ChangeSignatureErrorCode.InvalidParameterOrder,
            message: '重新排序必須包含所有參數'
          });
        }

        // 驗證可選參數順序：可選參數必須在必選參數之後
        const optionalOrderError = this.validateOptionalParameterOrder(signature, change.newOrder);
        if (optionalOrderError) {
          errors.push(optionalOrderError);
        }
      }

      if (isChangeParameterTypeChange(change) || isRenameParameterChange(change) ||
          isChangeDefaultValueChange(change) || isToggleOptionalChange(change)) {
        const targetName = this.resolveParameterName(signature, change.parameterNameOrIndex);
        if (!targetName || !parameterNames.has(targetName)) {
          errors.push({
            code: ChangeSignatureErrorCode.ParameterNotFound,
            message: `找不到參數: ${change.parameterNameOrIndex}`,
            parameterName: String(change.parameterNameOrIndex)
          });
        }
      }

      if (isRenameParameterChange(change)) {
        if (newParameterNames.has(change.newName) && change.newName !== this.resolveParameterName(signature, change.parameterNameOrIndex)) {
          errors.push({
            code: ChangeSignatureErrorCode.DuplicateParameterName,
            message: `參數名稱重複: ${change.newName}`,
            parameterName: change.newName
          });
        }
      }
    }

    return errors;
  }

  /**
   * 套用變更到簽名
   */
  private applyChangesToSignature(signature: FunctionSignature, changes: readonly SignatureChange[]): FunctionSignature {
    let parameters = [...signature.parameters];

    for (const change of changes) {
      if (isAddParameterChange(change)) {
        const newParam: ParameterDefinition = {
          name: change.name,
          type: change.parameterType,
          defaultValue: change.defaultValue,
          optional: change.optional,
          rest: false,
          range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } }
        };

        if (change.position < 0 || change.position >= parameters.length) {
          parameters.push(newParam);
        } else {
          parameters.splice(change.position, 0, newParam);
        }
      }

      if (isRemoveParameterChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters.splice(index, 1);
        }
      }

      if (isReorderParametersChange(change)) {
        const newParams: ParameterDefinition[] = [];
        for (const nameOrIndex of change.newOrder) {
          const index = this.resolveParameterIndex(parameters, nameOrIndex);
          if (index >= 0) {
            newParams.push(parameters[index]);
          }
        }
        parameters = newParams;
      }

      if (isChangeParameterTypeChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = { ...parameters[index], type: change.newType };
        }
      }

      if (isRenameParameterChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = { ...parameters[index], name: change.newName };
        }
      }

      if (isChangeDefaultValueChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = {
            ...parameters[index],
            defaultValue: change.newDefaultValue,
            optional: change.newDefaultValue !== undefined || parameters[index].optional
          };
        }
      }

      if (isToggleOptionalChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = { ...parameters[index], optional: change.optional };
        }
      }
    }

    return {
      ...signature,
      parameters
    };
  }

  /**
   * 生成定義更新
   */
  private async generateDefinitionUpdate(
    filePath: string,
    originalSignature: FunctionSignature,
    newSignature: FunctionSignature
  ): Promise<{ filePath: string; originalCode: string; newCode: string; location: typeof originalSignature.location }> {
    const content = await this.readFile(filePath);
    if (!content) {
      throw new Error(`無法讀取檔案: ${filePath}`);
    }

    const lines = content.split('\n');
    const startLine = originalSignature.location.range.start.line - 1;
    const originalLine = lines[startLine];

    // 生成新的參數列表
    const newParamsString = this.generateParameterString(newSignature, filePath);

    // 替換參數部分
    const funcNameIndex = originalLine.indexOf(originalSignature.name);
    const openParenIndex = originalLine.indexOf('(', funcNameIndex);
    const closeParenIndex = this.findMatchingParen(originalLine, openParenIndex);

    const newLine = originalLine.substring(0, openParenIndex + 1) +
      newParamsString +
      originalLine.substring(closeParenIndex);

    return {
      filePath,
      originalCode: originalLine,
      newCode: newLine,
      location: originalSignature.location
    };
  }

  /**
   * 生成呼叫點更新
   * 效能優化：按檔案分組後批次讀取，避免重複讀取同一檔案
   * 檔案讀取次數從 O(N) 降到 O(M)，N = callSites 數量，M = 不重複檔案數
   * 支援多行呼叫點：正確處理跨多行的函式呼叫
   */
  private async generateCallSiteUpdates(
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
      if (!content) {continue;}

      const lines = content.split('\n');

      // 處理該檔案的所有 callSites
      for (const callSite of fileCallSites) {
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
        if (funcNameIndex < 0) {continue;}

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
            updates.push({
              filePath: callSite.location.filePath,
              originalCode,
              newCode,
              location: callSite.location
            });
          }
        } else {
          // 單行呼叫點：保持原有邏輯
          const closeParenIndex = this.findMatchingParen(startLine, openParenIndex);
          const newArgsString = newArgs.join(', ');

          const newLine = startLine.substring(0, openParenIndex + 1)
            + newArgsString
            + startLine.substring(closeParenIndex);

          if (newLine !== startLine) {
            updates.push({
              filePath: callSite.location.filePath,
              originalCode: startLine,
              newCode: newLine,
              location: callSite.location
            });
          }
        }
      }
    }

    return updates;
  }

  /**
   * 提取多行程式碼
   */
  private extractMultilineCode(
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
  private detectCallStyle(
    lines: readonly string[],
    startLine: number,
    endLine: number
  ): { multiline: boolean; indent: string; trailingComma: boolean } {
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
  private formatArgsWithStyle(
    args: readonly string[],
    style: { multiline: boolean; indent: string; trailingComma: boolean }
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
  private getTrailingContent(lines: readonly string[], endLine: number, closeParenColumn: number): string {
    const line = lines[endLine];
    // 找到右括號後的內容
    return line.substring(closeParenColumn + 1);
  }

  /**
   * 建立參數映射
   */
  private createParameterMapping(
    originalSignature: FunctionSignature,
    newSignature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): Map<number, { newIndex: number; value?: string }> {
    const mapping = new Map<number, { newIndex: number; value?: string }>();

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
   * 映射呼叫點參數
   * 處理省略的可選參數：當可選參數被省略時，重排後需要插入 undefined
   */
  private mapCallSiteArguments(
    callSite: CallSite,
    parameterMapping: Map<number, { newIndex: number; value?: string }>,
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
   * 執行變更
   */
  private async applyChanges(
    definitionUpdate: { filePath: string; originalCode: string; newCode: string },
    callSiteUpdates: readonly CallSiteUpdate[]
  ): Promise<void> {
    // 按檔案分組
    const fileUpdates = new Map<string, Array<{ originalCode: string; newCode: string; line: number }>>();

    // 加入定義更新
    if (!fileUpdates.has(definitionUpdate.filePath)) {
      fileUpdates.set(definitionUpdate.filePath, []);
    }
    fileUpdates.get(definitionUpdate.filePath)!.push({
      originalCode: definitionUpdate.originalCode,
      newCode: definitionUpdate.newCode,
      line: 0 // 會在下面重新計算
    });

    // 加入呼叫點更新
    for (const update of callSiteUpdates) {
      if (!fileUpdates.has(update.filePath)) {
        fileUpdates.set(update.filePath, []);
      }
      fileUpdates.get(update.filePath)!.push({
        originalCode: update.originalCode,
        newCode: update.newCode,
        line: update.location.range.start.line
      });
    }

    // 套用到每個檔案
    for (const [filePath, updates] of fileUpdates) {
      let content = await this.readFile(filePath);
      if (!content) {continue;}

      // 從後往前替換，避免行號偏移
      const sortedUpdates = updates.sort((a, b) => b.line - a.line);

      for (const update of sortedUpdates) {
        content = content.replace(update.originalCode, update.newCode);
      }

      await this.fileSystem.writeFile(filePath, content);
    }
  }

  /**
   * 生成參數字串
   */
  private generateParameterString(signature: FunctionSignature, filePath: string): string {
    const extension = this.getFileExtension(filePath);
    const isTypeScript = extension === '.ts' || extension === '.tsx';

    return signature.parameters.map(param => {
      let result = '';

      if (param.rest) {
        result += '...';
      }

      result += param.name;

      if (param.optional && !param.defaultValue) {
        result += '?';
      }

      if (param.type && isTypeScript) {
        result += `: ${param.type}`;
      }

      if (param.defaultValue) {
        result += ` = ${param.defaultValue}`;
      }

      return result;
    }).join(', ');
  }

  /**
   * 找到匹配的括號
   */
  private findMatchingParen(line: string, openIndex: number): number {
    let depth = 1;
    for (let i = openIndex + 1; i < line.length; i++) {
      if (line[i] === '(') {depth++;}
      else if (line[i] === ')') {
        depth--;
        if (depth === 0) {return i;}
      }
    }
    return line.length;
  }

  /**
   * 解析參數名稱
   */
  private resolveParameterName(signature: FunctionSignature, nameOrIndex: string | number): string | undefined {
    if (typeof nameOrIndex === 'number') {
      return signature.parameters[nameOrIndex]?.name;
    }
    return signature.parameters.find(p => p.name === nameOrIndex)?.name;
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
   * 驗證可選參數順序
   * TypeScript 規則：可選參數必須在所有必選參數之後
   * 例外：有預設值的參數視為可選，rest 參數必須在最後
   */
  private validateOptionalParameterOrder(
    signature: FunctionSignature,
    newOrder: readonly (string | number)[]
  ): ChangeSignatureValidationError | null {
    // 根據新順序建立參數列表
    const reorderedParams: ParameterDefinition[] = [];
    for (const nameOrIndex of newOrder) {
      const index = this.resolveParameterIndex(signature.parameters, nameOrIndex);
      if (index >= 0) {
        reorderedParams.push(signature.parameters[index]);
      }
    }

    // 檢查可選參數是否在必選參數之前
    let foundOptional = false;
    let firstOptionalParam: ParameterDefinition | null = null;

    for (const param of reorderedParams) {
      const isOptional = param.optional || param.defaultValue !== undefined;
      const isRest = param.rest;

      if (isOptional && !isRest) {
        foundOptional = true;
        if (!firstOptionalParam) {
          firstOptionalParam = param;
        }
      } else if (!isOptional && !isRest && foundOptional) {
        // 找到必選參數在可選參數之後
        return {
          code: ChangeSignatureErrorCode.OptionalBeforeRequired,
          message: `可選參數 '${firstOptionalParam!.name}' 不能位於必選參數 '${param.name}' 之前`,
          parameterName: param.name
        };
      }
    }

    return null;
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

      // 跳過 node_modules 和隱藏目錄
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
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
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    return supportedExtensions.some(ext => filename.endsWith(ext));
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

  /**
   * 取得檔案副檔名
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }

  /**
   * 建立錯誤結果
   */
  private createErrorResult(code: ChangeSignatureErrorCode, message: string): ChangeSignatureResult {
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
 * 建立 ChangeSignatureService 實例
 */
export function createChangeSignatureService(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): ChangeSignatureService {
  return new ChangeSignatureService(parserRegistry, fileSystem);
}
