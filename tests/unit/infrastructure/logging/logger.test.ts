import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger, LogLevel, logger } from '@infrastructure/logging/index.js';

describe('Logger', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logger.setLevel(LogLevel.Normal);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    Logger.resetInstance();
  });

  it('returns the shared singleton instance', () => {
    expect(Logger.getInstance()).toBe(Logger.getInstance());
    expect(logger).toBe(Logger.getInstance());
  });

  it('tracks the configured log level and verbose state', () => {
    logger.setLevel(LogLevel.Silent);
    expect(logger.getLevel()).toBe(LogLevel.Silent);
    expect(logger.isVerbose()).toBe(false);

    logger.setLevel(LogLevel.Verbose);
    expect(logger.getLevel()).toBe(LogLevel.Verbose);
    expect(logger.isVerbose()).toBe(true);
  });

  it('only writes verbose messages in verbose mode', () => {
    logger.setLevel(LogLevel.Normal);
    logger.verbose('parser', 'skipped');

    expect(writeSpy).not.toHaveBeenCalled();

    logger.setLevel(LogLevel.Verbose);
    logger.verbose('parser', 'loaded');

    expect(writeSpy).toHaveBeenCalledWith('[parser] loaded\n');
  });

  it('suppresses warnings and errors in silent mode', () => {
    logger.setLevel(LogLevel.Silent);

    logger.warn('cache', 'warmup failed');
    logger.error('cache', 'save failed');

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes warnings and errors outside silent mode', () => {
    logger.setLevel(LogLevel.Normal);

    logger.warn('cache', 'warmup failed');
    logger.error('cache', 'save failed');

    expect(writeSpy).toHaveBeenCalledWith('[WARN][cache] warmup failed\n');
    expect(writeSpy).toHaveBeenCalledWith('[ERROR][cache] save failed\n');
  });

  it('resets the singleton log level to normal', () => {
    logger.setLevel(LogLevel.Silent);

    Logger.resetInstance();

    expect(logger.getLevel()).toBe(LogLevel.Normal);
  });
});
