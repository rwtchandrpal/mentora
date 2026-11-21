import { Request } from 'express';

/**
 * Reads the session ID route param (`:sessionId` on mode routers, `:id` on the
 * session router). Express can surface repeated params as arrays; take the first.
 */
export const extractSessionId = (req: Request): string => {
  const param: string | string[] | undefined = req.params.sessionId ?? req.params.id;
  if (Array.isArray(param)) {
    return param[0] ?? '';
  }
  return param ?? '';
};
