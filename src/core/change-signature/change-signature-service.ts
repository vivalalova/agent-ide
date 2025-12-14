/**
 * Change Signature Service
 * 參數重構核心服務
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { SignatureParser } from './signature-parser.js';
import {
  type ChangeSignatureOptions,
  type ChangeSignatureResult,
  type FunctionSignature,
  type ParameterDefinition,
  type SignatureChange,
  type CallSiteUpdate,
  type ChangeSignatureValidationError,
  SignatureChangeType,
  ChangeSignatureErrorCode,
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange,
  isChangeParameterTypeChange,
  isRenameParameterChange,
  isChangeDefaultValueChange,
  isToggleOptionalChange
} from './types.js';
import { SymbolFinder, type CallSite } from '../shared/symbol-finder.js';

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
   * 效能優化：使用 Map 快取檔案內容，避免同一檔案被重複讀取
   * 複雜度從 O(N) 降到 O(M)，M = 不重複檔案數
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
        const lineIndex = callSite.location.range.start.line - 1;
        const originalLine = lines[lineIndex];

        // 建立新的參數列表
        const newArgs = this.mapCallSiteArguments(callSite, parameterMapping, changes);
        const newArgsString = newArgs.join(', ');

        // 找到呼叫的括號位置
        const funcNameIndex = originalLine.indexOf(callSite.functionName);
        if (funcNameIndex < 0) {continue;}

        const openParenIndex = originalLine.indexOf('(', funcNameIndex);
        const closeParenIndex = this.findMatchingParen(originalLine, openParenIndex);

        const newLine = originalLine.substring(0, openParenIndex + 1) +
          newArgsString +
          originalLine.substring(closeParenIndex);

        if (newLine !== originalLine) {
          updates.push({
            filePath: callSite.location.filePath,
            originalCode: originalLine,
            newCode: newLine,
            location: callSite.location
          });
        }
      }
    }

    return updates;
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
   */
  private mapCallSiteArguments(
    callSite: CallSite,
    parameterMapping: Map<number, { newIndex: number; value?: string }>,
    changes: readonly SignatureChange[]
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
      if (originalIndex >= 0 && originalIndex < callSite.arguments.length) {
        result[newIndex] = callSite.arguments[originalIndex].value;
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

    // 移除空值（但保留原始參數位置和新增參數位置）
    return result.filter((v, i) => v !== '' || i < callSite.arguments.length || addedPositions.has(i));
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
    return {
      success: false,
      error: message,
      originalSignature: null as any,
      newSignature: null as any,
      definitionUpdate: null as any,
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
