// Helper for the success response { success: true, data }

import type { Response } from 'express';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export function ok<T>(res: Response, data: T): void {
  const body: SuccessResponse<T> = { success: true, data };
  res.json(body);
}
