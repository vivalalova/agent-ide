/**
 * 檔案系統抽象層型別定義
 */
// 檔案系統錯誤型別
export var FileSystemErrorType;
(function (FileSystemErrorType) {
    FileSystemErrorType["FILE_NOT_FOUND"] = "FILE_NOT_FOUND";
    FileSystemErrorType["DIRECTORY_NOT_FOUND"] = "DIRECTORY_NOT_FOUND";
    FileSystemErrorType["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    FileSystemErrorType["DIRECTORY_NOT_EMPTY"] = "DIRECTORY_NOT_EMPTY";
    FileSystemErrorType["FILE_ALREADY_EXISTS"] = "FILE_ALREADY_EXISTS";
    FileSystemErrorType["DIRECTORY_ALREADY_EXISTS"] = "DIRECTORY_ALREADY_EXISTS";
    FileSystemErrorType["INVALID_PATH"] = "INVALID_PATH";
    FileSystemErrorType["IO_ERROR"] = "IO_ERROR";
    FileSystemErrorType["TIMEOUT"] = "TIMEOUT";
})(FileSystemErrorType || (FileSystemErrorType = {}));
export class FileSystemError extends Error {
    type;
    path;
    cause;
    constructor(type, message, path, cause) {
        super(message);
        this.type = type;
        this.path = path;
        this.cause = cause;
        this.name = 'FileSystemError';
    }
}
export class FileNotFoundError extends FileSystemError {
    constructor(path, cause) {
        super(FileSystemErrorType.FILE_NOT_FOUND, `File not found: ${path}`, path, cause);
        this.name = 'FileNotFoundError';
    }
}
export class DirectoryNotFoundError extends FileSystemError {
    constructor(path, cause) {
        super(FileSystemErrorType.DIRECTORY_NOT_FOUND, `Directory not found: ${path}`, path, cause);
        this.name = 'DirectoryNotFoundError';
    }
}
export class PermissionError extends FileSystemError {
    constructor(path, cause) {
        super(FileSystemErrorType.PERMISSION_DENIED, `Permission denied: ${path}`, path, cause);
        this.name = 'PermissionError';
    }
}
export class DirectoryNotEmptyError extends FileSystemError {
    constructor(path, cause) {
        super(FileSystemErrorType.DIRECTORY_NOT_EMPTY, `Directory not empty: ${path}`, path, cause);
        this.name = 'DirectoryNotEmptyError';
    }
}
//# sourceMappingURL=types.js.map