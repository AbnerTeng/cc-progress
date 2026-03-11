// Token limits by plan
// Source: https://www.faros.ai/blog/claude-code-token-limits
//         https://portkey.ai/blog/claude-code-limits/

export type Plan = 'pro' | 'max5' | 'max20' | 'api';

interface PlanLimits {
  label: string;
  windowTokens: number;   // per 5-hour rolling window
  weeklyTokens: number;   // estimated weekly (window × ~4 resets/day × 7 days * 0.6 typical usage factor)
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  pro: {
    label: 'Pro',
    windowTokens: 44_000,
    weeklyTokens: 440_000,      // conservative weekly estimate
  },
  max5: {
    label: 'Max ×5',
    windowTokens: 88_000,
    weeklyTokens: 880_000,
  },
  max20: {
    label: 'Max ×20',
    windowTokens: 220_000,
    weeklyTokens: 2_200_000,
  },
  api: {
    label: 'API',
    windowTokens: Infinity,     // pay-as-you-go, user sets custom limit
    weeklyTokens: Infinity,
  },
};

export function getWindowLimit(plan: Plan, customWeekly: number): number {
  return PLAN_LIMITS[plan].windowTokens;
}

export function getWeeklyLimit(plan: Plan, customWeekly: number): number {
  if (plan === 'api') return customWeekly > 0 ? customWeekly : Infinity;
  return customWeekly > 0 ? customWeekly : PLAN_LIMITS[plan].weeklyTokens;
}
