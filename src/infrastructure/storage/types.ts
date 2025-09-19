/**
 * 檔案系統抽象層型別定義
 */

export interface DirectoryEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: Date;
}

export interface FileStats {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  createdTime: Date;
  modifiedTime: Date;
  accessedTime: Date;
  mode: number;
  uid?: number;
  gid?: number;
}

export interface GlobOptions {
  cwd?: string;
  ignore?: string[];
  dot?: boolean;
  absolute?: boolean;
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
  followSymlinks?: boolean;
}

export interface WatchOptions {
  persistent?: boolean;
  recursive?: boolean;
  encoding?: BufferEncoding;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  cwd?: string;
  ignored?: string | string[] | ((path: string) => boolean);
  ignorePermissionErrors?: boolean;
  atomic?: boolean | number;
  awaitWriteFinish?: boolean | {
    stabilityThreshold?: number;
    pollInterval?: number;
  };
  usePolling?: boolean;
  interval?: number;
  binaryInterval?: number;
  alwaysStat?: boolean;
  depth?: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'ready' | 'error';
  path: string;
  stats?: FileStats;
  error?: Error;
}

export type FileWatcherEventListener = (event: FileChangeEvent) => void;

export interface PathInfo {
  dir: string;
  name: string;
  base: string;
  ext: string;
  root: string;
}

// 檔案系統錯誤型別
export enum FileSystemErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DIRECTORY_NOT_EMPTY = 'DIRECTORY_NOT_EMPTY',
  FILE_ALREADY_EXISTS = 'FILE_ALREADY_EXISTS',
  DIRECTORY_ALREADY_EXISTS = 'DIRECTORY_ALREADY_EXISTS',
  INVALID_PATH = 'INVALID_PATH',
  IO_ERROR = 'IO_ERROR',
  TIMEOUT = 'TIMEOUT',
}

export class FileSystemError extends Error {
  constructor(
    public readonly type: FileSystemErrorType,
    message: string,
    public readonly path?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}

export class FileNotFoundError extends FileSystemError {
  constructor(path: string, cause?: Error) {
    super(FileSystemErrorType.FILE_NOT_FOUND, `File not found: ${path}`, path, cause);
    this.name = 'FileNotFoundError';
  }
}

export class DirectoryNotFoundError extends FileSystemError {
  constructor(path: string, cause?: Error) {
    super(FileSystemErrorType.DIRECTORY_NOT_FOUND, `Directory not found: ${path}`, path, cause);
    this.name = 'DirectoryNotFoundError';
  }
}

export class PermissionError extends FileSystemError {
  constructor(path: string, cause?: Error) {
    super(FileSystemErrorType.PERMISSION_DENIED, `Permission denied: ${path}`, path, cause);
    this.name = 'PermissionError';
  }
}

export class DirectoryNotEmptyError extends FileSystemError {
  constructor(path: string, cause?: Error) {
    super(FileSystemErrorType.DIRECTORY_NOT_EMPTY, `Directory not empty: ${path}`, path, cause);
    this.name = 'DirectoryNotEmptyError';
  }
}

export interface FileSystemLock {
  path: string;
  exclusive: boolean;
  acquired: Date;
  release(): Promise<void>;
}

export interface AtomicWriteOptions {
  tempSuffix?: string;
  fsync?: boolean;
  encoding?: BufferEncoding;
}