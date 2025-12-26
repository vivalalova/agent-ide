/**
 * EventBus 測試
 * 測試事件訂閱、發送、取消訂閱、優先級處理和錯誤處理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus, EventBusError } from '@application/events/event-bus.js';
import {
  EventPriority,
  SystemEvents,
  type BaseEvent,
} from '@application/events/event-types.js';

// Helper to create a valid event
function createEvent(
  type: string,
  payload: Record<string, unknown> = {},
  priority: EventPriority = EventPriority.NORMAL
): BaseEvent {
  return {
    type,
    payload,
    timestamp: new Date(),
    priority,
  };
}

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.destroy();
  });

  describe('constructor', () => {
    it('should create an empty event bus', () => {
      const stats = eventBus.getStats();
      expect(stats.totalEmitted).toBe(0);
      expect(stats.totalHandled).toBe(0);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to an event type', () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event', handler);

      expect(eventBus.getSubscriberCount('test.event')).toBe(1);
    });

    it('should allow multiple subscribers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      expect(eventBus.getSubscriberCount('test.event')).toBe(2);
    });

    it('should return unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe('test.event', handler);

      expect(eventBus.getSubscriberCount('test.event')).toBe(1);

      unsubscribe();

      expect(eventBus.getSubscriberCount('test.event')).toBe(0);
    });

    it('should throw error for empty event type', () => {
      expect(() => eventBus.subscribe('', vi.fn())).toThrow(EventBusError);
      expect(() => eventBus.subscribe('   ', vi.fn())).toThrow(EventBusError);
    });

    it('should throw error for invalid handler', () => {
      expect(() => eventBus.subscribe('test', null as any)).toThrow(EventBusError);
      expect(() => eventBus.subscribe('test', 'not a function' as any)).toThrow(EventBusError);
    });

    it('should throw error when event bus is destroyed', () => {
      eventBus.destroy();
      expect(() => eventBus.subscribe('test', vi.fn())).toThrow('EventBus 已被銷毀');
    });
  });

  describe('emit', () => {
    it('should call handler when event is emitted', async () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event', handler);

      await eventBus.emit(createEvent('test.event', { data: 'test' }));

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'test.event',
        payload: { data: 'test' },
      }));
    });

    it('should call multiple handlers for same event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      await eventBus.emit(createEvent('test.event'));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should update emit stats', async () => {
      eventBus.subscribe('test.event', vi.fn());

      await eventBus.emit(createEvent('test.event'));
      await eventBus.emit(createEvent('test.event'));

      const stats = eventBus.getStats();
      expect(stats.totalEmitted).toBe(2);
    });

    it('should not call handler for different event type', async () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event1', handler);

      await eventBus.emit(createEvent('test.event2'));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should throw error for invalid event', async () => {
      await expect(eventBus.emit(null as any)).rejects.toThrow(EventBusError);
      await expect(eventBus.emit({ type: '', payload: {}, timestamp: new Date(), priority: EventPriority.NORMAL })).rejects.toThrow(EventBusError);
    });

    it('should throw error for event without valid payload', async () => {
      await expect(eventBus.emit({
        type: 'test',
        payload: null as any,
        timestamp: new Date(),
        priority: EventPriority.NORMAL,
      })).rejects.toThrow('payload');
    });

    it('should throw error for event without valid timestamp', async () => {
      await expect(eventBus.emit({
        type: 'test',
        payload: {},
        timestamp: 'not a date' as any,
        priority: EventPriority.NORMAL,
      })).rejects.toThrow('timestamp');
    });

    it('should throw error for event without valid priority', async () => {
      await expect(eventBus.emit({
        type: 'test',
        payload: {},
        timestamp: new Date(),
        priority: 999 as any,
      })).rejects.toThrow('priority');
    });

    it('should silently return when destroyed', async () => {
      eventBus.destroy();
      // Should not throw
      await eventBus.emit(createEvent('test.event'));
    });

    it('should wait for handlers when waitForHandlers option is true', async () => {
      let completed = false;
      const handler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        completed = true;
      });

      eventBus.subscribe('test.event', handler);

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      expect(completed).toBe(true);
    });
  });

  describe('once subscription', () => {
    it('should only call handler once for once subscription', async () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event', handler, { once: true });

      await eventBus.emit(createEvent('test.event'));
      await new Promise(resolve => setTimeout(resolve, 10));

      await eventBus.emit(createEvent('test.event'));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove subscription after once handler is called', async () => {
      eventBus.subscribe('test.event', vi.fn(), { once: true });

      expect(eventBus.getSubscriberCount('test.event')).toBe(1);

      await eventBus.emit(createEvent('test.event'));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(eventBus.getSubscriberCount('test.event')).toBe(0);
    });
  });

  describe('priority handling', () => {
    it('should process high priority events before normal priority', async () => {
      const order: number[] = [];

      eventBus.subscribe('test.event', () => order.push(1), { priority: EventPriority.NORMAL });
      eventBus.subscribe('test.event', () => order.push(2), { priority: EventPriority.HIGH });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      // High priority handler (2) should be called before normal (1)
      expect(order[0]).toBe(2);
      expect(order[1]).toBe(1);
    });

    it('should process critical priority events first', async () => {
      const order: number[] = [];

      eventBus.subscribe('test.event', () => order.push(1), { priority: EventPriority.LOW });
      eventBus.subscribe('test.event', () => order.push(2), { priority: EventPriority.NORMAL });
      eventBus.subscribe('test.event', () => order.push(3), { priority: EventPriority.HIGH });
      eventBus.subscribe('test.event', () => order.push(4), { priority: EventPriority.CRITICAL });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      // Should be processed in order: CRITICAL, HIGH, NORMAL, LOW
      expect(order).toEqual([4, 3, 2, 1]);
    });

    it('should queue high priority events', async () => {
      const handled: string[] = [];

      eventBus.subscribe('test.event', () => handled.push('normal'));
      eventBus.subscribe('high.event', () => handled.push('high'));

      // Emit high priority event first
      await eventBus.emit(createEvent('high.event', {}, EventPriority.HIGH));
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(handled).toContain('high');
    });
  });

  describe('error handling', () => {
    it('should call error handler when handler throws', async () => {
      const errorHandler = vi.fn();
      eventBus.onError(errorHandler);

      eventBus.subscribe('test.event', () => {
        throw new Error('Handler error');
      });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ type: 'test.event' })
      );
    });

    it('should update error stats when handler throws', async () => {
      eventBus.subscribe('test.event', () => {
        throw new Error('Handler error');
      });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      const stats = eventBus.getStats();
      expect(stats.errorCount).toBe(1);
    });

    it('should continue processing other handlers after error', async () => {
      const handler1 = vi.fn(() => {
        throw new Error('Error');
      });
      const handler2 = vi.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      expect(handler2).toHaveBeenCalled();
    });

    it('should handle error in error handler itself', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      eventBus.onError(() => {
        throw new Error('Error handler error');
      });

      eventBus.subscribe('test.event', () => {
        throw new Error('Handler error');
      });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('timeout handling', () => {
    it('should timeout handler that takes too long', async () => {
      const errorHandler = vi.fn();
      eventBus.onError(errorHandler);

      eventBus.subscribe('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      }, { timeout: 50 });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      expect(errorHandler).toHaveBeenCalled();
      expect(errorHandler.mock.calls[0][0].message).toContain('超時');
    });

    it('should complete handler within timeout', async () => {
      const handler = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      eventBus.subscribe('test.event', handler, { timeout: 100 });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getSubscriberCount', () => {
    it('should return 0 for event type with no subscribers', () => {
      expect(eventBus.getSubscriberCount('non.existent')).toBe(0);
    });

    it('should return correct count after subscriptions', () => {
      eventBus.subscribe('test.event', vi.fn());
      eventBus.subscribe('test.event', vi.fn());
      eventBus.subscribe('other.event', vi.fn());

      expect(eventBus.getSubscriberCount('test.event')).toBe(2);
      expect(eventBus.getSubscriberCount('other.event')).toBe(1);
    });

    it('should update count after unsubscribe', () => {
      const unsubscribe = eventBus.subscribe('test.event', vi.fn());
      eventBus.subscribe('test.event', vi.fn());

      expect(eventBus.getSubscriberCount('test.event')).toBe(2);

      unsubscribe();

      expect(eventBus.getSubscriberCount('test.event')).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return copy of stats', () => {
      const stats1 = eventBus.getStats();
      const stats2 = eventBus.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1.byEventType).not.toBe(stats2.byEventType);
    });

    it('should track stats by event type', async () => {
      eventBus.subscribe('event.a', vi.fn());
      eventBus.subscribe('event.b', vi.fn());

      await eventBus.emit(createEvent('event.a'));
      await eventBus.emit(createEvent('event.a'));
      await eventBus.emit(createEvent('event.b'));
      await new Promise(resolve => setTimeout(resolve, 20));

      const stats = eventBus.getStats();
      expect(stats.byEventType.get('event.a')?.emitted).toBe(2);
      expect(stats.byEventType.get('event.b')?.emitted).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should clear all subscriptions', () => {
      eventBus.subscribe('event.a', vi.fn());
      eventBus.subscribe('event.b', vi.fn());

      eventBus.destroy();

      expect(eventBus.getSubscriberCount('event.a')).toBe(0);
      expect(eventBus.getSubscriberCount('event.b')).toBe(0);
    });

    it('should prevent new subscriptions after destroy', () => {
      eventBus.destroy();

      expect(() => eventBus.subscribe('test', vi.fn())).toThrow(EventBusError);
    });

    it('should be idempotent', () => {
      eventBus.destroy();
      eventBus.destroy(); // Should not throw
    });
  });

  describe('system events', () => {
    it('should handle system events correctly', async () => {
      const handler = vi.fn();
      eventBus.subscribe(SystemEvents.MODULE_INITIALIZED, handler);

      await eventBus.emit({
        type: SystemEvents.MODULE_INITIALIZED,
        payload: {
          moduleName: 'test-module',
          version: '1.0.0',
        },
        timestamp: new Date(),
        priority: EventPriority.NORMAL,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: SystemEvents.MODULE_INITIALIZED,
        payload: expect.objectContaining({
          moduleName: 'test-module',
        }),
      }));
    });

    it('should handle all system event types', async () => {
      const events = [
        SystemEvents.MODULE_INITIALIZED,
        SystemEvents.MODULE_DESTROYED,
        SystemEvents.ERROR_OCCURRED,
        SystemEvents.CACHE_UPDATED,
        SystemEvents.CACHE_INVALIDATED,
        SystemEvents.FILE_CHANGED,
        SystemEvents.SESSION_STARTED,
        SystemEvents.SESSION_ENDED,
      ];

      for (const eventType of events) {
        const handler = vi.fn();
        eventBus.subscribe(eventType, handler);

        await eventBus.emit(createEvent(eventType, { test: true }));
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(handler).toHaveBeenCalled();
      }
    });
  });

  describe('EventBusError', () => {
    it('should create error with message', () => {
      const error = new EventBusError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('EVENT_BUS_ERROR');
    });

    it('should create error with details', () => {
      const error = new EventBusError('Test error', { key: 'value' });
      expect(error.details).toEqual({ key: 'value' });
    });

    it('should create error with cause', () => {
      const cause = new Error('Cause');
      const error = new EventBusError('Test error', undefined, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('edge cases', () => {
    it('should handle event with no subscribers', async () => {
      // Should not throw
      await eventBus.emit(createEvent('no.subscribers'));

      const stats = eventBus.getStats();
      expect(stats.totalEmitted).toBe(1);
    });

    it('should handle rapid event emissions', async () => {
      let count = 0;
      eventBus.subscribe('rapid.event', () => count++);

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(eventBus.emit(createEvent('rapid.event')));
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(count).toBe(100);
    });

    it('should handle unsubscribe during emit', async () => {
      // 使用閉包捕獲 unsubscribe 引用，執行時已完成賦值
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe('test.event', () => {
        handler();
        unsubscribe();
      });

      await eventBus.emit(createEvent('test.event'));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(eventBus.getSubscriberCount('test.event')).toBe(0);
    });

    it('should handle async handlers', async () => {
      const results: number[] = [];

      eventBus.subscribe('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        results.push(1);
      });

      eventBus.subscribe('test.event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(2);
      });

      await eventBus.emit(createEvent('test.event'), { waitForHandlers: true });

      // Both handlers should complete
      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it('should handle subscription removal of empty event map', async () => {
      const unsubscribe = eventBus.subscribe('test.event', vi.fn());
      unsubscribe();

      // Should not have the event type in subscriptions anymore
      expect(eventBus.getSubscriberCount('test.event')).toBe(0);
    });
  });
});
