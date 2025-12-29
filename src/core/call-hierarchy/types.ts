/**
 * 呼叫層次分析相關型別定義
 * 包含 CallHierarchyOptions、CallHierarchyData、OutgoingCall、IncomingCall 等型別
 */

import type { Location } from '@shared/types/core.js';

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

/** 呼叫層次分析選項 */
export interface CallHierarchyOptions {
  readonly direction: 'incoming' | 'outgoing' | 'both';
  readonly depth: number;
  readonly maxResults?: number;
}

/** 呼叫層次分析結果 */
export interface CallHierarchyData {
  readonly functionName: string;
  readonly definitionFile: string;
  readonly definitionLine: number;
  readonly incoming: IncomingCall[];
  readonly outgoing: OutgoingCall[];
}
