/** Move 命令選項 */
export interface MoveOptions {
  source?: string;
  target?: string;
  path: string;
  updateImports: boolean;
  dryRun?: boolean;
  format: string;
  /** 成員移動：目標類別 */
  targetClass?: string;
  /** 成員移動：保留 re-export */
  keepReexport?: boolean;
}
