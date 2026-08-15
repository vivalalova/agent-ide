/**
 * 專案 import specifier → 檔案候選組裝（call-hierarchy、impact、cli 符號查詢、move 共用素材）
 *
 * 四個消費端過去各自把「specifier 屬於 alias／baseUrl／相對／絕對路徑的哪一種」與
 * 「副檔名／index 檔候選要怎麼展開」這兩層邏輯耦合在一起獨立實作，长期下來在細節上
 * 產生偶然漂移：call-hierarchy 用逐副檔名交錯序插入 Set（`foo.ts, foo/index.ts, foo.tsx, ...`），
 * impact/path-resolver 在候選展開之外還多一個「base path 剛好是既有目錄就提前選 index」
 * 的短路分支，兩者都與「全部 direct 副檔名優先於任何 index 副檔名」的 TypeScript 解析
 * 語意不符。本模組把「specifier → 候選路徑清單」這一層收斂成單一來源：只窮舉「可能」
 * 的候選、不在此判斷何者實際存在——是否存在（fs 探測或白名單比對）交給下方兩個對應
 * 消費模式的函式決定，讓候選組裝與存在性判斷保持正交，不再彼此耦合出漂移。
 */

import * as path from 'node:path';
import { findPathAliasMatch, type PathAliasInput } from '@shared/path-alias-resolver.js';
import {
  getImportResolutionExtensions,
  hasRuntimeImportExtensionCandidates,
  SOURCE_FILE_EXTENSIONS
} from '@shared/types/index.js';

export interface ProjectImportResolutionConfig {
  /** TypeScript 路徑別名映射（鍵為別名前綴，值為絕對路徑），未設定視為無別名 */
  readonly pathAliases?: PathAliasInput;
  /** TypeScript baseUrl（絕對路徑），供 bare import 解析 */
  readonly baseUrl?: string;
  /** runtime 已註冊 Parser 支援的原始碼副檔名，未設定回退預設 SOURCE_FILE_EXTENSIONS */
  readonly sourceFileExtensions?: readonly string[];
}

function dedupePreservingOrder(candidates: readonly string[]): string[] {
  return [...new Set(candidates)];
}

/**
 * 把單一 base path 展開成「block 序」副檔名候選：先 base path 本身（與 runtime import
 * 副檔名可映射時的去副檔名版本），再全部 direct 副檔名候選，最後才是全部 index 檔候選。
 * direct 優先於 index 是 TypeScript 解析語意；同一個 base path 內副檔名彼此交錯（如 call-hierarchy
 * 舊實作）或以「base path 剛好是目錄就提前選 index」短路（如 impact/path-resolver 舊實作）
 * 皆為偶然漂移，非刻意設計，此函式即是收斂後的單一權威順序。
 */
function expandExtensionCandidates(
  basePath: string,
  sourceFileExtensions: readonly string[]
): string[] {
  const importExtension = path.extname(basePath);
  const normalizedBasePath = hasRuntimeImportExtensionCandidates(importExtension)
    ? basePath.slice(0, -importExtension.length)
    : basePath;
  const extensions = getImportResolutionExtensions(importExtension, sourceFileExtensions);

  const candidates = [basePath];
  if (normalizedBasePath !== basePath) {
    candidates.push(normalizedBasePath);
  }
  for (const extension of extensions) {
    candidates.push(normalizedBasePath + extension);
  }
  for (const extension of extensions) {
    candidates.push(path.join(normalizedBasePath, `index${extension}`));
  }
  return candidates;
}

/**
 * 統一的「specifier → 候選檔案路徑清單」組裝：
 *
 * - 絕對路徑 specifier：直接展開。
 * - 相對路徑 specifier（`.` 開頭）：相對 fromFile 目錄解析後展開，alias／baseUrl 皆不適用。
 * - bare specifier：alias 候選在前、baseUrl 候選在後——兩者都窮舉（而非「先試 alias、
 *   fs 存在才採用否則試 baseUrl」的耦合式短路判斷），存在性判斷交給呼叫端的
 *   `resolveExistingProjectFile` / `matchProjectFileFromCandidates`，讓「alias 命中但目標檔
 *   不存在時應退回 baseUrl」這種既有 fallback 行為，變成單純的「候選清單裡 baseUrl 候選
 *   排在 alias 候選之後、探測時自然往後找到」，不必在組裝階段就先做 fs 判斷。
 *
 * 找不到任何候選來源（bare specifier 且無 alias 命中、無 baseUrl）時回傳空陣列。
 */
export function resolveProjectImportCandidates(
  specifier: string,
  fromFile: string,
  config: ProjectImportResolutionConfig = {}
): string[] {
  const sourceFileExtensions = config.sourceFileExtensions ?? SOURCE_FILE_EXTENSIONS;

  if (path.isAbsolute(specifier)) {
    return dedupePreservingOrder(expandExtensionCandidates(path.resolve(specifier), sourceFileExtensions));
  }

  if (specifier.startsWith('.')) {
    const basePath = path.resolve(path.dirname(fromFile), specifier);
    return dedupePreservingOrder(expandExtensionCandidates(basePath, sourceFileExtensions));
  }

  const candidates: string[] = [];
  const aliasMatch = findPathAliasMatch(specifier, config.pathAliases ?? {});
  if (aliasMatch) {
    for (const aliasCandidate of aliasMatch.candidates) {
      candidates.push(...expandExtensionCandidates(aliasCandidate, sourceFileExtensions));
    }
  }
  if (config.baseUrl) {
    candidates.push(...expandExtensionCandidates(path.resolve(config.baseUrl, specifier), sourceFileExtensions));
  }
  return dedupePreservingOrder(candidates);
}

/**
 * 逐候選以檔案系統探測，回傳第一個存在的候選（依候選清單順序，即 block 序）；
 * 供 impact/path-resolver、cli/module-file-resolver 使用。`exists` 由呼叫端決定「存在」的
 * 定義（一般應同時檢查 exists 與 isFile，避免候選剛好是既有目錄時被誤判為命中而
 * 提前短路，讓後續真正的 direct/index 候選失去被嘗試的機會）。
 */
export async function resolveExistingProjectFile(
  candidates: readonly string[],
  exists: (candidatePath: string) => Promise<boolean>
): Promise<string | null> {
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * 逐候選比對「已知專案檔案清單」（白名單，非即時 fs 探測），回傳第一個命中的專案檔案
 * 原始路徑；供 call-hierarchy 使用（比對對象是分析範圍內的已知檔案集合，非任意檔案系統）。
 */
export function matchProjectFileFromCandidates(
  candidates: readonly string[],
  projectFiles: readonly string[]
): string | null {
  const projectFilesByResolvedPath = new Map(projectFiles.map(file => [path.resolve(file), file]));
  for (const candidate of candidates) {
    const projectFile = projectFilesByResolvedPath.get(path.resolve(candidate));
    if (projectFile) {
      return projectFile;
    }
  }
  return null;
}
