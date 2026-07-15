/**
 * Source file extension definitions shared by CLI indexing, parsing, impact, and move flows.
 */

export const TYPESCRIPT_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;
export const TYPESCRIPT_PARSER_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.d.mts', '.d.cts'] as const;
export const JAVASCRIPT_SOURCE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'] as const;
export const SOURCE_FILE_EXTENSIONS = [
  ...TYPESCRIPT_SOURCE_EXTENSIONS,
  ...JAVASCRIPT_SOURCE_EXTENSIONS
] as const;
export const SOURCE_INDEX_FILES = SOURCE_FILE_EXTENSIONS.map(extension => `/index${extension}`);

const RUNTIME_IMPORT_EXTENSION_CANDIDATES: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.ts', '.tsx', '.js', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs']
};

export function isTypeScriptSourceExtension(extension: string): boolean {
  return (TYPESCRIPT_SOURCE_EXTENSIONS as readonly string[]).includes(extension);
}

export function isJavaScriptSourceExtension(extension: string): boolean {
  return (JAVASCRIPT_SOURCE_EXTENSIONS as readonly string[]).includes(extension);
}

export function isSourceFileExtension(
  extension: string,
  sourceExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): boolean {
  return sourceExtensions.includes(extension);
}

export function stripSourceFileExtension(
  filePath: string,
  sourceExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): string {
  const extension = sourceExtensions.find(sourceExtension => filePath.endsWith(sourceExtension));
  return extension ? filePath.slice(0, -extension.length) : filePath;
}

export function getSourceLanguage(extension: string): string | undefined {
  if (isTypeScriptSourceExtension(extension)) {
    return 'typescript';
  }

  if (isJavaScriptSourceExtension(extension)) {
    return 'javascript';
  }

  return undefined;
}

export function hasRuntimeImportExtensionCandidates(importExtension: string): boolean {
  return Object.prototype.hasOwnProperty.call(RUNTIME_IMPORT_EXTENSION_CANDIDATES, importExtension);
}

export function getImportResolutionExtensions(
  importExtension: string,
  sourceExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): readonly string[] {
  return RUNTIME_IMPORT_EXTENSION_CANDIDATES[importExtension] ?? sourceExtensions;
}
