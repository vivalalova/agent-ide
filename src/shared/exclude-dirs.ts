/**
 * 通用排除目錄
 *
 * 全域唯一權威清單：任何需要跳過 node_modules/建置輸出/快取目錄的呼叫端
 * （遞迴目錄走訪逐層比對目錄名稱、或組成 glob pattern 給 parser 層比對）
 * 皆應引用此清單，禁另行複製一份同款目錄名稱陣列。
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
