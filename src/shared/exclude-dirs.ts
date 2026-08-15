/**
 * 通用排除目錄
 *
 * 兩份清單語意不同，禁互相取代：
 *
 * - `COMMON_EXCLUDE_DIR_NAMES`：廣清單，供唯讀/索引/效能導向掃描使用
 *   （indexing、impact、cycles、parser 檔案探索等）。目的是效能與雜訊過濾，
 *   誤排除頂多讓查詢結果少列一些檔案，不影響正確性。
 * - `MUTATION_SCAN_EXCLUDE_DIR_NAMES`：窄清單，供變更類命令（rename、move、
 *   change-signature、move-member）的「引用掃描」使用。目的是正確性——
 *   誤排除會讓真實原始碼目錄（如專案內剛好命名為 build/out/ 的目錄）被
 *   靜默跳過，導致引用未同步更新仍回報 success。此清單僅收錄各消費端
 *   統一前即一致排除的安全交集（node_modules/.git/dist/coverage），
 *   禁再併入 build/out/.next/.cache 等常見但不保證為建置產物的名稱。
 */
export const COMMON_EXCLUDE_DIR_NAMES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
  '.cache',
  '.turbo'
] as const;

/**
 * 變更類命令引用掃描專用的窄排除清單，見上方模組註解。
 */
export const MUTATION_SCAN_EXCLUDE_DIR_NAMES = [
  'node_modules',
  '.git',
  'dist',
  'coverage'
] as const;
