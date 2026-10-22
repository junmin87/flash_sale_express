// [KO] 구매 컨트롤러: 구매 요청(201)과 구매 여부 조회를 서비스에 위임

import type { Request, Response } from 'express';
import { ok } from '../common/response.js';
import type { PurchaseService } from '../services/purchase.service.js';
import type { UserIdInput } from '../validators/purchase.validator.js';

export function createPurchaseController(purchaseService: PurchaseService) {
  return {
    // req.body has already passed the userIdSchema validation
    async purchase(req: Request, res: Response): Promise<void> {
      const { userId } = req.body as UserIdInput;
      ok(res.status(201), await purchaseService.purchase(userId));
    },

    // req.params has already passed the userIdSchema validation
    async getPurchase(req: Request, res: Response): Promise<void> {
      const { userId } = req.params as unknown as UserIdInput;
      ok(res, await purchaseService.getPurchase(userId));
    },
  };
}
