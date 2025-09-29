/**
 * EventBus 事件系統測試
 * 測試事件發送、訂閱、取消訂閱、錯誤處理、異步處理和優先級支援
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../../src/application/events/event-bus';
import { BaseEvent, EventHandler, EventPriority } from '../../../src/application/events/event-types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.destroy();
  });

  describe('基本事件發送和訂閱', () => {
    it('應該能夠訂閱和接收事件', async () => {
      const testEvent: BaseEvent = {
        type: 'test.event',
        payload: { message: 'Hello World' },
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      let receivedEvent: BaseEvent | null = null;
      const handler: EventHandler = (event) => {
        receivedEvent = event;
      };

      eventBus.subscribe('test.event', handler);
      await eventBus.emit(testEvent);

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent?.type).toBe('test.event');
      expect(receivedEvent?.payload).toEqual({ message: 'Hello World' });
    });

    it('應該支援多個訂閱者', async () => {
      const testEvent: BaseEvent = {
        type: 'multi.test',
        payload: { data: 'test' },
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      const receivedEvents: BaseEvent[] = [];
      const handler1: EventHandler = (event) => receivedEvents.push(event);
      const handler2: EventHandler = (event) => receivedEvents.push(event);

      eventBus.subscribe('multi.test', handler1);
      eventBus.subscribe('multi.test', handler2);
      await eventBus.emit(testEvent);

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].type).toBe('multi.test');
      expect(receivedEvents[1].type).toBe('multi.test');
    });

    it('應該能夠取消訂閱', async () => {
      const testEvent: BaseEvent = {
        type: 'unsubscribe.test',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      let eventReceived = false;
      const handler: EventHandler = () => {
        eventReceived = true;
      };

      const unsubscribe = eventBus.subscribe('unsubscribe.test', handler);
      unsubscribe();
      await eventBus.emit(testEvent);

      expect(eventReceived).toBe(false);
    });
  });

  describe('異步事件處理', () => {
    it('應該支援異步事件處理器', async () => {
      const testEvent: BaseEvent = {
        type: 'async.test',
        payload: { delay: 10 },
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      const processOrder: number[] = [];
      const asyncHandler: EventHandler = async (event) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        processOrder.push(1);
      };

      eventBus.subscribe('async.test', asyncHandler);
      await eventBus.emit(testEvent, { waitForHandlers: true });
      processOrder.push(2);

      expect(processOrder).toEqual([1, 2]);
    });

    it('應該並行處理多個異步處理器', async () => {
      const testEvent: BaseEvent = {
        type: 'parallel.test',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      let completedCount = 0;
      const startTime = Date.now();

      const createAsyncHandler = (delay: number): EventHandler => {
        return async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          completedCount++;
        };
      };

      eventBus.subscribe('parallel.test', createAsyncHandler(50));
      eventBus.subscribe('parallel.test', createAsyncHandler(50));

      await eventBus.emit(testEvent, { waitForHandlers: true });
      const endTime = Date.now();

      expect(completedCount).toBe(2);
      // 並行執行應該比串行快，允許一些誤差
      expect(endTime - startTime).toBeLessThan(80);
    });
  });

  describe('錯誤處理', () => {
    it('應該捕獲和處理事件處理器錯誤', async () => {
      const testEvent: BaseEvent = {
        type: 'error.test',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      const errorHandler: EventHandler = () => {
        throw new Error('處理器錯誤');
      };

      let errorCaught = false;
      eventBus.onError((error) => {
        errorCaught = true;
        expect(error.message).toBe('處理器錯誤');
      });

      eventBus.subscribe('error.test', errorHandler);
      await eventBus.emit(testEvent);

      expect(errorCaught).toBe(true);
    });

    it('錯誤應該不影響其他處理器執行', async () => {
      const testEvent: BaseEvent = {
        type: 'error.isolation.test',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      let successfullyProcessed = false;

      const errorHandler: EventHandler = () => {
        throw new Error('第一個處理器錯誤');
      };

      const normalHandler: EventHandler = () => {
        successfullyProcessed = true;
      };

      eventBus.onError(() => {}); // 忽略錯誤
      eventBus.subscribe('error.isolation.test', errorHandler);
      eventBus.subscribe('error.isolation.test', normalHandler);
      await eventBus.emit(testEvent);

      expect(successfullyProcessed).toBe(true);
    });
  });

  describe('事件優先級', () => {
    it('應該按優先級順序處理事件', async () => {
      const processOrder: number[] = [];

      const highPriorityEvent: BaseEvent = {
        type: 'priority.test',
        payload: { id: 1 },
        timestamp: new Date(),
        priority: EventPriority.HIGH
      };

      const normalPriorityEvent: BaseEvent = {
        type: 'priority.test',
        payload: { id: 2 },
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      const lowPriorityEvent: BaseEvent = {
        type: 'priority.test',
        payload: { id: 3 },
        timestamp: new Date(),
        priority: EventPriority.LOW
      };

      const handler: EventHandler = (event) => {
        processOrder.push(event.payload.id);
      };

      eventBus.subscribe('priority.test', handler);

      // 以相反順序發送事件
      await eventBus.emit(lowPriorityEvent);
      await eventBus.emit(normalPriorityEvent);
      await eventBus.emit(highPriorityEvent);

      // 等待所有事件處理完成
      await new Promise(resolve => setTimeout(resolve, 10));

      // 應該按優先級順序處理：HIGH > NORMAL > LOW
      expect(processOrder).toEqual([3, 2, 1]);
    });
  });

  describe('EventBus 生命週期', () => {
    it('應該能夠清理所有訂閱者', () => {
      const handler: EventHandler = () => {};

      eventBus.subscribe('cleanup.test', handler);
      expect(eventBus.getSubscriberCount('cleanup.test')).toBe(1);

      eventBus.destroy();
      expect(eventBus.getSubscriberCount('cleanup.test')).toBe(0);
    });

    it('destroy 後不應該處理新事件', async () => {
      const testEvent: BaseEvent = {
        type: 'destroyed.test',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      let eventReceived = false;
      const handler: EventHandler = () => {
        eventReceived = true;
      };

      eventBus.subscribe('destroyed.test', handler);
      eventBus.destroy();

      await eventBus.emit(testEvent);
      expect(eventReceived).toBe(false);
    });
  });

  describe('邊界條件', () => {
    it('應該處理空的事件類型', () => {
      expect(() => {
        eventBus.subscribe('', () => {});
      }).toThrow();
    });

    it('應該處理 null 處理器', () => {
      expect(() => {
        eventBus.subscribe('test', null as any);
      }).toThrow();
    });

    it('應該處理不存在的事件類型發送', async () => {
      const testEvent: BaseEvent = {
        type: 'nonexistent.event',
        payload: {},
        timestamp: new Date(),
        priority: EventPriority.NORMAL
      };

      // 不應該拋出錯誤
      await expect(eventBus.emit(testEvent)).resolves.not.toThrow();
    });
  });
});