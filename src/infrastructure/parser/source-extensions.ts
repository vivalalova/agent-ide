import { SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';
import type { ParserRegistry } from './registry.js';

const TYPESCRIPT_DECLARATION_EXTENSIONS = ['.d.ts', '.d.mts', '.d.cts'] as const;

export function getRegisteredSourceFileExtensions(
  registry: ParserRegistry,
  baseExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): readonly string[] {
  const sourceExtensions = new Set(baseExtensions);

  for (const parserInfo of registry.listParsers()) {
    for (const extension of parserInfo.supportedExtensions) {
      if (isTypeScriptDeclarationExtension(extension) && !sourceExtensions.has(extension)) {
        continue;
      }
      sourceExtensions.add(extension);
    }
  }

  return [...sourceExtensions];
}

function isTypeScriptDeclarationExtension(extension: string): boolean {
  return (TYPESCRIPT_DECLARATION_EXTENSIONS as readonly string[]).includes(extension);
}
