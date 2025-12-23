/**
 * Agent IDE 工具函式庫統一匯出
 *
 * 本模組提供了一整套通用工具函式，涵蓋字串處理、陣列操作、
 * 路徑處理、物件操作和異步處理等常用功能。
 */

// 字串工具函式
export {
  capitalize,
  camelCase,
  snakeCase,
  kebabCase,
  truncate,
  padStart,
  padEnd,
  stripIndent,
  escapeRegExp,
  template,
  slugify
} from './string.js';

// 陣列工具函式
export {
  chunk,
  flatten,
  unique,
  difference,
  intersection,
  partition,
  groupBy,
  sortBy,
  shuffle,
  compact
} from './array.js';

// 路徑工具函式
export {
  isAbsolute,
  normalize,
  relative,
  changeExtension,
  ensureExtension,
  getFileNameWithoutExt,
  isSubPath,
  toUnixPath,
  toWindowsPath
} from './path.js';

// 物件工具函式
export {
  deepClone,
  deepMerge,
  pick,
  omit,
  isEmpty,
  isEqual,
  set,
  get,
  has,
  mapValues
} from './object.js';

// 異步工具函式
export {
  sleep,
  retry,
  timeout,
  debounce,
  throttle,
  parallel,
  sequential,
  race,
  queue,
  batch
} from './async.js';

