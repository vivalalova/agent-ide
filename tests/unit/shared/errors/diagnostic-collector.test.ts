/**
 * DiagnosticCollector 單元測試
 */
import { describe, it, expect, vi } from 'vitest';

import {
  DiagnosticCollector,
  DiagnosticSeverity,
  diagnostics
} from '@shared/errors/diagnostic-collector.js';

describe('DiagnosticCollector', () => {
  describe('warn', () => {
    it('should record warning diagnostic', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.warn('symbol-finder', 'AST_PARSE_FAILED', 'Parse failed', '/a.ts');
      const warns = dc.getWarnings();
      expect(warns).toHaveLength(1);
      expect(warns[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(warns[0].module).toBe('symbol-finder');
      expect(warns[0].code).toBe('AST_PARSE_FAILED');
      expect(warns[0].message).toBe('Parse failed');
      expect(warns[0].filePath).toBe('/a.ts');
      expect(warns[0].timestamp).toBeInstanceOf(Date);
    });

    it('should output to console.warn when not silent', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dc = new DiagnosticCollector();
      dc.warn('mod', 'CODE', 'msg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should not output to console when silent', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dc = new DiagnosticCollector({ silent: true });
      dc.warn('mod', 'CODE', 'msg');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should allow console forwarding to be muted and restored', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dc = new DiagnosticCollector();

      dc.setSilent(true);
      dc.warn('mod', 'CODE', 'muted');
      expect(spy).not.toHaveBeenCalled();

      dc.setSilent(false);
      dc.warn('mod', 'CODE', 'forwarded');
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });
  });

  describe('error', () => {
    it('should record error diagnostic', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.error('rename', 'ANALYSIS_DEGRADED', 'Critical failure');
      expect(dc.hasErrors()).toBe(true);
      const all = dc.getDiagnostics();
      expect(all[0].severity).toBe(DiagnosticSeverity.Error);
    });

    it('should output to console.error when not silent', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dc = new DiagnosticCollector();
      dc.error('mod', 'CODE', 'msg');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('getDiagnostics', () => {
    it('should return all diagnostics across severities', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.warn('m', 'W', 'warning');
      dc.error('m', 'E', 'error');
      expect(dc.getDiagnostics()).toHaveLength(2);
    });

    it('should return empty array initially', () => {
      expect(new DiagnosticCollector().getDiagnostics()).toHaveLength(0);
    });
  });

  describe('getWarnings', () => {
    it('should return only warnings', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.warn('m', 'W', 'warning');
      dc.error('m', 'E', 'error');
      expect(dc.getWarnings()).toHaveLength(1);
      expect(dc.getWarnings()[0].severity).toBe(DiagnosticSeverity.Warning);
    });
  });

  describe('hasErrors', () => {
    it('should return false with no diagnostics', () => {
      expect(new DiagnosticCollector().hasErrors()).toBe(false);
    });

    it('should return false with only warnings', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.warn('m', 'W', 'warning');
      expect(dc.hasErrors()).toBe(false);
    });

    it('should return true after error recorded', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.error('m', 'E', 'error');
      expect(dc.hasErrors()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all diagnostics', () => {
      const dc = new DiagnosticCollector({ silent: true });
      dc.warn('m', 'W', 'w');
      dc.error('m', 'E', 'e');
      dc.clear();
      expect(dc.getDiagnostics()).toHaveLength(0);
      expect(dc.hasErrors()).toBe(false);
    });
  });

  describe('filePath in message', () => {
    it('should include filePath in console output when provided', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dc = new DiagnosticCollector();
      dc.warn('mod', 'CODE', 'msg', '/src/foo.ts');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('/src/foo.ts'));
      spy.mockRestore();
    });
  });
});

describe('diagnostics (global singleton)', () => {
  it('should be a DiagnosticCollector instance', () => {
    expect(diagnostics).toBeInstanceOf(DiagnosticCollector);
  });

  it('should forward to console.warn when explicitly enabled', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    diagnostics.setSilent(false);
    try {
      diagnostics.warn('test', 'TEST_CODE', 'test message');
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      diagnostics.clear();
      diagnostics.setSilent(true);
    }
  });
});
