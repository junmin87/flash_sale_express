import type { Request, Response } from 'express';
import { ok } from '../common/response.js';
import type { SaleService } from '../services/sale.service.js';
import type { SetSaleInput } from '../validators/sale.validator.js';

export function createAdminController(saleService: SaleService) {
  return {
    // req.body has already passed the setSaleSchema validation
    async setSale(req: Request, res: Response): Promise<void> {
      const state = await saleService.setSale(req.body as SetSaleInput);
      ok(res.status(201), state);
    },
  };
}
