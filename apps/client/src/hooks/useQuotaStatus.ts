import { useAppSelector } from '../store/hooks.js';
import { DAILY_AI_QUOTA_LIMIT } from '@mentora/shared';

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  isExhausted: boolean;
  resetAt: string | null;
  formattedResetTime: string;
  percentageUsed: number;
}

export const useQuotaStatus = (): QuotaStatus => {
  const { quota, user } = useAppSelector((state) => state.auth);

  const limit = quota?.limit ?? user?.usageQuota?.dailyLimit ?? DAILY_AI_QUOTA_LIMIT;
  const used = quota?.used ?? user?.usageQuota?.dailyCount ?? 0;
  const resetAt = quota?.resetAt ?? user?.usageQuota?.windowResetAt ?? null;

  const remaining = Math.max(0, limit - used);
  const isExhausted = remaining <= 0;
  const percentageUsed = Math.min(100, Math.round((used / limit) * 100));

  let formattedResetTime = 'tomorrow';
  if (resetAt) {
    try {
      const resetDate = new Date(resetAt);
      formattedResetTime = resetDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      formattedResetTime = 'in 24 hours';
    }
  }

  return {
    used,
    limit,
    remaining,
    isExhausted,
    resetAt,
    formattedResetTime,
    percentageUsed,
  };
};

export default useQuotaStatus;
