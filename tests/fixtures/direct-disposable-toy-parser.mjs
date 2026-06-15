import { appendFileSync } from 'node:fs';
import { createParser as createToyParser } from './toy-parser.mjs';

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
