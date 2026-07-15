/**
 * Shared TypeScript path-alias model and resolution rules.
 *
 * The loader keeps every tsconfig mapping as an entry.  In particular, an exact
 * `@pkg` mapping and a wildcard `@pkg/*` mapping are different entries even
 * though their normalized alias text is the same.
 */

import * as path from 'node:path';
import {
  getImportResolutionExtensions,
  hasRuntimeImportExtensionCandidates,
  SOURCE_FILE_EXTENSIONS
} from './types/source-file-extensions.js';

export interface PathAliasEntry {
  readonly alias: string;
  readonly wildcard: boolean;
  readonly candidates: readonly string[];
}

/**
 * Structured aliases also expose the old string properties as a compatibility
 * projection.  The non-enumerable `entries` property is the only authority used
 * by this module; the string projection exists solely for old callers that read
 * `pathAliases['@']` directly.
 */
export interface PathAliasMap {
  readonly entries: readonly PathAliasEntry[];
  readonly [legacyAlias: string]: string | readonly PathAliasEntry[];
}

export type PathAliasInput = PathAliasMap | Readonly<Record<string, string>>;

type LegacyProjection = 'first' | 'last';

function isPathAliasMap(value: PathAliasInput): value is PathAliasMap {
  return Array.isArray((value as Partial<PathAliasMap>).entries);
}

function createMap(
  entries: readonly PathAliasEntry[],
  legacyProjection: LegacyProjection = 'first'
): PathAliasMap {
  const legacyAliases: Record<string, string> = {};

  for (const entry of entries) {
    const candidate = legacyProjection === 'last'
      ? entry.candidates[entry.candidates.length - 1]
      : entry.candidates[0];
    if (candidate === undefined) {
      continue;
    }

    // Exact mappings are the useful legacy value when both forms share an alias.
    // Wildcard-only mappings still expose the normalized alias for old callers.
    if (entry.wildcard && Object.prototype.hasOwnProperty.call(legacyAliases, entry.alias)) {
      continue;
    }
    legacyAliases[entry.alias] = candidate;
  }

  const result = { ...legacyAliases } as PathAliasMap;
  Object.defineProperty(result, 'entries', {
    value: Object.freeze(entries.map(entry => ({
      alias: entry.alias,
      wildcard: entry.wildcard,
      candidates: Object.freeze([...entry.candidates])
    }))),
    enumerable: false,
    writable: false,
    configurable: false
  });
  return result;
}

function normalizeLegacyEntries(
  aliases: Readonly<Record<string, string>>,
  wildcardByDefault: boolean
): PathAliasEntry[] {
  const rawKeys = Object.keys(aliases);
  const entries: PathAliasEntry[] = [];

  for (const rawAlias of rawKeys) {
    const rawCandidate = aliases[rawAlias];
    if (typeof rawCandidate !== 'string') {
      continue;
    }

    const wildcard = rawAlias.endsWith('/*') || wildcardByDefault;
    const alias = rawAlias.replace(/\/\*$/, '');
    entries.push({
      alias,
      wildcard,
      candidates: [rawCandidate]
    });
  }

  return entries;
}

/** Build the structured model from already-normalized alias paths. */
export function createPathAliasMap(
  aliases: Readonly<Record<string, string>>,
  wildcardAliases: ReadonlySet<string> = new Set()
): PathAliasMap {
  return createMap(
    normalizeLegacyEntries(aliases, false).map(entry => ({
      ...entry,
      wildcard: wildcardAliases.has(entry.alias) || entry.wildcard
    }))
  );
}

/**
 * Build the structured model from raw tsconfig entries.  `mappedPaths` are
 * already absolute and retain tsconfig declaration order.
 */
export function createStructuredPathAliasMap(entries: readonly PathAliasEntry[]): PathAliasMap {
  return createMap(entries);
}

/**
 * Convert a legacy record into the wildcard-compatible model used by move and
 * dead-code APIs whose historical contract treated every supplied alias as a
 * prefix mapping.
 */
export function withLegacyPathAliasWildcards(aliases: PathAliasInput): PathAliasMap {
  if (isPathAliasMap(aliases)) {
    return aliases;
  }
  return createMap(normalizeLegacyEntries(aliases, true));
}

/** Merge entries by alias + wildcard kind; the last map wins for one mapping kind. */
export function mergePathAliasMaps(...maps: readonly PathAliasInput[]): PathAliasMap {
  const merged = new Map<string, PathAliasEntry>();
  for (const map of maps) {
    for (const entry of getPathAliasEntries(map)) {
      merged.set(`${entry.alias}\u0000${entry.wildcard ? 'wildcard' : 'exact'}`, entry);
    }
  }
  return createMap([...merged.values()]);
}

/** Return the structured entries for either the new model or a legacy record. */
export function getPathAliasEntries(pathAliases: PathAliasInput): readonly PathAliasEntry[] {
  if (isPathAliasMap(pathAliases)) {
    return pathAliases.entries;
  }

  const entries = normalizeLegacyEntries(pathAliases, false);
  // The old public `@` alias is conventionally a prefix alias.  Other plain
  // records retain exact matching for the pre-structured API's exact-alias rule.
  return entries.map(entry => entry.alias === '@' ? { ...entry, wildcard: true } : entry);
}

export interface PathAliasMatch {
  readonly entry: PathAliasEntry;
  readonly remainder: string;
  readonly candidates: readonly string[];
}

export function findPathAliasMatch(
  specifier: string,
  pathAliases: PathAliasInput
): PathAliasMatch | null {
  const matches = getPathAliasEntries(pathAliases)
    .map(entry => {
      if (entry.wildcard) {
        const prefix = `${entry.alias}/`;
        return specifier.startsWith(prefix) && specifier.length > prefix.length
          ? { entry, remainder: specifier.slice(prefix.length) }
          : null;
      }
      return specifier === entry.alias ? { entry, remainder: '' } : null;
    })
    .filter((match): match is { entry: PathAliasEntry; remainder: string } => match !== null)
    .sort((left, right) => {
      const aliasLength = right.entry.alias.length - left.entry.alias.length;
      if (aliasLength !== 0) {
        return aliasLength;
      }
      return Number(left.entry.wildcard) - Number(right.entry.wildcard);
    });

  const match = matches[0];
  return match
    ? { ...match, candidates: candidatePaths(match) }
    : null;
}

function matchingEntries(specifier: string, pathAliases: PathAliasInput): PathAliasMatch[] {
  const matches: PathAliasMatch[] = [];
  for (const entry of getPathAliasEntries(pathAliases)) {
    if (entry.wildcard) {
      const prefix = `${entry.alias}/`;
      if (specifier.startsWith(prefix) && specifier.length > prefix.length) {
        matches.push({
          entry,
          remainder: specifier.slice(prefix.length),
          candidates: candidatePaths({ entry, remainder: specifier.slice(prefix.length) })
        });
      }
      continue;
    }
    if (specifier === entry.alias) {
      matches.push({ entry, remainder: '', candidates: [...entry.candidates] });
    }
  }
  return matches.sort((left, right) => {
    const aliasLength = right.entry.alias.length - left.entry.alias.length;
    if (aliasLength !== 0) {
      return aliasLength;
    }
    return Number(left.entry.wildcard) - Number(right.entry.wildcard);
  });
}

function candidatePaths(
  match: { entry: PathAliasEntry; remainder: string }
): readonly string[] {
  return match.entry.candidates.map(candidate => match.entry.wildcard
    ? path.join(candidate, match.remainder)
    : candidate);
}

/**
 * Resolve an alias without I/O.  This is used by synchronous consumers that
 * only need the declaration-order candidate base path.  Consumers with a file
 * system should use `resolveBarePathAliasAsync` so fallback selection is based
 * on the concrete target, not on a directory scan performed by the loader.
 */
export function resolveBarePathAlias(
  specifier: string,
  pathAliases: PathAliasInput,
  exists?: (candidatePath: string) => boolean
): string | null {
  for (const match of matchingEntries(specifier, pathAliases)) {
    for (const candidate of match.candidates) {
      if (!exists || targetExistsSync(candidate, exists)) {
        return candidate;
      }
    }
  }
  return null;
}

export type PathAliasExists = (candidatePath: string) => boolean | Promise<boolean>;

function targetExistsSync(
  candidate: string,
  exists: (candidatePath: string) => boolean,
  extensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): boolean {
  const importExtension = path.extname(candidate);
  const normalizedCandidate = hasRuntimeImportExtensionCandidates(importExtension)
    ? candidate.slice(0, -importExtension.length)
    : candidate;
  const resolutionExtensions = getImportResolutionExtensions(importExtension, extensions);
  if (exists(normalizedCandidate)) {
    return true;
  }

  return resolutionExtensions.some(extension =>
    exists(`${normalizedCandidate}${extension}`)
    || exists(path.join(normalizedCandidate, `index${extension}`))
  );
}

async function targetExists(
  candidate: string,
  exists: PathAliasExists,
  extensions: readonly string[]
): Promise<boolean> {
  if (await exists(candidate)) {
    return true;
  }

  for (const extension of extensions) {
    if (await exists(`${candidate}${extension}`) || await exists(path.join(candidate, `index${extension}`))) {
      return true;
    }
  }

  return false;
}

/** Resolve candidates in declaration order using actual target-file existence. */
export async function resolveBarePathAliasAsync(
  specifier: string,
  pathAliases: PathAliasInput,
  exists: PathAliasExists,
  extensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): Promise<string | null> {
  for (const match of matchingEntries(specifier, pathAliases)) {
    for (const candidate of match.candidates) {
      const importExtension = path.extname(candidate);
      const normalizedCandidate = hasRuntimeImportExtensionCandidates(importExtension)
        ? candidate.slice(0, -importExtension.length)
        : candidate;
      const resolutionExtensions = getImportResolutionExtensions(importExtension, extensions);
      if (await targetExists(normalizedCandidate, exists, resolutionExtensions)) {
        return candidate;
      }
    }
  }
  return null;
}
