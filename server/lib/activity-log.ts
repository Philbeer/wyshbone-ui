/**
 * Activity Log - Local Wyshbone system activity tracking
 * 
 * Tracks background jobs, syncs, AI discoveries, and user actions
 * for the "Recent Activity" panel in the UI.
 */

import { getDrizzleDb } from "../storage";
import { activityLog } from "../../shared/schema";

export type ActivityCategory = 'system' | 'ai' | 'sync' | 'user';

export type ActivityType = 
  | 'database_update'    // Nightly pub verification
  | 'xero_sync'          // Xero order/customer import
  | 'xero_export'        // Export to Xero
  | 'ai_discovery'       // AI found new pubs
  | 'entity_match'       // AI matched entities
  | 'event_found'        // Discovered events
  | 'price_alert'        // Price changes detected
  | 'freehouse_research' // Freehouse status research
  | 'supplier_sync'      // Supplier data synced
  | 'customer_created'   // New customer added
  | 'order_created'      // New order created
  | 'manual_action';     // User manual action

export interface LogActivityParams {
  workspaceId: number;
  activityType: ActivityType | string;
  category: ActivityCategory;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  userId?: string;
}

/**
 * Log a system activity for the workspace
 * 
 * @example
 * await logActivity({
 *   workspaceId: 1,
 *   activityType: 'xero_sync',
 *   category: 'sync',
 *   title: 'Imported 12 new orders',
 *   description: 'Synced from Xero: 12 orders processed, £4,250 total',
 *   metadata: { ordersImported: 12, totalValue: 4250 }
 * });
 */
export async function logActivity(activity: LogActivityParams): Promise<void> {
  try {
    const db = getDrizzleDb();
    
    await db.insert(activityLog).values({
      workspaceId: activity.workspaceId,
      activityType: activity.activityType,
      category: activity.category,
      title: activity.title,
      description: activity.description || null,
      entityType: activity.entityType || null,
      entityId: activity.entityId || null,
      metadata: activity.metadata || null,
      userId: activity.userId || null,
      createdAt: new Date()
    });
    
    console.log(`📝 [ACTIVITY] ${activity.category}/${activity.activityType}: ${activity.title}`);
  } catch (error) {
    // Don't throw - activity logging shouldn't break main functionality
    console.error('Failed to log activity:', error);
  }
}

/**
 * Convenience functions for common activity types
 */

export async function logXeroSync(
  workspaceId: number,
  title: string,
  metadata?: Record<string, any>,
  description?: string
): Promise<void> {
  await logActivity({
    workspaceId,
    activityType: 'xero_sync',
    category: 'sync',
    title,
    description,
    metadata
  });
}

export async function logAIDiscovery(
  workspaceId: number,
  title: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logActivity({
    workspaceId,
    activityType: 'ai_discovery',
    category: 'ai',
    title,
    entityType,
    entityId,
    metadata
  });
}

export async function logEntityMatch(
  workspaceId: number,
  title: string,
  entityType: string,
  entityId: string,
  confidence: number,
  metadata?: Record<string, any>
): Promise<void> {
  await logActivity({
    workspaceId,
    activityType: 'entity_match',
    category: 'ai',
    title,
    description: `AI confidence: ${(confidence * 100).toFixed(0)}%`,
    entityType,
    entityId,
    metadata: { ...metadata, confidence }
  });
}

export async function logDatabaseUpdate(
  workspaceId: number,
  pubsVerified: number,
  closedPubs: number,
  newPubs: number,
  metadata?: Record<string, any>
): Promise<void> {
  await logActivity({
    workspaceId,
    activityType: 'database_update',
    category: 'system',
    title: `Verified ${pubsVerified} pubs`,
    description: closedPubs > 0 || newPubs > 0 
      ? `Found ${closedPubs} closed pubs, ${newPubs} new pubs`
      : undefined,
    metadata: { pubsVerified, closedPubs, newPubs, ...metadata }
  });
}

export async function logEventFound(
  workspaceId: number,
  eventName: string,
  eventType: string,
  eventDate: string,
  location: string,
  eventId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logActivity({
    workspaceId,
    activityType: 'event_found',
    category: 'ai',
    title: `Found "${eventName}"`,
    description: `${eventType} on ${eventDate} in ${location}`,
    entityType: 'event',
    entityId: eventId,
    metadata: { eventName, eventType, eventDate, location, ...metadata }
  });
}

export async function logUserAction(
  workspaceId: number,
  userId: string,
  title: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logActivity({
    workspaceId,
    activityType: 'manual_action',
    category: 'user',
    title,
    entityType,
    entityId,
    userId,
    metadata
  });
}

