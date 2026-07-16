/**
 * tsconfig.json 載入器
 * 提供向上查找 tsconfig.json 並解析 path aliases 的功能
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { logger } from '@infrastructure/logging/index.js';
import { isFileNotFoundError } from '@shared/errors/index.js';
import {
  createStructuredPathAliasMap,
  getPathAliasEntries,
  mergePathAliasMaps,
  type PathAliasMap
} from '@shared/path-alias-resolver.js';

/** tsconfig 路徑設定 */
export interface TsconfigPathConfig {
  /** 結構化 path aliases；entries 保留 wildcard 與所有候選路徑。 */
  pathAliases: PathAliasMap;
  /** baseUrl 絕對路徑 */
  baseUrl?: string;
  /** tsconfig.json 所在目錄 */
  tsconfigDir?: string;
}

interface TsconfigFile {
  extends?: string | string[];
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, unknown>;
  };
}

/** tsconfig 查找結果 */
interface TsconfigLocation {
  tsconfigPath: string;
  tsconfigDir: string;
}

const TSCONFIG_EXTENSION = '.json';
const NODE_MODULES_DIR = 'node_modules';
const PACKAGE_JSON_FILE = 'package.json';
const TSCONFIG_FILE = 'tsconfig.json';

interface PackageExtendsSpec {
  packageName: string;
  configPath?: string;
}

/**
 * tsconfig extends 循環偵測到的錯誤
 *
 * 與「tsconfig.json 不存在」可優雅回空不同，extends 循環代表設定本身邏輯矛盾
 * （fast-fail 原則）：呼叫端必須明確得知此錯誤，不可被靜默吞掉後退化成
 * 「專案沒有任何 path alias」的空設定，否則 rename/impact 等命令會誤判為零 alias，
 * 漏掉所有透過該 alias 匯入的消費端。
 */
export class CircularTsconfigExtendsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircularTsconfigExtendsError';
  }
}

/**
 * tsconfig 檔案存在但無法解析（JSON 語法錯誤、結構損壞等）的錯誤。
 *
 * 與「專案沒有 tsconfig」不同：無檔可回空 pathAliases；壞檔必須可觀測，
 * 不得 silent empty 與無檔不可區分，否則 path-alias 消費端會被漏改卻報 success。
 */
export class InvalidTsconfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTsconfigError';
  }
}

function parseTsconfig(tsconfigPath: string, content: string): TsconfigFile {
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, content);
  if (parsed.error) {
    throw new InvalidTsconfigError(
      `Invalid tsconfig.json at ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n')}`
    );
  }

  return parsed.config as TsconfigFile;
}

async function isExistingFile(filePath: string, fileSystem: IFileSystem): Promise<boolean> {
  return await fileSystem.exists(filePath) && await fileSystem.isFile(filePath);
}

async function resolveConfigFileCandidate(
  candidatePath: string,
  fileSystem: IFileSystem
): Promise<string | null> {
  if (await isExistingFile(candidatePath, fileSystem)) {
    return candidatePath;
  }

  if (!candidatePath.endsWith(TSCONFIG_EXTENSION)) {
    const jsonCandidate = `${candidatePath}${TSCONFIG_EXTENSION}`;
    if (await isExistingFile(jsonCandidate, fileSystem)) {
      return jsonCandidate;
    }
  }

  return null;
}

function parsePackageExtendsSpec(extendedPath: string): PackageExtendsSpec | null {
  const parts = extendedPath.split('/').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  if (extendedPath.startsWith('@')) {
    if (parts.length < 2) {
      return null;
    }

    return {
      packageName: `${parts[0]}/${parts[1]}`,
      configPath: parts.slice(2).join('/') || undefined
    };
  }

  return {
    packageName: parts[0],
    configPath: parts.slice(1).join('/') || undefined
  };
}

async function resolvePackageRootConfig(
  packageRoot: string,
  fileSystem: IFileSystem
): Promise<string | null> {
  const packageJsonPath = path.join(packageRoot, PACKAGE_JSON_FILE);
  if (await isExistingFile(packageJsonPath, fileSystem)) {
    try {
      const content = await fileSystem.readFile(packageJsonPath, 'utf-8') as string;
      const packageJson = JSON.parse(content) as { tsconfig?: unknown };
      if (typeof packageJson.tsconfig === 'string') {
        const tsconfigPath = path.resolve(packageRoot, packageJson.tsconfig);
        const resolvedTsconfig = await resolveConfigFileCandidate(tsconfigPath, fileSystem);
        if (resolvedTsconfig) {
          return resolvedTsconfig;
        }
      }
    } catch (error) {
      logger.warn('tsconfig-loader', `Failed to read package tsconfig field: ${error}`);
    }
  }

  return resolveConfigFileCandidate(path.join(packageRoot, TSCONFIG_FILE), fileSystem);
}

async function resolvePackageExtendsPath(
  extendedPath: string,
  tsconfigDir: string,
  fileSystem: IFileSystem
): Promise<string | null> {
  const packageSpec = parsePackageExtendsSpec(extendedPath);
  if (!packageSpec) {
    return null;
  }

  let currentDir = path.resolve(tsconfigDir);
  const root = path.parse(currentDir).root;

  while (true) {
    const packageRoot = path.join(currentDir, NODE_MODULES_DIR, packageSpec.packageName);
    if (await fileSystem.exists(packageRoot)) {
      if (packageSpec.configPath) {
        const configPath = path.join(packageRoot, packageSpec.configPath);
        const resolvedConfig = await resolveConfigFileCandidate(configPath, fileSystem);
        if (resolvedConfig) {
          return resolvedConfig;
        }
      } else {
        const resolvedConfig = await resolvePackageRootConfig(packageRoot, fileSystem);
        if (resolvedConfig) {
          return resolvedConfig;
        }
      }
    }

    if (currentDir === root) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

async function resolveExtendsPath(
  extendedPath: string,
  tsconfigDir: string,
  fileSystem: IFileSystem
): Promise<string | null> {
  if (extendedPath.startsWith('.') || path.isAbsolute(extendedPath)) {
    const candidate = path.isAbsolute(extendedPath)
      ? extendedPath
      : path.resolve(tsconfigDir, extendedPath);
    return resolveConfigFileCandidate(candidate, fileSystem);
  }

  return resolvePackageExtendsPath(extendedPath, tsconfigDir, fileSystem);
}

function resolvePathAliases(
  paths: Record<string, unknown>,
  basePath: string
): PathAliasMap {
  const aliases = [];

  for (const [alias, mappedPaths] of Object.entries(paths)) {
    if (!Array.isArray(mappedPaths)) {
      continue;
    }

    const candidates = mappedPaths
      .filter((mappedPath): mappedPath is string => typeof mappedPath === 'string')
      .map(mappedPath => mappedPath.replace(/\/\*$/, ''));
    if (candidates.length === 0) {
      continue;
    }

    aliases.push({
      alias: alias.replace(/\/\*$/, ''),
      wildcard: alias.endsWith('/*'),
      candidates: candidates.map(candidate => path.resolve(basePath, candidate))
    });
  }

  return createStructuredPathAliasMap(aliases);
}

async function loadResolvedTsconfigPathConfig(
  tsconfigPath: string,
  fileSystem: IFileSystem,
  visited = new Set<string>()
): Promise<TsconfigPathConfig> {
  const resolvedTsconfigPath = path.resolve(tsconfigPath);
  if (visited.has(resolvedTsconfigPath)) {
    throw new CircularTsconfigExtendsError(`Circular tsconfig extends detected: ${resolvedTsconfigPath}`);
  }
  visited.add(resolvedTsconfigPath);

  const tsconfigDir = path.dirname(resolvedTsconfigPath);
  const tsconfigContent = await fileSystem.readFile(resolvedTsconfigPath, 'utf-8') as string;
  const tsconfig = parseTsconfig(resolvedTsconfigPath, tsconfigContent);
  const config: TsconfigPathConfig = { pathAliases: createStructuredPathAliasMap([]), tsconfigDir };
  const extendedConfigs = Array.isArray(tsconfig.extends)
    ? tsconfig.extends
    : tsconfig.extends ? [tsconfig.extends] : [];

  for (const extendedPath of extendedConfigs) {
    const resolvedExtends = await resolveExtendsPath(extendedPath, tsconfigDir, fileSystem);
    if (!resolvedExtends) {
      logger.warn('tsconfig-loader', `Unsupported or missing tsconfig extends: ${extendedPath}`);
      continue;
    }

    const inheritedConfig = await loadResolvedTsconfigPathConfig(resolvedExtends, fileSystem, new Set(visited));
    config.pathAliases = mergePathAliasMaps(config.pathAliases, inheritedConfig.pathAliases);
    if (inheritedConfig.baseUrl) {
      config.baseUrl = inheritedConfig.baseUrl;
    }
  }

  const compilerOptions = tsconfig.compilerOptions;
  if (!compilerOptions) {
    return config;
  }

  if (compilerOptions.baseUrl) {
    config.baseUrl = path.resolve(tsconfigDir, compilerOptions.baseUrl);
  }

  if (compilerOptions.paths) {
    const basePath = config.baseUrl ?? tsconfigDir;
    config.pathAliases = resolvePathAliases(compilerOptions.paths, basePath);
  }

  return config;
}

/**
 * 向上查找 tsconfig.json
 * 從指定目錄開始，逐層向上查找直到找到 tsconfig.json 或到達根目錄
 *
 * @param startDir 起始目錄
 * @param fileSystem 檔案系統
 * @returns tsconfig 位置，若未找到則返回 null
 */
export async function findTsconfigUp(
  startDir: string,
  fileSystem: IFileSystem
): Promise<TsconfigLocation | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    if (await fileSystem.exists(tsconfigPath)) {
      return { tsconfigPath, tsconfigDir: currentDir };
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * 讀取 tsconfig.json 路徑設定（包含 paths 和 baseUrl）
 * 會向上查找 tsconfig.json，以支援 --path 指向子目錄的情況
 *
 * @param projectRoot 專案根目錄（或子目錄）
 * @param fileSystem 檔案系統
 * @returns tsconfig 路徑設定
 */
export async function loadTsconfigPathConfig(
  projectRoot: string,
  fileSystem: IFileSystem
): Promise<TsconfigPathConfig> {
  const empty: TsconfigPathConfig = { pathAliases: createStructuredPathAliasMap([]) };

  // 向上查找 tsconfig.json；無檔 → 空設定合法
  const found = await findTsconfigUp(projectRoot, fileSystem);
  if (!found) {
    return empty;
  }

  const cache = getTsconfigCache(fileSystem);
  const cacheKey = path.resolve(found.tsconfigPath);
  const cached = cache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const loading = loadResolvedTsconfigPathConfig(found.tsconfigPath, fileSystem);
  const cachedLoading = loading.catch(error => {
    if (cache.get(cacheKey) === cachedLoading) {
      cache.delete(cacheKey);
    }
    throw error;
  });
  cache.set(cacheKey, cachedLoading);

  try {
    return await cachedLoading;
  } catch (error) {
    // 無檔／競態刪除／exists 與 read 不一致 → 空 alias 合法（與「沒找到 tsconfig」同語意）
    // 含正式 FileNotFoundError、ENOENT，以及 mock FS 的 plain Error("File not found: …")
    if (isMissingTsconfigFileError(error)) {
      return empty;
    }
    // 檔案存在但內容非法（JSON 語法錯誤／結構損壞）或 extends 循環：必須可觀測
    // （throw），不得 silent empty 與「無 tsconfig」不可區分（見 F26 regression：
    // rename/impact 等命令會誤判為零 alias，漏掉所有透過該 alias 匯入的消費端）。
    // 呼叫端若要在「壞掉但存在」時優雅降級繼續執行，改呼叫本檔匯出的
    // loadTsconfigPathConfigOrWarn，不得在此處吞掉——確保這裡永遠可觀測。
    if (error instanceof CircularTsconfigExtendsError || error instanceof InvalidTsconfigError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidTsconfigError(`Failed to load tsconfig.json at ${found.tsconfigPath}: ${message}`);
  }
}

/** 載入 tsconfig 時視為「檔案不存在」→ 可回空 alias 的錯誤 */
function isMissingTsconfigFileError(error: unknown): boolean {
  if (isFileNotFoundError(error)) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  // FileNotFoundError / 常見 mock 訊息：`File not found: <path>`
  return /^File not found:/i.test(error.message);
}

/**
 * loadTsconfigPathConfig 的優雅降級版本，供唯讀／變更類 CLI 命令使用
 * （move/impact/rename/cycles/change-signature/deadcode 皆直接呼叫、無自己的
 * try/catch）：tsconfig.json 存在但 JSON 語法錯誤／結構損壞時，僅 warn 並回空
 * pathAliases 繼續執行，不中斷整條 CLI 指令（見既有 regression：
 * cli-move-tsconfig-lookup.e2e.test.ts／cli-impact-tsconfig-lookup.e2e.test.ts
 * 的「tsconfig.json 解析錯誤時應該優雅降級」）。
 *
 * extends 循環（CircularTsconfigExtendsError）刻意不在此吞掉、原樣拋出：
 * 循環代表設定本身邏輯矛盾，非「壞掉但仍可忽略」的單純解析錯誤。
 *
 * loadTsconfigPathConfig 本身維持 fast-fail（見 F26 regression：raw loader
 * 必須可觀測，禁止 silent empty 與「無 tsconfig」不可區分）；本函式是唯一
 * 允許在 InvalidTsconfigError 上優雅降級的地方，呼叫端一律引用此處、禁止
 * 各自重複 try/catch（Single Source of Truth）。
 */
export async function loadTsconfigPathConfigOrWarn(
  projectRoot: string,
  fileSystem: IFileSystem
): Promise<TsconfigPathConfig> {
  try {
    return await loadTsconfigPathConfig(projectRoot, fileSystem);
  } catch (error) {
    if (error instanceof InvalidTsconfigError) {
      logger.warn('tsconfig-loader', `Ignoring invalid tsconfig.json path aliases: ${error.message}`);
      return { pathAliases: createStructuredPathAliasMap([]) };
    }
    throw error;
  }
}

/**
 * 簡化版：只取得 path aliases（向後相容）
 *
 * @param projectRoot 專案根目錄（或子目錄）
 * @param fileSystem 檔案系統
 * @returns path aliases 映射
 */
export async function loadPathAliases(
  projectRoot: string,
  fileSystem: IFileSystem
): Promise<Record<string, string>> {
  const config = await loadTsconfigPathConfig(projectRoot, fileSystem);
  return toLegacyPathAliases(config.pathAliases);
}

const tsconfigCache = new WeakMap<object, Map<string, Promise<TsconfigPathConfig>>>();

function getTsconfigCache(fileSystem: IFileSystem): Map<string, Promise<TsconfigPathConfig>> {
  const existing = tsconfigCache.get(fileSystem as object);
  if (existing) {
    return existing;
  }

  const cache = new Map<string, Promise<TsconfigPathConfig>>();
  tsconfigCache.set(fileSystem as object, cache);
  return cache;
}

/**
 * Compatibility view for the old `loadPathAliases` helper.  The structured
 * loader never chooses a candidate; this view only preserves the old one-path
 * return shape for callers that have not migrated yet.
 */
function toLegacyPathAliases(pathAliases: PathAliasMap): Record<string, string> {
  const legacy: Record<string, string> = {};
  const entries = getPathAliasEntries(pathAliases);

  for (const entry of entries) {
    const candidate = entry.candidates[entry.candidates.length - 1];
    if (candidate === undefined) {
      continue;
    }

    if (!entry.wildcard || !Object.prototype.hasOwnProperty.call(legacy, entry.alias)) {
      legacy[entry.alias] = candidate;
    }
    if (entry.wildcard) {
      legacy[`${entry.alias}/*`] = candidate;
    }
  }

  return legacy;
}
