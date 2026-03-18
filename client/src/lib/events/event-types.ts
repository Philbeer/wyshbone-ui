/**
 * UI Event Types and Payload Definitions
 * 
 * This module defines all typed events that can be published through the UI event system.
 * Use discriminated unions to ensure type-safe payloads per event type.
 */

// ============================================================================
// Event Types
// ============================================================================

export type UIEventType =
  | "PACK_SELECTED"
  | "AGENT_STARTED"
  | "AGENT_STOPPED"
  | "PLAN_CREATED"
  | "PLAN_APPROVED"
  | "PLAN_UPDATED"
  | "CHAT_MESSAGE_SENT"
  | "CHAT_MESSAGE_RECEIVED"
  | "SIDEBAR_FLASH"
  | "SESSION_STARTED"
  | "SESSION_ENDED";

// ============================================================================
// Payload Map - Maps each event type to its required payload
// ============================================================================

export type UIEventPayloadMap = {
  PACK_SELECTED: {
    packId: string;
    packName?: string;
  };
  AGENT_STARTED: {
    sessionId: string;
    packId?: string;
    mode?: "standard";
  };
  AGENT_STOPPED: {
    sessionId: string;
    reason?: "completed" | "cancelled" | "error" | "timeout";
  };
  PLAN_CREATED: {
    planId: string;
    sessionId?: string;
    goal: string;
    stepCount: number;
  };
  PLAN_APPROVED: {
    planId: string;
    sessionId?: string;
  };
  PLAN_UPDATED: {
    planId: string;
    sessionId?: string;
    stepCount: number;
    status?: string;
  };
  CHAT_MESSAGE_SENT: {
    conversationId: string;
    messageId: string;
    content: string;
    mode?: "standard";
  };
  CHAT_MESSAGE_RECEIVED: {
    conversationId: string;
    messageId: string;
    content: string;
    source?: "assistant" | "supervisor";
  };
  SIDEBAR_FLASH: {
    section: "emailFinder" | "scheduledMonitors" | "deepResearch";
  };
  SESSION_STARTED: {
    sessionId: string;
    userId?: string;
  };
  SESSION_ENDED: {
    sessionId: string;
    reason?: string;
  };
};

// ============================================================================
// UIEvent - The full event object with metadata
// ============================================================================

export type UIEvent<T extends UIEventType = UIEventType> = {
  type: T;
  payload: UIEventPayloadMap[T];
  timestamp: string;
  id: string;
};

// ============================================================================
// Type Helpers
// ============================================================================

/** Get the payload type for a specific event type */
export type PayloadFor<T extends UIEventType> = UIEventPayloadMap[T];

/** Event listener callback type */
export type UIEventListener<T extends UIEventType = UIEventType> = (
  event: UIEvent<T>
) => void;

/** Unsubscribe function returned by subscribe */
export type Unsubscribe = () => void;

