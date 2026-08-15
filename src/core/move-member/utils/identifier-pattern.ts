/**
 * JavaScript / TypeScript identifier pattern used by move-member scanners.
 * The parser's Unicode identifier contract is kept in one place for both
 * dependency extraction and export discovery.
 */
export const UNICODE_IDENTIFIER_PATTERN_SOURCE = '[\\p{ID_Start}_$][\\p{ID_Continue}$]*';
