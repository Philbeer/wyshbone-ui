/**
 * UI Event System
 * 
 * A type-safe, synchronous event bus for publishing and subscribing to UI events.
 * 
 * @example
 * // Publishing an event
 * import { publishEvent } from "@/lib/events";
 * publishEvent("CHAT_MESSAGE_SENT", { conversationId: "abc", messageId: "1", content: "Hello" });
 * 
 * // Subscribing to an event
 * import { subscribe } from "@/lib/events";
 * const unsubscribe = subscribe("CHAT_MESSAGE_SENT", (event) => {
 *   console.log("Message sent:", event.payload.content);
 * });
 * 
 * // Using React hooks
 * import { useEvent } from "@/lib/events";
 * useEvent("PLAN_APPROVED", (event) => {
 *   console.log("Plan approved:", event.payload.planId);
 * });
 */

// Core types
export type {
  UIEventType,
  UIEventPayloadMap,
  UIEvent,
  UIEventListener,
  PayloadFor,
  Unsubscribe,
} from "./event-types";

// Core functions
export {
  publishEvent,
  subscribe,
  subscribeAll,
  clearAllListeners,
  getListenerCount,
  getGlobalListenerCount,
} from "./publishEvent";

// React hooks
export { useEvent, useEventAll, usePublishEvent } from "./useEvent";

