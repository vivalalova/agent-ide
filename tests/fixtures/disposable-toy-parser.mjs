import { appendFileSync } from 'node:fs';
import { createParser as createToyParser } from './toy-parser.mjs';

export function createParser() {
  const parser = createToyParser();

  return new Proxy(parser, {
    get(target, property, receiver) {
      if (property === 'name') {
        return 'toy-disposable-worker';
      }

      if (property === 'dispose') {
        return async () => {
          if (process.env.AGENT_IDE_DISPOSE_LOG) {
            appendFileSync(process.env.AGENT_IDE_DISPOSE_LOG, 'disposed\n');
          }
          await target.dispose();
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
