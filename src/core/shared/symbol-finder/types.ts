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
