import { afterEach, describe, expect, it, vi } from 'vitest';

import { tryParseOutputFormat } from '@interfaces/cli/command-utils.js';

describe('tryParseOutputFormat', () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('reports the rejected format and allowed formats for invalid values', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = tryParseOutputFormat('xml', true);

    expect(result.success).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('不支援的輸出格式: xml'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('可用格式: json, summary, diff'));
  });

  it('reports that diff is unavailable for query commands', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = tryParseOutputFormat('diff', false);

    expect(result.success).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('不支援的輸出格式: diff'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('可用格式: json, summary'));
  });
});
