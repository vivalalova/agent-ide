/**
 * CLI 命令模組導出
 */

export type { CommandContext, CommandSetup } from './types.js';

// Transform 命令（直接掛根層）
export { setupShiftCommand } from './shift.command.js';
export { setupMoveCommand } from './move.command.js';
export { setupMoveMemberCommand } from './move-member.command.js';
export { setupRenameCommand } from './rename.command.js';
export { setupChangeSignatureCommand } from './change-signature.command.js';

// Query 命令（扁平化）
export { setupSymbolCommand } from './symbol.command.js';
export { setupStructuralCommand } from './structural.command.js';
export { setupComplexityCommand } from './complexity.command.js';
export { setupDeadcodeCommand } from './deadcode.command.js';
export { setupCyclesCommand } from './cycles.command.js';
export { setupImpactCommand } from './impact.command.js';
export { setupSnapshotCommand } from './snapshot.command.js';
