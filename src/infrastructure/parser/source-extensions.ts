import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';
import type { ParserRegistry } from './registry.js';

export function getRegisteredSourceFileExtensions(
  registry: ParserRegistry,
  baseExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): readonly string[] {
  const sourceExtensions = new Set(baseExtensions);

  for (const parserInfo of registry.listParsers()) {
    for (const extension of parserInfo.supportedExtensions) {
      sourceExtensions.add(extension);
    }
  }

  return [...sourceExtensions];
}
