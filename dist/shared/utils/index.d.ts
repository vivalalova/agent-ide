/**
 * Agent IDE 工具函式庫統一匯出
 *
 * 本模組提供了一整套通用工具函式，涵蓋字串處理、陣列操作、
 * 路徑處理、物件操作和異步處理等常用功能。
 */
export { capitalize, camelCase, snakeCase, kebabCase, truncate, padStart, padEnd, stripIndent, escapeRegExp, template, slugify } from './string.js';
export { chunk, flatten, unique, difference, intersection, partition, groupBy, sortBy, shuffle, compact } from './array.js';
export { isAbsolute, normalize, relative, changeExtension, ensureExtension, getFileNameWithoutExt, isSubPath, toUnixPath, toWindowsPath } from './path.js';
export { deepClone, deepMerge, pick, omit, isEmpty, isEqual, set, get, has, mapValues } from './object.js';
export { sleep, retry, timeout, debounce, throttle, parallel, sequential, race, queue, batch } from './async.js';
/**
 * 工具函式分類命名空間
 *
 * 如果你偏好使用命名空間的方式來組織工具函式，
 * 可以使用以下匯入方式：
 *
 * @example
 * ```typescript
 * import { StringUtils, ArrayUtils } from './index.js';
 *
 * const result = StringUtils.camelCase('hello-world');
 * const chunks = ArrayUtils.chunk([1, 2, 3, 4], 2);
 * ```
 */
import * as StringUtils from './string.js';
import * as ArrayUtils from './array.js';
import * as PathUtils from './path.js';
import * as ObjectUtils from './object.js';
import * as AsyncUtils from './async.js';
export { StringUtils, ArrayUtils, PathUtils, ObjectUtils, AsyncUtils };
//# sourceMappingURL=index.d.ts.map