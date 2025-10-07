/**
 * 核心型別定義
 * 包含 Position、Range、Location 等基礎型別
 */
/**
 * 表示程式碼中的位置
 */
export interface Position {
    readonly line: number;
    readonly column: number;
    readonly offset: number | undefined;
}
/**
 * 表示程式碼中的範圍
 */
export interface Range {
    readonly start: Position;
    readonly end: Position;
}
/**
 * 表示檔案中的位置
 */
export interface Location {
    readonly filePath: string;
    readonly range: Range;
}
/**
 * 建立 Position 的工廠函式
 */
export declare function createPosition(line: number, column: number, offset?: number): Position;
/**
 * 建立 Range 的工廠函式
 */
export declare function createRange(start: Position, end: Position): Range;
/**
 * 建立 Location 的工廠函式
 */
export declare function createLocation(filePath: string, range: Range): Location;
/**
 * Position 型別守衛
 */
export declare function isPosition(value: unknown): value is Position;
/**
 * Range 型別守衛
 */
export declare function isRange(value: unknown): value is Range;
/**
 * Location 型別守衛
 */
export declare function isLocation(value: unknown): value is Location;
/**
 * 比較兩個 Position 的先後順序
 * @param pos1 第一個位置
 * @param pos2 第二個位置
 * @returns pos1 是否在 pos2 之前
 */
export declare function isPositionBefore(pos1: Position, pos2: Position): boolean;
/**
 * 檢查 Position 是否在 Range 範圍內（包含邊界）
 * @param position 要檢查的位置
 * @param range 範圍
 * @returns 是否在範圍內
 */
export declare function isPositionInRange(position: Position, range: Range): boolean;
//# sourceMappingURL=core.d.ts.map