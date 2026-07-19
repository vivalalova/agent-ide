/**
 * Script Kind 判定
 * 依副檔名決定 ts.createSourceFile 應使用的 ts.ScriptKind，供多個模組共用
 * （function-declaration-locator、parameter-reference-scanner、definition-updater、
 * call-site-binding-resolver 皆須以一致方式解析同一份原始碼）。
 */

import * as ts from 'typescript';

export function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  if (filePath.endsWith('.js')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
