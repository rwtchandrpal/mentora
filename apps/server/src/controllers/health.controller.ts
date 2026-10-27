import { Request, Response } from 'express';
import { ApiSuccessEnvelope } from '@mentora/shared';

export interface HealthCheckData {
  status: 'ok';
  uptime: number;
}

export const getHealth = (
  _req: Request,
  res: Response<ApiSuccessEnvelope<HealthCheckData>>
): void => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
    },
  });
};
