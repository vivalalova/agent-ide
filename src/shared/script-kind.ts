/**
 * Script Kind 判定（全專案唯一來源）
 *
 * 依副檔名決定 `ts.createSourceFile` 應使用的 `ts.ScriptKind`。
 * change-signature、impact、TypeScript parser、CLI 符號解析都必須以一致方式
 * 解析同一份原始碼，禁止各自重寫判定邏輯。
 */

import * as path from 'path';
import * as ts from 'typescript';

export function getScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath)) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.tsx':
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}
