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
export declare enum FileSystemErrorType {
    FILE_NOT_FOUND = "FILE_NOT_FOUND",
    DIRECTORY_NOT_FOUND = "DIRECTORY_NOT_FOUND",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    DIRECTORY_NOT_EMPTY = "DIRECTORY_NOT_EMPTY",
    FILE_ALREADY_EXISTS = "FILE_ALREADY_EXISTS",
    DIRECTORY_ALREADY_EXISTS = "DIRECTORY_ALREADY_EXISTS",
    INVALID_PATH = "INVALID_PATH",
    IO_ERROR = "IO_ERROR",
    TIMEOUT = "TIMEOUT"
}
export declare class FileSystemError extends Error {
    readonly type: FileSystemErrorType;
    readonly path?: string | undefined;
    readonly cause?: Error | undefined;
    constructor(type: FileSystemErrorType, message: string, path?: string | undefined, cause?: Error | undefined);
}
export declare class FileNotFoundError extends FileSystemError {
    constructor(path: string, cause?: Error);
}
export declare class DirectoryNotFoundError extends FileSystemError {
    constructor(path: string, cause?: Error);
}
export declare class PermissionError extends FileSystemError {
    constructor(path: string, cause?: Error);
}
export declare class DirectoryNotEmptyError extends FileSystemError {
    constructor(path: string, cause?: Error);
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
//# sourceMappingURL=types.d.ts.map