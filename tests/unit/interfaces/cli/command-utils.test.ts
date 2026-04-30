import { afterEach, describe, expect, it, vi } from 'vitest';

import { PreviewCommand } from '@infrastructure/formatters/index.js';
import {
  createEmptyMutationPreviewInput,
  outputMutationWithLegacyFields,
  tryParseOutputFormat
} from '@interfaces/cli/command-utils.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';

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

describe('outputMutationWithLegacyFields', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the unified mutation contract authoritative over legacy fields', () => {
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const previewInput = createEmptyMutationPreviewInput(
      PreviewCommand.Move,
      'No changes needed'
    );

    outputMutationWithLegacyFields(
      createUnifiedOutputHandler({ color: false }),
      previewInput,
      OutputFormat.Json,
      {
        command: 'legacy-command',
        success: false,
        summary: { totalFiles: 99, totalChanges: 99, additions: 99, deletions: 99 },
        message: 'legacy field'
      }
    );

    const output = JSON.parse(stdout.mock.calls[0][0] as string) as {
      command: string;
      success: boolean;
      summary: { totalFiles: number; totalChanges: number };
      message: string;
    };

    expect(output.command).toBe('move');
    expect(output.success).toBe(true);
    expect(output.summary.totalFiles).toBe(0);
    expect(output.summary.totalChanges).toBe(0);
    expect(output.message).toBe('legacy field');
  });
});
