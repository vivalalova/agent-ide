/**
 * Move Member 子模組
 * 成員移動功能
 */

// 核心服務
export { MoveMemberService, createMoveMemberService } from './move-member-service.js';
export { MemberExtractor, createMemberExtractor } from './member-extractor.js';

// 型別定義
export type {
  MemberDefinition,
  MoveTarget,
  MoveMemberOptions,
  ReferenceUpdate,
  MoveMemberResult,
  MoveMemberValidationError
} from './types.js';

// 列舉
export {
  MemberType,
  MoveTargetType,
  MoveMemberErrorCode
} from './types.js';

// Type Guards
export {
  isMemberDefinition,
  isMoveMemberResult
} from './types.js';
