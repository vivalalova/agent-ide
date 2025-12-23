/**
 * Change Signature 子模組
 * 參數重構功能
 */

// 核心服務
export { ChangeSignatureService, createChangeSignatureService } from './change-signature-service.js';
export { SignatureParser, createSignatureParser } from './signature-parser.js';
export { SignatureValidator, createSignatureValidator } from './signature-validator.js';
export { SignatureTransformer, createSignatureTransformer } from './signature-transformer.js';
export { CallSiteUpdater, createCallSiteUpdater } from './call-site-updater.js';

// 型別定義
export type {
  ParameterDefinition,
  FunctionSignature,
  SignatureChange,
  AddParameterChange,
  RemoveParameterChange,
  ReorderParametersChange,
  ChangeParameterTypeChange,
  RenameParameterChange,
  ChangeDefaultValueChange,
  ToggleOptionalChange,
  ChangeSignatureOptions,
  CallSiteUpdate,
  ChangeSignatureResult,
  ChangeSignatureValidationError
} from './types.js';

// 列舉
export {
  SignatureChangeType,
  ChangeSignatureErrorCode
} from './types.js';

// Type Guards
export {
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange,
  isChangeParameterTypeChange,
  isRenameParameterChange,
  isChangeDefaultValueChange,
  isToggleOptionalChange
} from './types.js';
