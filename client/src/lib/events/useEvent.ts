/**
 * React hooks for the UI event system
 * 
 * These hooks provide a convenient way to subscribe to events within React components,
 * automatically handling cleanup on unmount.
 */

import { useEffect, useRef, useCallback } from "react";
import type { UIEventType, UIEventListener, UIEvent } from "./event-types";
import { subscribe, subscribeAll, publishEvent as publish } from "./publishEvent";

/**
 * Hook to subscribe to a specific event type.
 * Automatically unsubscribes when component unmounts.
 * 
 * @param type - The event type to listen for
 * @param listener - Callback function (stable reference recommended)
 * 
 * @example
 * useEvent("CHAT_MESSAGE_RECEIVED", (event) => {
 *   console.log("New message:", event.payload.content);
 * });
 */
export function useEvent<T extends UIEventType>(
  type: T,
  listener: UIEventListener<T>
): void {
  // Use ref to always have the latest listener without re-subscribing
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const handler: UIEventListener<T> = (event) => {
      listenerRef.current(event);
    };

    const unsubscribe = subscribe(type, handler);
    return unsubscribe;
  }, [type]);
}

/**
 * Hook to subscribe to ALL events.
 * Useful for logging, analytics, or global state updates.
 * 
 * @param listener - Callback invoked for every event
 * 
 * @example
 * useEventAll((event) => {
 *   analytics.track(event.type, event.payload);
 * });
 */
export function useEventAll(
  listener: (event: UIEvent<UIEventType>) => void
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const handler = (event: UIEvent<UIEventType>) => {
      listenerRef.current(event);
    };

    const unsubscribe = subscribeAll(handler);
    return unsubscribe;
  }, []);
}

/**
 * Hook that returns a stable publishEvent function.
 * Useful when you need to pass the publisher as a prop or callback.
 * 
 * @returns The publishEvent function
 * 
 * @example
 * const emit = usePublishEvent();
 * const handleClick = () => emit("PACK_SELECTED", { packId: "breweries" });
 */
export function usePublishEvent() {
  return useCallback(
    <T extends UIEventType>(type: T, payload: UIEventType extends T ? never : typeof type extends T ? Parameters<typeof publish<T>>[1] : never) => {
      publish(type, payload as any);
    },
    []
  );
}

