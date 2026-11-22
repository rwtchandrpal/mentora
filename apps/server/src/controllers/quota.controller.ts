import { Request, Response } from 'express';
import { ApiSuccessEnvelope, QuotaMetaDTO } from '@mentora/shared';
import { getGuestIdentifier, peekGuestQuota, toQuotaMetaDTO } from '../middlewares/quota.middleware.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/AppError.js';
import { ErrorCode } from '@mentora/shared';

export const quotaController = {
  /** Current AI quota for the caller. Read-only: it never reserves a unit. */
  async getQuota(
    req: Request,
    res: Response<ApiSuccessEnvelope<{ quota: QuotaMetaDTO }>>
  ): Promise<void> {
    let quota: QuotaMetaDTO;
    if (req.user) {
      const user = await userRepository.syncQuotaWindow(req.user.id);
      if (!user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'User account not found');
      }
      quota = toQuotaMetaDTO(user.usageQuota);
    } else {
      quota = await peekGuestQuota(getGuestIdentifier(req));
    }
    res.status(200).json({ success: true, data: { quota } });
  },
};
