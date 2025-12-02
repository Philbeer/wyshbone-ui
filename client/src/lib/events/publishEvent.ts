/**
 * publishEvent - Central UI event publication system
 * 
 * This module provides a type-safe, synchronous event bus for UI events.
 * Components use publishEvent() to fire events and subscribe() to listen.
 * 
 * Usage:
 *   publishEvent("PACK_SELECTED", { packId: "breweries" });
 *   const unsubscribe = subscribe("CHAT_MESSAGE_SENT", (event) => { ... });
 */

import type {
  UIEventType,
  UIEventPayloadMap,
  UIEvent,
  UIEventListener,
  Unsubscribe,
} from "./event-types";

// ============================================================================
// Internal State
// ============================================================================

/** Global listeners for ALL events (useful for logging/debugging) */
type GlobalListener = UIEventListener<UIEventType>;

// Use a simpler Map structure to avoid complex TypeScript inference issues
const listeners = new Map<UIEventType, Set<UIEventListener<any>>>();
const globalListeners = new Set<GlobalListener>();

/** Simple ID generator for events */
let eventIdCounter = 0;
function generateEventId(): string {
  return `evt_${Date.now()}_${++eventIdCounter}`;
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Publish a typed event to all subscribers.
 * 
 * @param type - The event type (e.g., "PACK_SELECTED")
 * @param payload - The event payload (type-checked against UIEventPayloadMap)
 * 
 * @example
 * publishEvent("CHAT_MESSAGE_SENT", {
 *   conversationId: "abc123",
 *   messageId: "msg_1",
 *   content: "Hello world"
 * });
 */
export function publishEvent<T extends UIEventType>(
  type: T,
  payload: UIEventPayloadMap[T]
): void {
  const event: UIEvent<T> = {
    type,
    payload,
    timestamp: new Date().toISOString(),
    id: generateEventId(),
  };

  // Log in development for debugging
  if (import.meta.env.DEV) {
    console.log(`📣 [EVENT] ${type}`, payload);
  }

  // Notify type-specific listeners
  const typeListeners = listeners.get(type);
  if (typeListeners) {
    typeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`Error in event listener for ${type}:`, error);
      }
    });
  }

  // Notify global listeners
  globalListeners.forEach((listener) => {
    try {
      listener(event as UIEvent<UIEventType>);
    } catch (error) {
      console.error(`Error in global event listener:`, error);
    }
  });
}

/**
 * Subscribe to a specific event type.
 * 
 * @param type - The event type to listen for
 * @param listener - Callback function invoked when the event fires
 * @returns Unsubscribe function to remove the listener
 * 
 * @example
 * const unsubscribe = subscribe("PLAN_APPROVED", (event) => {
 *   console.log("Plan approved:", event.payload.planId);
 * });
 * // Later: unsubscribe();
 */
export function subscribe<T extends UIEventType>(
  type: T,
  listener: UIEventListener<T>
): Unsubscribe {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  
  const typeListeners = listeners.get(type)!;
  typeListeners.add(listener);

  return () => {
    typeListeners.delete(listener);
    if (typeListeners.size === 0) {
      listeners.delete(type);
    }
  };
}

/**
 * Subscribe to ALL events (useful for logging, analytics, debugging).
 * 
 * @param listener - Callback function invoked for every event
 * @returns Unsubscribe function
 * 
 * @example
 * subscribeAll((event) => {
 *   analytics.track(event.type, event.payload);
 * });
 */
export function subscribeAll(listener: GlobalListener): Unsubscribe {
  globalListeners.add(listener);
  
  return () => {
    globalListeners.delete(listener);
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Clear all listeners (primarily for testing).
 */
export function clearAllListeners(): void {
  listeners.clear();
  globalListeners.clear();
}

/**
 * Get the count of listeners for a specific event type (for testing).
 */
export function getListenerCount(type: UIEventType): number {
  return listeners.get(type)?.size ?? 0;
}

/**
 * Get the count of global listeners (for testing).
 */
export function getGlobalListenerCount(): number {
  return globalListeners.size;
}

