/**
 * Application State 測試
 * 測試 SessionState 和 ApplicationState 的不可變狀態管理
 */

import { describe, it, expect } from 'vitest';
import {
  SessionState,
  type SessionOptions,
  type OperationRecord,
} from '@application/state/session-state.js';
import {
  ApplicationState,
  type ModuleState,
  type CacheStats,
  type PerformanceMetrics,
} from '@application/state/application-state.js';

// ============================================================================
// SessionState Tests
// ============================================================================

describe('SessionState', () => {
  describe('constructor', () => {
    it('should create a new session with default options', () => {
      const session = new SessionState('session-123');

      expect(session.sessionId).toBe('session-123');
      expect(session.userId).toBeUndefined();
      expect(session.isActive).toBe(true);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastAccessedAt).toBeInstanceOf(Date);
      expect(session.context).toEqual({});
      expect(session.operationHistory).toEqual([]);
      expect(session.options.maxHistorySize).toBe(1000);
      expect(session.options.timeoutMs).toBe(30 * 60 * 1000);
    });

    it('should create session with userId', () => {
      const session = new SessionState('session-123', 'user-456');

      expect(session.userId).toBe('user-456');
    });

    it('should create session with custom options', () => {
      const options: SessionOptions = {
        maxHistorySize: 500,
        timeoutMs: 60000,
      };

      const session = new SessionState('session-123', undefined, options);

      expect(session.options.maxHistorySize).toBe(500);
      expect(session.options.timeoutMs).toBe(60000);
    });
  });

  describe('fromJSON', () => {
    it('should create session from JSON data', () => {
      const data = {
        sessionId: 'session-123',
        userId: 'user-456',
        isActive: false,
        createdAt: new Date('2024-01-01'),
        lastAccessedAt: new Date('2024-01-02'),
        context: { workingDirectory: '/home/user' },
        operationHistory: [],
        options: { maxHistorySize: 100 },
      };

      const session = SessionState.fromJSON(data);

      expect(session.sessionId).toBe('session-123');
      expect(session.userId).toBe('user-456');
      expect(session.isActive).toBe(false);
      expect(session.context.workingDirectory).toBe('/home/user');
    });

    it('should use defaults for missing data', () => {
      const session = SessionState.fromJSON({});

      expect(session.sessionId).toBe('');
      expect(session.isActive).toBe(true);
      expect(session.context).toEqual({});
    });
  });

  describe('updateContext', () => {
    it('should return new state with updated context', () => {
      const session = new SessionState('session-123');
      const updated = session.updateContext({ workingDirectory: '/project' });

      expect(updated.context.workingDirectory).toBe('/project');
      expect(session.context.workingDirectory).toBeUndefined();
    });

    it('should merge context with existing values', () => {
      const session = new SessionState('session-123');
      const withDir = session.updateContext({ workingDirectory: '/project' });
      const withFile = withDir.updateContext({ currentFile: 'index.ts' });

      expect(withFile.context.workingDirectory).toBe('/project');
      expect(withFile.context.currentFile).toBe('index.ts');
    });

    it('should update lastAccessedAt', () => {
      const session = new SessionState('session-123');
      const initialTime = session.lastAccessedAt;

      // Wait a bit to ensure time difference
      const updated = session.updateContext({ key: 'value' });

      expect(updated.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(initialTime.getTime());
    });
  });

  describe('updateLastAccess', () => {
    it('should update lastAccessedAt', () => {
      const session = new SessionState('session-123');
      const updated = session.updateLastAccess();

      expect(updated.lastAccessedAt).toBeInstanceOf(Date);
      expect(updated.sessionId).toBe(session.sessionId);
    });
  });

  describe('deactivate / activate', () => {
    it('should deactivate session', () => {
      const session = new SessionState('session-123');
      const deactivated = session.deactivate();

      expect(deactivated.isActive).toBe(false);
      expect(session.isActive).toBe(true);
    });

    it('should activate session', () => {
      const session = new SessionState('session-123');
      const deactivated = session.deactivate();
      const reactivated = deactivated.activate();

      expect(reactivated.isActive).toBe(true);
    });
  });

  describe('addOperation', () => {
    it('should add operation to history', () => {
      const session = new SessionState('session-123');
      const operation: OperationRecord = {
        id: 'op-1',
        type: 'rename',
        timestamp: new Date(),
        description: 'Renamed foo to bar',
        metadata: {},
      };

      const updated = session.addOperation(operation);

      expect(updated.operationHistory).toHaveLength(1);
      expect(updated.operationHistory[0].id).toBe('op-1');
      expect(session.operationHistory).toHaveLength(0);
    });

    it('should truncate history when exceeding maxHistorySize', () => {
      const session = new SessionState('session-123', undefined, {
        maxHistorySize: 3,
      });

      let state = session;
      for (let i = 0; i < 5; i++) {
        state = state.addOperation({
          id: `op-${i}`,
          type: 'search',
          timestamp: new Date(),
          description: `Operation ${i}`,
          metadata: {},
        });
      }

      expect(state.operationHistory).toHaveLength(3);
      expect(state.operationHistory[0].id).toBe('op-2');
      expect(state.operationHistory[2].id).toBe('op-4');
    });
  });

  describe('addOperations', () => {
    it('should add multiple operations', () => {
      const session = new SessionState('session-123');
      const operations: OperationRecord[] = [
        { id: 'op-1', type: 'search', timestamp: new Date(), description: 'Op 1', metadata: {} },
        { id: 'op-2', type: 'analyze', timestamp: new Date(), description: 'Op 2', metadata: {} },
      ];

      const updated = session.addOperations(operations);

      expect(updated.operationHistory).toHaveLength(2);
    });
  });

  describe('clearHistory', () => {
    it('should clear operation history', () => {
      const session = new SessionState('session-123');
      const withOp = session.addOperation({
        id: 'op-1',
        type: 'search',
        timestamp: new Date(),
        description: 'Op 1',
        metadata: {},
      });

      const cleared = withOp.clearHistory();

      expect(cleared.operationHistory).toHaveLength(0);
    });
  });

  describe('isExpired', () => {
    it('should return false when not expired', () => {
      const session = new SessionState('session-123');

      expect(session.isExpired()).toBe(false);
    });

    it('should return true when expired', () => {
      const _session = new SessionState('session-123', undefined, {
        timeoutMs: 100,
      });

      // Mock the lastAccessedAt to be in the past
      const expired = SessionState.fromJSON({
        sessionId: 'session-123',
        isActive: true,
        lastAccessedAt: new Date(Date.now() - 200),
        options: { timeoutMs: 100 },
      });

      expect(expired.isExpired()).toBe(true);
    });

    it('should return false when timeoutMs is 0', () => {
      const session = new SessionState('session-123', undefined, {
        timeoutMs: 0,
      });

      expect(session.isExpired()).toBe(false);
    });
  });

  describe('getDuration', () => {
    it('should return session duration', () => {
      const session = new SessionState('session-123');
      const duration = session.getDuration();

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('revertToOperation', () => {
    it('should revert to specific operation', () => {
      const session = new SessionState('session-123');
      let state = session;

      for (let i = 0; i < 5; i++) {
        state = state.addOperation({
          id: `op-${i}`,
          type: 'search',
          timestamp: new Date(),
          description: `Op ${i}`,
          metadata: {},
        });
      }

      const reverted = state.revertToOperation('op-2');

      expect(reverted.operationHistory).toHaveLength(3);
      expect(reverted.operationHistory[2].id).toBe('op-2');
    });

    it('should return same state if operation not found', () => {
      const session = new SessionState('session-123');
      const state = session.addOperation({
        id: 'op-1',
        type: 'search',
        timestamp: new Date(),
        description: 'Op 1',
        metadata: {},
      });

      const reverted = state.revertToOperation('non-existent');

      expect(reverted.operationHistory).toHaveLength(1);
    });
  });

  describe('getSnapshotAtTime', () => {
    it('should return snapshot at specific time', () => {
      const session = new SessionState('session-123');
      const time1 = new Date('2024-01-01');
      const time2 = new Date('2024-01-02');
      const time3 = new Date('2024-01-03');

      let state = session;
      state = state.addOperation({
        id: 'op-1',
        type: 'search',
        timestamp: time1,
        description: 'Op 1',
        metadata: {},
      });
      state = state.addOperation({
        id: 'op-2',
        type: 'analyze',
        timestamp: time2,
        description: 'Op 2',
        metadata: {},
      });
      state = state.addOperation({
        id: 'op-3',
        type: 'rename',
        timestamp: time3,
        description: 'Op 3',
        metadata: {},
      });

      const snapshot = state.getSnapshotAtTime(new Date('2024-01-01T12:00:00'));

      expect(snapshot.operationHistory).toHaveLength(1);
      expect(snapshot.operationHistory[0].id).toBe('op-1');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const session = new SessionState('session-123', 'user-456');
      const json = session.toJSON();

      expect(json.sessionId).toBe('session-123');
      expect(json.userId).toBe('user-456');
      expect(json.isActive).toBe(true);
      expect(json.createdAt).toBeInstanceOf(Date);
    });
  });
});

// ============================================================================
// ApplicationState Tests
// ============================================================================

describe('ApplicationState', () => {
  describe('constructor', () => {
    it('should create a new application state with defaults', () => {
      const state = new ApplicationState();

      expect(state.version).toBe('1.0.0');
      expect(state.environment).toBe('development');
      expect(state.isInitialized).toBe(false);
      expect(state.moduleStates).toEqual({});
      expect(state.globalSettings).toEqual({});
      expect(state.cacheStats.hitCount).toBe(0);
      expect(state.performanceMetrics.totalOperations).toBe(0);
    });

    it('should create state with initial settings', () => {
      const state = new ApplicationState({ theme: 'dark' });

      expect(state.globalSettings.theme).toBe('dark');
    });
  });

  describe('fromJSON', () => {
    it('should create state from JSON data', () => {
      const data = {
        version: '2.0.0',
        environment: 'production' as const,
        isInitialized: true,
        moduleStates: { 'mod-1': { isLoaded: true, lastUsed: new Date(), errorCount: 0, metadata: {} } },
        globalSettings: { key: 'value' },
        cacheStats: { hitCount: 10, missCount: 5, totalSize: 1000 },
        performanceMetrics: { startTime: new Date(), totalOperations: 100, averageResponseTime: 50 },
      };

      const state = ApplicationState.fromJSON(data);

      expect(state.version).toBe('2.0.0');
      expect(state.environment).toBe('production');
      expect(state.isInitialized).toBe(true);
    });

    it('should use defaults for missing data', () => {
      const state = ApplicationState.fromJSON({});

      expect(state.version).toBe('1.0.0');
      expect(state.environment).toBe('development');
    });
  });

  describe('markInitialized', () => {
    it('should mark state as initialized', () => {
      const state = new ApplicationState();
      const initialized = state.markInitialized();

      expect(initialized.isInitialized).toBe(true);
      expect(state.isInitialized).toBe(false);
    });
  });

  describe('updateVersion', () => {
    it('should update version', () => {
      const state = new ApplicationState();
      const updated = state.updateVersion('2.0.0');

      expect(updated.version).toBe('2.0.0');
      expect(state.version).toBe('1.0.0');
    });
  });

  describe('setEnvironment', () => {
    it('should set environment', () => {
      const state = new ApplicationState();
      const updated = state.setEnvironment('production');

      expect(updated.environment).toBe('production');
    });

    it('should support all environment types', () => {
      const state = new ApplicationState();

      expect(state.setEnvironment('development').environment).toBe('development');
      expect(state.setEnvironment('production').environment).toBe('production');
      expect(state.setEnvironment('test').environment).toBe('test');
    });
  });

  describe('module state management', () => {
    it('should set module state', () => {
      const state = new ApplicationState();
      const moduleState: ModuleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {},
      };

      const updated = state.setModuleState('mod-1', moduleState);

      expect(updated.moduleStates['mod-1'].isLoaded).toBe(true);
      expect(state.moduleStates['mod-1']).toBeUndefined();
    });

    it('should set multiple module states', () => {
      const state = new ApplicationState();
      const moduleState: ModuleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {},
      };

      const updated = state.setModuleStates({
        'mod-1': moduleState,
        'mod-2': { ...moduleState, errorCount: 1 },
      });

      expect(Object.keys(updated.moduleStates)).toHaveLength(2);
    });

    it('should get module state', () => {
      const state = new ApplicationState();
      const moduleState: ModuleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {},
      };

      const updated = state.setModuleState('mod-1', moduleState);

      expect(updated.getModuleState('mod-1')).toBeDefined();
      expect(updated.getModuleState('non-existent')).toBeUndefined();
    });

    it('should remove module state', () => {
      const state = new ApplicationState();
      const moduleState: ModuleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {},
      };

      const withModule = state.setModuleState('mod-1', moduleState);
      const removed = withModule.removeModuleState('mod-1');

      expect(removed.moduleStates['mod-1']).toBeUndefined();
    });
  });

  describe('settings management', () => {
    it('should update settings', () => {
      const state = new ApplicationState();
      const updated = state.updateSettings({ theme: 'dark', lang: 'en' });

      expect(updated.globalSettings.theme).toBe('dark');
      expect(updated.globalSettings.lang).toBe('en');
    });

    it('should get setting', () => {
      const state = new ApplicationState({ theme: 'light' });

      expect(state.getSetting('theme')).toBe('light');
      expect(state.getSetting('non-existent')).toBeUndefined();
    });

    it('should remove setting', () => {
      const state = new ApplicationState({ theme: 'light' });
      const removed = state.removeSetting('theme');

      expect(removed.globalSettings.theme).toBeUndefined();
    });
  });

  describe('cache stats management', () => {
    it('should update cache stats', () => {
      const state = new ApplicationState();
      const stats: CacheStats = {
        hitCount: 100,
        missCount: 20,
        totalSize: 5000,
      };

      const updated = state.updateCacheStats(stats);

      expect(updated.cacheStats.hitCount).toBe(100);
    });

    it('should increment cache hit', () => {
      const state = new ApplicationState();
      const updated = state.incrementCacheHit();

      expect(updated.cacheStats.hitCount).toBe(1);
    });

    it('should increment cache miss', () => {
      const state = new ApplicationState();
      const updated = state.incrementCacheMiss();

      expect(updated.cacheStats.missCount).toBe(1);
    });

    it('should calculate cache hit rate', () => {
      const state = new ApplicationState();
      let updated = state;

      for (let i = 0; i < 80; i++) {
        updated = updated.incrementCacheHit();
      }
      for (let i = 0; i < 20; i++) {
        updated = updated.incrementCacheMiss();
      }

      expect(updated.getCacheHitRate()).toBe(0.8);
    });

    it('should return 0 hit rate when no cache operations', () => {
      const state = new ApplicationState();

      expect(state.getCacheHitRate()).toBe(0);
    });
  });

  describe('performance metrics', () => {
    it('should update performance metrics', () => {
      const state = new ApplicationState();
      const metrics: PerformanceMetrics = {
        startTime: new Date(),
        totalOperations: 100,
        averageResponseTime: 50,
      };

      const updated = state.updatePerformanceMetrics(metrics);

      expect(updated.performanceMetrics.totalOperations).toBe(100);
    });

    it('should record operation and update average', () => {
      const state = new ApplicationState();
      const op1 = state.recordOperation(100);
      const op2 = op1.recordOperation(200);
      const op3 = op2.recordOperation(300);

      expect(op3.performanceMetrics.totalOperations).toBe(3);
      expect(op3.performanceMetrics.averageResponseTime).toBe(200);
    });

    it('should get runtime', () => {
      const state = new ApplicationState();
      const runtime = state.getRuntime();

      expect(runtime).toBeGreaterThanOrEqual(0);
      expect(runtime).toBeLessThan(1000);
    });
  });

  describe('isValid', () => {
    it('should return true for valid state', () => {
      const state = new ApplicationState();

      expect(state.isValid()).toBe(true);
    });

    it('should return false for invalid version', () => {
      // Create state and manually modify version to test validation
      const state = new ApplicationState();
      // Use Object.assign to bypass readonly for testing
      const invalidState = Object.assign(Object.create(Object.getPrototypeOf(state)), {
        ...state,
        version: '',
      });

      expect(invalidState.isValid()).toBe(false);
    });

    it('should return false for invalid environment', () => {
      const state = new ApplicationState();
      const invalidState = Object.assign(Object.create(Object.getPrototypeOf(state)), {
        ...state,
        environment: 'invalid',
      });

      expect(invalidState.isValid()).toBe(false);
    });

    it('should return false for negative cache stats', () => {
      const state = ApplicationState.fromJSON({
        cacheStats: { hitCount: -1, missCount: 0, totalSize: 0 },
      });

      expect(state.isValid()).toBe(false);
    });

    it('should return false for negative performance metrics', () => {
      const state = ApplicationState.fromJSON({
        performanceMetrics: {
          startTime: new Date(),
          totalOperations: -1,
          averageResponseTime: 0,
        },
      });

      expect(state.isValid()).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('should return state summary', () => {
      const state = new ApplicationState();
      const withModules = state.setModuleStates({
        'mod-1': { isLoaded: true, lastUsed: new Date(), errorCount: 0, metadata: {} },
        'mod-2': { isLoaded: true, lastUsed: new Date(), errorCount: 0, metadata: {} },
      });
      const withSettings = withModules.updateSettings({ key1: 'v1', key2: 'v2' });

      const summary = withSettings.getSummary();

      expect(summary.version).toBe('1.0.0');
      expect(summary.environment).toBe('development');
      expect(summary.moduleCount).toBe(2);
      expect(summary.settingsCount).toBe(2);
    });
  });

  describe('reset methods', () => {
    it('should reset all state', () => {
      const state = new ApplicationState({ theme: 'dark' });
      const initialized = state.markInitialized();
      const reset = initialized.reset();

      expect(reset.isInitialized).toBe(false);
      expect(reset.globalSettings.theme).toBeUndefined();
    });

    it('should reset module states only', () => {
      const state = new ApplicationState({ theme: 'dark' });
      const withModule = state.setModuleState('mod-1', {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {},
      });
      const reset = withModule.resetModuleStates();

      expect(reset.moduleStates).toEqual({});
      expect(reset.globalSettings.theme).toBe('dark');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const state = new ApplicationState();
      const json = state.toJSON();

      expect(json.version).toBe('1.0.0');
      expect(json.environment).toBe('development');
      expect(json.isInitialized).toBe(false);
    });
  });
});
