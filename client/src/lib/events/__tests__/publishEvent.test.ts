import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  publishEvent,
  subscribe,
  subscribeAll,
  clearAllListeners,
  getListenerCount,
  getGlobalListenerCount,
} from "../publishEvent";
import type { UIEvent } from "../event-types";

describe("publishEvent", () => {
  beforeEach(() => {
    clearAllListeners();
  });

  describe("subscribe + publish", () => {
    it("should call listener when event is published", () => {
      const listener = vi.fn();
      subscribe("PACK_SELECTED", listener);

      publishEvent("PACK_SELECTED", { packId: "breweries" });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "PACK_SELECTED",
          payload: { packId: "breweries" },
        })
      );
    });

    it("should include timestamp and id in event", () => {
      const listener = vi.fn();
      subscribe("AGENT_STARTED", listener);

      publishEvent("AGENT_STARTED", { sessionId: "sess_123" });

      const event = listener.mock.calls[0][0] as UIEvent<"AGENT_STARTED">;
      expect(event.timestamp).toBeDefined();
      expect(event.id).toMatch(/^evt_/);
    });

    it("should not call listener for different event types", () => {
      const listener = vi.fn();
      subscribe("PACK_SELECTED", listener);

      publishEvent("AGENT_STARTED", { sessionId: "sess_123" });

      expect(listener).not.toHaveBeenCalled();
    });

    it("should support multiple listeners for the same event", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      subscribe("PLAN_APPROVED", listener1);
      subscribe("PLAN_APPROVED", listener2);

      publishEvent("PLAN_APPROVED", { planId: "plan_1" });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("unsubscribe", () => {
    it("should stop receiving events after unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = subscribe("CHAT_MESSAGE_SENT", listener);

      publishEvent("CHAT_MESSAGE_SENT", {
        conversationId: "conv_1",
        messageId: "msg_1",
        content: "Hello",
      });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      publishEvent("CHAT_MESSAGE_SENT", {
        conversationId: "conv_1",
        messageId: "msg_2",
        content: "World",
      });
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe("subscribeAll", () => {
    it("should receive all events regardless of type", () => {
      const listener = vi.fn();
      subscribeAll(listener);

      publishEvent("PACK_SELECTED", { packId: "breweries" });
      publishEvent("AGENT_STARTED", { sessionId: "sess_1" });
      publishEvent("PLAN_APPROVED", { planId: "plan_1" });

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("should be called alongside type-specific listeners", () => {
      const globalListener = vi.fn();
      const specificListener = vi.fn();

      subscribeAll(globalListener);
      subscribe("PACK_SELECTED", specificListener);

      publishEvent("PACK_SELECTED", { packId: "breweries" });

      expect(globalListener).toHaveBeenCalledTimes(1);
      expect(specificListener).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should continue calling other listeners if one throws", () => {
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodListener = vi.fn();

      subscribe("PACK_SELECTED", errorListener);
      subscribe("PACK_SELECTED", goodListener);

      // Should not throw, and goodListener should still be called
      expect(() => {
        publishEvent("PACK_SELECTED", { packId: "breweries" });
      }).not.toThrow();

      expect(errorListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);
    });
  });

  describe("getListenerCount", () => {
    it("should return correct count of listeners", () => {
      expect(getListenerCount("PACK_SELECTED")).toBe(0);

      const unsub1 = subscribe("PACK_SELECTED", vi.fn());
      expect(getListenerCount("PACK_SELECTED")).toBe(1);

      const unsub2 = subscribe("PACK_SELECTED", vi.fn());
      expect(getListenerCount("PACK_SELECTED")).toBe(2);

      unsub1();
      expect(getListenerCount("PACK_SELECTED")).toBe(1);

      unsub2();
      expect(getListenerCount("PACK_SELECTED")).toBe(0);
    });
  });

  describe("getGlobalListenerCount", () => {
    it("should return correct count of global listeners", () => {
      expect(getGlobalListenerCount()).toBe(0);

      const unsub = subscribeAll(vi.fn());
      expect(getGlobalListenerCount()).toBe(1);

      unsub();
      expect(getGlobalListenerCount()).toBe(0);
    });
  });

  describe("clearAllListeners", () => {
    it("should remove all listeners", () => {
      subscribe("PACK_SELECTED", vi.fn());
      subscribe("AGENT_STARTED", vi.fn());
      subscribeAll(vi.fn());

      expect(getListenerCount("PACK_SELECTED")).toBe(1);
      expect(getListenerCount("AGENT_STARTED")).toBe(1);
      expect(getGlobalListenerCount()).toBe(1);

      clearAllListeners();

      expect(getListenerCount("PACK_SELECTED")).toBe(0);
      expect(getListenerCount("AGENT_STARTED")).toBe(0);
      expect(getGlobalListenerCount()).toBe(0);
    });
  });
});

describe("Type safety (compile-time)", () => {
  it("should enforce correct payload types", () => {
    // These should compile without errors
    publishEvent("PACK_SELECTED", { packId: "breweries" });
    publishEvent("PACK_SELECTED", { packId: "breweries", packName: "Brewery CRM" });
    publishEvent("AGENT_STARTED", { sessionId: "sess_1" });
    publishEvent("AGENT_STARTED", { sessionId: "sess_1", packId: "breweries", mode: "mega" });
    publishEvent("CHAT_MESSAGE_SENT", {
      conversationId: "conv_1",
      messageId: "msg_1",
      content: "Hello",
    });
    publishEvent("PLAN_CREATED", {
      planId: "plan_1",
      goal: "Find leads",
      stepCount: 3,
    });

    // TypeScript would catch these errors at compile time:
    // publishEvent("PACK_SELECTED", { id: "wrong" }); // Error: 'id' is not assignable
    // publishEvent("PACK_SELECTED", {}); // Error: missing required 'packId'
    // publishEvent("UNKNOWN_EVENT", {}); // Error: 'UNKNOWN_EVENT' is not assignable

    expect(true).toBe(true); // If we get here, types are correct
  });
});

