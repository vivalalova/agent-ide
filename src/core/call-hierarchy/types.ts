/**
 * 呼叫層次分析相關型別定義
 * 包含 CallHierarchyOptions、CallHierarchyData、OutgoingCall、IncomingCall 等型別
 */

import type { Location, Range } from '@shared/types/core.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';

/** Outgoing 呼叫資訊（目標函數呼叫了誰） */
export interface OutgoingCall {
  readonly callee: string;
  readonly location: Location;
  readonly context: string;
  readonly isMethodCall: boolean;
  readonly receiver?: string;
}

/** Incoming 呼叫資訊（誰呼叫了目標函數） */
export interface IncomingCall {
  readonly caller: string;
  readonly location: Location;
  readonly context: string;
  readonly callerDefinitionFile?: string;
}

/** incoming 遞迴各層「當層目標定義」的身分（供錨定 filter 依此定位符號） */
export interface CallHierarchyTarget {
  readonly name: string;
  readonly definitionFile: string;
  readonly definitionRange: Range;
}

/** 判定單一 callSite 是否指向當層目標定義 */
export type CallSiteFilter = (callSite: CallSite) => Promise<boolean>;

/** 呼叫層次分析選項 */
export interface CallHierarchyOptions {
  readonly direction: 'incoming' | 'outgoing' | 'both';
  readonly depth: number;
  readonly maxResults?: number;
  /**
   * 依「當層目標定義」建立精確的 callSite 錨定 filter（呼叫端提供，通常是 CLI 的
   * selected-symbol location filter：作用域／import 綁定／receiver 型別三者齊備）。
   * 回傳 undefined 代表該層目標無法還原成索引符號、建不出 filter，此時落回 analyzer
   * 內建的 binding/shadow 錨定。incoming 各層（不限 depth 1）都會詢問。
   */
  readonly targetCallSiteFilterFactory?: (target: CallHierarchyTarget) => Promise<CallSiteFilter | undefined>;
}

/** 呼叫層次分析結果 */
export interface CallHierarchyData {
  readonly functionName: string;
  readonly definitionFile: string;
  readonly definitionLine: number;
  readonly incoming: IncomingCall[];
  readonly outgoing: OutgoingCall[];
}
