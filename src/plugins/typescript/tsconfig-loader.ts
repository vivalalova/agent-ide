/**
 * tsconfig.json 載入器
 * 提供向上查找 tsconfig.json 並解析 path aliases 的功能
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { logger } from '@infrastructure/logging/index.js';
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

function parseTsconfig(tsconfigPath: string, content: string): TsconfigFile {
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, content);
  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
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
    throw new Error(`Circular tsconfig extends detected: ${resolvedTsconfigPath}`);
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
  const config: TsconfigPathConfig = { pathAliases: createStructuredPathAliasMap([]) };

  try {
    // 向上查找 tsconfig.json
    const found = await findTsconfigUp(projectRoot, fileSystem);
    if (!found) {
      return config;
    }

    const cache = getTsconfigCache(fileSystem);
    const cacheKey = path.resolve(found.tsconfigPath);
    const cached = cache.get(cacheKey);
    if (cached) {
      return await cached;
    }

    const loading = loadResolvedTsconfigPathConfig(found.tsconfigPath, fileSystem);
    cache.set(cacheKey, loading);
    return await loading;
  } catch (error) {
    // graceful-degradation: tsconfig.json 不存在或格式錯誤時使用空設定
    logger.warn('tsconfig-loader', `Failed to load tsconfig.json: ${error}`);
  }

  return config;
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
