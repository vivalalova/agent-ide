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
} from './string';

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
} from './array';

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
} from './path';

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
} from './object';

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
} from './async';

/**
 * 工具函式分類命名空間
 * 
 * 如果你偏好使用命名空間的方式來組織工具函式，
 * 可以使用以下匯入方式：
 * 
 * @example
 * ```typescript
 * import { StringUtils, ArrayUtils } from '@/shared/utils';
 * 
 * const result = StringUtils.camelCase('hello-world');
 * const chunks = ArrayUtils.chunk([1, 2, 3, 4], 2);
 * ```
 */

import * as StringUtils from './string';
import * as ArrayUtils from './array';
import * as PathUtils from './path';
import * as ObjectUtils from './object';
import * as AsyncUtils from './async';

export {
  StringUtils,
  ArrayUtils,
  PathUtils,
  ObjectUtils,
  AsyncUtils
};