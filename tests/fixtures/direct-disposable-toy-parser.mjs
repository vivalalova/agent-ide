import { appendFileSync } from 'node:fs';
import { createParser as createToyParser } from './toy-parser.mjs';

// 模組頂層程式碼：Node ESM loader 每對一個相異 query string 做一次 import 就會
// 執行一次此處（模組具名快取，同一 query string 之後的 import 走快取、不重跑頂層）。
// 用來讓 regression test 驗證「同一 worker 生命週期內，模組只被 evaluate 一次」，
// 而非每個 task 都用全新 query string 重新 import 出一個永遠不會被回收的新實例。
if (process.env.AGENT_IDE_DIRECT_LOAD_LOG) {
  appendFileSync(process.env.AGENT_IDE_DIRECT_LOAD_LOG, 'loaded\n');
}

const parser = createToyParser();
let disposed = false;

export default new Proxy(parser, {
  get(target, property, receiver) {
    if (property === 'name') {
      return 'toy-direct-disposable-worker';
    }

    if (property === 'parse') {
      return async (...args) => {
        if (disposed) {
          throw new Error('disposed parser reused');
        }
        return target.parse(...args);
      };
    }

    if (property === 'dispose') {
      return async () => {
        disposed = true;
        if (process.env.AGENT_IDE_DIRECT_DISPOSE_LOG) {
          appendFileSync(process.env.AGENT_IDE_DIRECT_DISPOSE_LOG, 'direct disposed\n');
        }
        await target.dispose();
      };
    }

    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
