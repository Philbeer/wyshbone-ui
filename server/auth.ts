import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateId(): string {
  return randomBytes(16).toString("hex");
}

// Subscription tier limits
export const TIER_LIMITS = {
  free: {
    monitors: 2,
    deepResearch: 2,
    displayName: "Free",
  },
  basic: {
    monitors: 10,
    deepResearch: 25,
    displayName: "Basic (£35/month)",
  },
  pro: {
    monitors: 50,
    deepResearch: 100,
    displayName: "Pro (£70/month)",
  },
  business: {
    monitors: 200,
    deepResearch: 500,
    displayName: "Business (£120/month)",
  },
  enterprise: {
    monitors: Infinity,
    deepResearch: Infinity,
    displayName: "Enterprise (£250/month)",
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export function canCreateMonitor(tier: SubscriptionTier, currentCount: number): boolean {
  return currentCount < TIER_LIMITS[tier].monitors;
}

export function canCreateDeepResearch(tier: SubscriptionTier, currentCount: number): boolean {
  return currentCount < TIER_LIMITS[tier].deepResearch;
}
