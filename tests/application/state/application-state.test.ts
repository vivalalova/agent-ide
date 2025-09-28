import { describe, it, expect, beforeEach } from 'vitest';
import { ApplicationState } from '../../../src/application/state/application-state.js';

describe('ApplicationState', () => {
  let appState: ApplicationState;

  beforeEach(() => {
    appState = new ApplicationState();
  });

  describe('初始化', () => {
    it('應該能建立新的 ApplicationState 實例', () => {
      expect(appState).toBeDefined();
      expect(appState.version).toBe('1.0.0');
      expect(appState.environment).toBe('development');
    });

    it('應該有正確的初始狀態', () => {
      expect(appState.isInitialized).toBe(false);
      expect(appState.moduleStates).toEqual({});
      expect(appState.globalSettings).toEqual({});
      expect(appState.cacheStats).toEqual({
        hitCount: 0,
        missCount: 0,
        totalSize: 0
      });
      expect(appState.performanceMetrics).toEqual({
        startTime: expect.any(Date),
        totalOperations: 0,
        averageResponseTime: 0
      });
    });

    it('應該能使用自定義設定初始化', () => {
      const customSettings = {
        maxCacheSize: 1024,
        enableLogging: true,
        debugMode: false
      };

      const customState = new ApplicationState(customSettings);
      expect(customState.globalSettings).toEqual(customSettings);
    });
  });

  describe('應用程式狀態管理', () => {
    it('應該能標記應用程式為已初始化', () => {
      const initializedState = appState.markInitialized();

      expect(initializedState.isInitialized).toBe(true);
      expect(initializedState).not.toBe(appState);
    });

    it('應該能更新版本', () => {
      const newVersion = '2.0.0';
      const updatedState = appState.updateVersion(newVersion);

      expect(updatedState.version).toBe(newVersion);
      expect(updatedState).not.toBe(appState);
    });

    it('應該能切換環境', () => {
      const prodState = appState.setEnvironment('production');

      expect(prodState.environment).toBe('production');
      expect(prodState).not.toBe(appState);
    });
  });

  describe('模組狀態管理', () => {
    it('應該能設定模組狀態', () => {
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: { cacheSize: 100 }
      };

      const updatedState = appState.setModuleState('parser', moduleState);

      expect(updatedState.moduleStates.parser).toEqual(moduleState);
      expect(updatedState).not.toBe(appState);
    });

    it('應該能批次更新多個模組狀態', () => {
      const moduleStates = {
        parser: {
          isLoaded: true,
          lastUsed: new Date(),
          errorCount: 0,
          metadata: {}
        },
        indexer: {
          isLoaded: false,
          lastUsed: new Date(),
          errorCount: 2,
          metadata: { files: 150 }
        }
      };

      const updatedState = appState.setModuleStates(moduleStates);

      expect(updatedState.moduleStates).toEqual(moduleStates);
      expect(updatedState).not.toBe(appState);
    });

    it('應該能取得指定模組狀態', () => {
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      const stateWithModule = appState.setModuleState('search', moduleState);
      const retrievedState = stateWithModule.getModuleState('search');

      expect(retrievedState).toEqual(moduleState);
    });

    it('取得不存在的模組狀態應該回傳 undefined', () => {
      const moduleState = appState.getModuleState('nonexistent');
      expect(moduleState).toBeUndefined();
    });

    it('應該能移除模組狀態', () => {
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      const stateWithModule = appState.setModuleState('temp', moduleState);
      const stateWithoutModule = stateWithModule.removeModuleState('temp');

      expect(stateWithoutModule.moduleStates.temp).toBeUndefined();
      expect(stateWithoutModule).not.toBe(stateWithModule);
    });
  });

  describe('全域設定管理', () => {
    it('應該能更新全域設定', () => {
      const newSettings = {
        maxCacheSize: 2048,
        enableLogging: false,
        debugMode: true
      };

      const updatedState = appState.updateSettings(newSettings);

      expect(updatedState.globalSettings).toEqual(newSettings);
      expect(updatedState).not.toBe(appState);
    });

    it('應該能部分更新全域設定', () => {
      const initialSettings = {
        maxCacheSize: 1024,
        enableLogging: true,
        debugMode: false
      };

      const stateWithSettings = appState.updateSettings(initialSettings);
      const partialUpdate = { debugMode: true };
      const updatedState = stateWithSettings.updateSettings(partialUpdate);

      expect(updatedState.globalSettings).toEqual({
        maxCacheSize: 1024,
        enableLogging: true,
        debugMode: true
      });
    });

    it('應該能取得指定設定值', () => {
      const settings = {
        maxCacheSize: 1024,
        enableLogging: true
      };

      const stateWithSettings = appState.updateSettings(settings);

      expect(stateWithSettings.getSetting('maxCacheSize')).toBe(1024);
      expect(stateWithSettings.getSetting('enableLogging')).toBe(true);
      expect(stateWithSettings.getSetting('nonexistent')).toBeUndefined();
    });

    it('應該能移除設定', () => {
      const settings = {
        maxCacheSize: 1024,
        enableLogging: true,
        debugMode: false
      };

      const stateWithSettings = appState.updateSettings(settings);
      const stateWithoutDebug = stateWithSettings.removeSetting('debugMode');

      expect(stateWithoutDebug.globalSettings.debugMode).toBeUndefined();
      expect(stateWithoutDebug.globalSettings.maxCacheSize).toBe(1024);
    });
  });

  describe('快取統計管理', () => {
    it('應該能更新快取統計', () => {
      const cacheStats = {
        hitCount: 100,
        missCount: 20,
        totalSize: 1024
      };

      const updatedState = appState.updateCacheStats(cacheStats);

      expect(updatedState.cacheStats).toEqual(cacheStats);
      expect(updatedState).not.toBe(appState);
    });

    it('應該能增加快取命中次數', () => {
      const updatedState = appState.incrementCacheHit();

      expect(updatedState.cacheStats.hitCount).toBe(1);
      expect(updatedState.cacheStats.missCount).toBe(0);
    });

    it('應該能增加快取未命中次數', () => {
      const updatedState = appState.incrementCacheMiss();

      expect(updatedState.cacheStats.hitCount).toBe(0);
      expect(updatedState.cacheStats.missCount).toBe(1);
    });

    it('應該能計算快取命中率', () => {
      let state = appState;

      // 添加一些統計數據
      state = state.incrementCacheHit();
      state = state.incrementCacheHit();
      state = state.incrementCacheMiss();

      const hitRate = state.getCacheHitRate();
      expect(hitRate).toBeCloseTo(0.67, 2); // 2/3 ≈ 0.67
    });

    it('沒有快取統計時命中率應該回傳 0', () => {
      const hitRate = appState.getCacheHitRate();
      expect(hitRate).toBe(0);
    });
  });

  describe('效能指標管理', () => {
    it('應該能更新效能指標', () => {
      const metrics = {
        startTime: new Date('2023-01-01'),
        totalOperations: 500,
        averageResponseTime: 120.5
      };

      const updatedState = appState.updatePerformanceMetrics(metrics);

      expect(updatedState.performanceMetrics).toEqual(metrics);
      expect(updatedState).not.toBe(appState);
    });

    it('應該能記錄操作', () => {
      const responseTime = 150;
      const updatedState = appState.recordOperation(responseTime);

      expect(updatedState.performanceMetrics.totalOperations).toBe(1);
      expect(updatedState.performanceMetrics.averageResponseTime).toBe(responseTime);
    });

    it('應該能正確計算平均回應時間', () => {
      let state = appState;

      // 記錄幾個操作
      state = state.recordOperation(100);
      state = state.recordOperation(200);
      state = state.recordOperation(150);

      expect(state.performanceMetrics.totalOperations).toBe(3);
      expect(state.performanceMetrics.averageResponseTime).toBe(150); // (100+200+150)/3
    });

    it('應該能取得運行時間', () => {
      const runtime = appState.getRuntime();
      expect(runtime).toBeGreaterThanOrEqual(0);
      expect(typeof runtime).toBe('number');
    });
  });

  describe('狀態序列化', () => {
    it('應該能序列化狀態', () => {
      const settings = { maxCacheSize: 1024 };
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      const stateWithData = appState
        .updateSettings(settings)
        .setModuleState('test', moduleState)
        .markInitialized();

      const serialized = stateWithData.toJSON();

      expect(serialized).toHaveProperty('version');
      expect(serialized).toHaveProperty('environment');
      expect(serialized).toHaveProperty('isInitialized', true);
      expect(serialized).toHaveProperty('globalSettings', settings);
      expect(serialized).toHaveProperty('moduleStates');
      expect(serialized.moduleStates.test).toBeDefined();
    });

    it('應該能從 JSON 恢復狀態', () => {
      const serializedData = {
        version: '2.0.0',
        environment: 'production' as const,
        isInitialized: true,
        moduleStates: {
          parser: {
            isLoaded: true,
            lastUsed: new Date('2023-01-01'),
            errorCount: 0,
            metadata: {}
          }
        },
        globalSettings: {
          maxCacheSize: 2048,
          enableLogging: false
        },
        cacheStats: {
          hitCount: 50,
          missCount: 10,
          totalSize: 512
        },
        performanceMetrics: {
          startTime: new Date('2023-01-01'),
          totalOperations: 100,
          averageResponseTime: 95.5
        }
      };

      const restoredState = ApplicationState.fromJSON(serializedData);

      expect(restoredState.version).toBe('2.0.0');
      expect(restoredState.environment).toBe('production');
      expect(restoredState.isInitialized).toBe(true);
      expect(restoredState.globalSettings).toEqual(serializedData.globalSettings);
      expect(restoredState.cacheStats).toEqual(serializedData.cacheStats);
    });

    it('從 JSON 恢復時應該處理缺少的欄位', () => {
      const minimalData = {
        version: '1.5.0'
      };

      const restoredState = ApplicationState.fromJSON(minimalData);

      expect(restoredState.version).toBe('1.5.0');
      expect(restoredState.environment).toBe('development');
      expect(restoredState.isInitialized).toBe(false);
      expect(restoredState.globalSettings).toEqual({});
      expect(restoredState.moduleStates).toEqual({});
    });
  });

  describe('狀態驗證', () => {
    it('應該能驗證狀態完整性', () => {
      expect(appState.isValid()).toBe(true);
    });

    it('應該能檢測無效的狀態', () => {
      // 創建一個具有無效數據的狀態
      const invalidState = Object.assign(Object.create(Object.getPrototypeOf(appState)), {
        ...appState,
        cacheStats: {
          hitCount: -1, // 無效的負數
          missCount: 0,
          totalSize: 0
        }
      });

      expect(invalidState.isValid()).toBe(false);
    });

    it('應該能取得狀態摘要', () => {
      const settings = { maxCacheSize: 1024 };
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      const stateWithData = appState
        .updateSettings(settings)
        .setModuleState('test', moduleState)
        .markInitialized()
        .incrementCacheHit()
        .recordOperation(120);

      const summary = stateWithData.getSummary();

      expect(summary).toHaveProperty('version');
      expect(summary).toHaveProperty('environment');
      expect(summary).toHaveProperty('isInitialized', true);
      expect(summary).toHaveProperty('moduleCount', 1);
      expect(summary).toHaveProperty('settingsCount', 1);
      expect(summary).toHaveProperty('cacheHitRate');
      expect(summary).toHaveProperty('totalOperations', 1);
    });
  });

  describe('狀態重設', () => {
    it('應該能重設所有狀態', () => {
      const settings = { maxCacheSize: 1024 };
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      const stateWithData = appState
        .updateSettings(settings)
        .setModuleState('test', moduleState)
        .markInitialized()
        .incrementCacheHit();

      const resetState = stateWithData.reset();

      expect(resetState.isInitialized).toBe(false);
      expect(resetState.moduleStates).toEqual({});
      expect(resetState.globalSettings).toEqual({});
      expect(resetState.cacheStats.hitCount).toBe(0);
      expect(resetState.performanceMetrics.totalOperations).toBe(0);
    });

    it('應該能部分重設狀態', () => {
      const settings = { maxCacheSize: 1024 };
      const moduleState = {
        isLoaded: true,
        lastUsed: new Date(),
        errorCount: 0,
        metadata: {}
      };

      const stateWithData = appState
        .updateSettings(settings)
        .setModuleState('test', moduleState)
        .incrementCacheHit();

      const partialResetState = stateWithData.resetModuleStates();

      expect(partialResetState.moduleStates).toEqual({});
      expect(partialResetState.globalSettings).toEqual(settings);
      expect(partialResetState.cacheStats.hitCount).toBe(1);
    });
  });
});