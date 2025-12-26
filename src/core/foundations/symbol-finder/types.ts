/**
 * 符號查找器型別定義
 */

import type { Range, Location } from '@shared/types/core.js';
import type { Symbol } from '@shared/types/symbol.js';

/**
 * 符號引用
 */
export interface SymbolReference {
  readonly symbolName: string;
  readonly location: Location;
  readonly type: SymbolReferenceType;
  /** 引用所在行的完整程式碼（用於輸出顯示） */
  readonly context?: string;
  /** 所屬容器名稱（class、interface 等，用於作用域識別） */
  readonly containerName?: string;
  /** 是否為方法呼叫（用於區分同名方法） */
  readonly isMethodCall?: boolean;
  /** 呼叫者類型名稱（用於精確匹配方法所屬類別） */
  readonly receiverType?: string;
}

/**
 * 符號引用類型
 */
export enum SymbolReferenceType {
  Definition = 'definition',
  Usage = 'usage',
  Import = 'import',
  Export = 'export'
}

/**
 * 函式呼叫點
 */
export interface CallSite {
  readonly functionName: string;
  readonly location: Location;
  readonly arguments: readonly CallSiteArgument[];
  readonly isMethodCall: boolean;
  readonly receiver?: string;
}

/**
 * 呼叫點參數
 */
export interface CallSiteArgument {
  readonly index: number;
  readonly name?: string;
  readonly value: string;
  readonly range: Range;
}

/**
 * 類別成員
 */
export interface ClassMember {
  readonly name: string;
  readonly type: ClassMemberType;
  readonly location: Location;
  readonly modifiers: readonly string[];
  readonly valueType?: string;
}

/**
 * 類別成員類型
 */
export enum ClassMemberType {
  Method = 'method',
  Property = 'property',
  Getter = 'getter',
  Setter = 'setter',
  Constructor = 'constructor'
}

/**
 * 符號定義
 */
export interface SymbolDefinition {
  readonly symbol: Symbol;
  readonly signature?: string;
  readonly documentation?: string;
}

/**
 * 符號唯一識別鍵
 * 用於區分不同作用域的同名符號（如 Dog.bark vs Car.bark）
 */
export interface SymbolKey {
  /** 符號名稱 */
  readonly name: string;
  /** 所屬容器（類別、介面等）*/
  readonly containerName: string | undefined;
  /** 定義檔案路徑 */
  readonly filePath: string;
  /** 定義行號（用於同檔案同容器內的區分）*/
  readonly line: number;
}

/**
 * 將 Symbol 轉換為 SymbolKey
 */
export function symbolToKey(symbol: Symbol): SymbolKey {
  return {
    name: symbol.name,
    containerName: symbol.scope?.name,
    filePath: symbol.location.filePath,
    line: symbol.location.range.start.line
  };
}

/** SymbolKey 序列化格式版本（用於未來擴展和向後相容） */
const SYMBOL_KEY_VERSION = 'v1';

/**
 * 將 SymbolKey 序列化為字串（用於 Map 鍵）
 * 格式：v1:filePath:line:containerName:name
 *
 * 版本控制：當格式需要變更時，更新 SYMBOL_KEY_VERSION 並新增對應的解析邏輯
 */
export function serializeSymbolKey(key: SymbolKey): string {
  return `${SYMBOL_KEY_VERSION}:${key.filePath}:${key.line}:${key.containerName ?? ''}:${key.name}`;
}

/**
 * 將序列化字串反序列化為 SymbolKey
 * 支援版本控制，可向後相容舊格式
 */
export function deserializeSymbolKey(serialized: string): SymbolKey {
  const parts = serialized.split(':');

  // 最少需要 4 個部分：filePath:line:containerName:name
  if (parts.length < 4) {
    throw new Error(`Invalid symbol key format: ${serialized}`);
  }

  // 檢查版本前綴
  const version = parts[0];
  if (version === SYMBOL_KEY_VERSION) {
    // v1 格式：v1:filePath:line:containerName:name
    parts.shift(); // 移除版本前綴
    const name = parts.pop() ?? '';
    const containerName = parts.pop() || undefined;
    const lineStr = parts.pop() ?? '0';
    const line = parseInt(lineStr, 10);
    const filePath = parts.join(':');
    return { name, containerName, filePath, line };
  }

  // 向後相容：舊格式（無版本前綴）filePath:line:containerName:name
  const name = parts.pop() ?? '';
  const containerName = parts.pop() || undefined;
  const lineStr = parts.pop() ?? '0';
  const line = parseInt(lineStr, 10);
  const filePath = parts.join(':');

  return { name, containerName, filePath, line };
}
