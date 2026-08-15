/**
 * 路徑排除／納入樣式比對共用模組
 *
 * 全專案唯一的 glob 路徑比對權威來源：內部一律委派既有依賴 minimatch（正確、已驗證），
 * 禁止各消費端各自手刻 glob-to-regex 或子字串比對——這類手刻實作曾在多處重複造成同一種
 * 缺陷：`dist/**` 之類的目錄排除樣式退化成子字串匹配，誤傷同前綴的合法目錄（如 `distance`），
 * 或 `**\/*.ts` 之類的副檔名樣式因正則未跳脫字面 `.` 而誤傷 `Xts` 結尾的非 `.ts` 檔名。
 *
 * 例外：`core/deadcode/dead-code-remover.ts` 的 glob 分支刻意保留直接呼叫 minimatch
 * 並帶 `matchBase: true`，讓 `*.spec.ts` 這類無目錄前綴的樣式也能對到巢狀路徑的檔名
 * 部分——這是本模組刻意不提供的語意（`matchesGlobPattern` 對無 `/` 的樣式要求整段路徑
 * 相符，不會自動退化成比對 basename），兩者用途不同，不適合在該處直接替換為本模組。
 */

import { isAbsolute, relative, sep } from 'node:path';
import { minimatch } from 'minimatch';

/**
 * 把待比對路徑相對化到指定 root，供排除／納入樣式比對前使用。
 *
 * 排除／納入樣式須比對「相對於 root 的路徑」，而非絕對路徑——否則 root 的祖先目錄
 * 若含與排除樣式同名的完整 segment（如 root 為 /home/dist/myproj，排除樣式 'dist'
 * 會命中祖先路徑 /home/dist），root 本身會被誤判為位於排除目錄之下，導致整個範圍
 * 的檔案被誤判排除（見 FileScanner.findSourceFiles 與 shouldIndexFile 的呼叫端說明）。
 *
 * 相對化後跳出 root（結果為 '..' 或以 '..' + 分隔符起頭）或仍是絕對路徑（兩者代表
 * filePath 與 root 不同源、無法對齊出 root 內的相對路徑）時，退回原始 filePath 保守
 * 比對；root 未提供（undefined，如呼叫端沒有可用的比對基準）時同樣直接回傳原始
 * filePath。「跳出 root」須以 path segment 精確判斷（不可用字串層級的
 * startsWith('..')，避免誤傷 '..data' 這類字面以 '..' 開頭的合法目錄名，如 K8s
 * ConfigMap/Secret 掛載卷常見的 symlink 目錄）。分隔符用 node:path.sep，跨平台跟隨
 * 本模組既有的 node:path 慣例（win32 為 '\\'、posix 為 '/'）。
 *
 * @param root 比對基準根目錄（如 workspace root 或掃描起點）；undefined 時直接回傳原始 filePath
 * @param filePath 待比對的檔案路徑
 * @returns 可相對化則回傳相對於 root 的路徑，否則回傳原始 filePath
 */
export function relativizeToRoot(root: string | undefined, filePath: string): string {
  if (root === undefined) {
    return filePath;
  }
  const relativePath = relative(root, filePath);
  const escapesRoot = relativePath === '..' || relativePath.startsWith('..' + sep);
  return relativePath !== '' && !escapesRoot && !isAbsolute(relativePath)
    ? relativePath
    : filePath;
}

/**
 * 純目錄／檔案名稱樣式：'name'、'name/**'、'**\/name/**' 三種寫法一律等價，
 * 代表「此名稱在路徑任一層級出現即命中」（本專案 exclude pattern 慣例，如
 * `dist/**` 預期能排除巢狀的 `src/dist/`，而非僅排除專案根目錄下的 `dist/`）。
 */
const PURE_NAME_PATTERN = /^(?:\*\*\/)?([^*?/]+)(?:\/\*\*)?$/;

/**
 * 若 pattern 為純目錄／檔案名稱寫法，回傳該名稱；否則回傳 null（視為一般 glob 樣式）。
 */
function extractPureName(pattern: string): string | null {
  const match = PURE_NAME_PATTERN.exec(pattern);
  return match ? match[1] : null;
}

/**
 * 檢查單一路徑是否匹配「路徑片段」在任一層級的出現，涵蓋兩種情況：
 * 1. 片段本身就是路徑末端（葉節點，如確切檔案路徑 `src/legacy/api.ts`）
 * 2. 片段是中間目錄／路徑前綴，其下還有子樹（如 `src/legacy` 之下的所有檔案）
 *
 * 刻意不透過 minimatch 的 brace expansion（`{a,b}`）組裝這兩種情況，改用兩次
 * 獨立的 minimatch 呼叫取 OR：片段本身可能含逗號等 brace 特殊字元（如合法目錄
 * 名稱 `foo,bar`），若組成 `{**\/${fragment},**\/${fragment}/**}` 字串，片段中的
 * 逗號會被誤當成 brace 分隔符展開成不相干的選項，讓比對語意整個失真
 * （見 P3-2 regression）。片段可能含 '/'（多層路徑，如 P2-A 的精確檔案路徑
 * 排除樣式），逐字面比對，不受影響。
 *
 * 同理，fragment 本身可能字面就是 brace 語法（如合法目錄名稱 `{a,b}`）：兩次
 * minimatch 呼叫都帶 `nobrace: true` 關閉 brace-expansion，讓 `{`、`}`、`,` 在
 * fragment 中一律視為字面字元比對，而非語法符號展開成 alternation（見「brace
 * 字面目錄名」regression：不加此選項時 `{a,b}` 會被誤展開成「a 或 b」）。
 *
 * @param filePath 檔案路徑（相對或絕對皆可）
 * @param fragment 路徑片段（單一名稱或多層路徑，可含尾斜線／前導 `./`／前導 `/`，會自動正規化）
 * @returns 是否匹配
 */
export function matchesPathFragment(filePath: string, fragment: string): boolean {
  // fragment 正規化：去尾斜線，並一併去除前導的 `./`（含多重 `././`）與前導 `/`。
  // 只去尾斜線不足以涵蓋帶前導 `./` 的片段（如使用者以 `./src/legacy/api.ts`
  // 描述路徑）：組出的 `**/./src/legacy/api.ts` 中，minimatch 不會把 `**/.` 的 `.`
  // 當「當前目錄」折疊掉，兩個組合樣式都無法命中任何實際路徑。前導 `/`（絕對路徑
  // 片段）原本僅靠 `**//abs` 的雙斜線意外命中，去除後改以乾淨的 `**/abs/...` 命中，
  // 語意等價且不再依賴巧合。
  const normalizedFragment = fragment
    .replace(/\/+$/, '')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
  try {
    return minimatch(filePath, `**/${normalizedFragment}`, { dot: true, nobrace: true }) ||
      minimatch(filePath, `**/${normalizedFragment}/**`, { dot: true, nobrace: true });
  } catch {
    // graceful-degradation: 無效 glob pattern 視為不匹配
    return false;
  }
}

/**
 * 檢查單一路徑是否匹配指定 glob 樣式
 *
 * @param filePath 檔案路徑（相對或絕對皆可）
 * @param pattern glob 樣式
 * @returns 是否匹配
 */
export function matchesGlobPattern(filePath: string, pattern: string): boolean {
  const pureName = extractPureName(pattern);
  // 純名稱樣式委派 matchesPathFragment，同時涵蓋「名稱本身就是路徑末端（葉節點，
  // 如檔案）」與「名稱是中間目錄、其下還有子樹」兩種情況（見 P3-5 regression）。
  if (pureName !== null) {
    return matchesPathFragment(filePath, pureName);
  }

  try {
    return minimatch(filePath, pattern, { dot: true });
  } catch {
    // graceful-degradation: 無效 glob pattern 視為不匹配
    return false;
  }
}

/**
 * 檢查路徑是否匹配任一 glob 樣式
 *
 * @param filePath 檔案路徑
 * @param patterns glob 樣式列表
 * @returns 是否匹配任一樣式
 */
export function matchesAnyGlobPattern(filePath: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => matchesGlobPattern(filePath, pattern));
}

/**
 * 檢查單一路徑段（如目錄走訪時的 entry.name）是否精確匹配任一樣式代表的名稱。
 * 用於逐層目錄走訪時的排除判斷：僅需名稱精確相等，禁止子字串誤判
 * （如樣式 `dist` 不應誤傷目錄名稱 `distance`）。
 *
 * @param name 單一路徑段名稱（目錄或檔案的 basename）
 * @param patterns 純目錄／檔案名稱樣式列表
 * @returns 是否有樣式精確匹配此名稱
 */
export function matchesPathSegment(name: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => extractPureName(pattern) === name);
}
