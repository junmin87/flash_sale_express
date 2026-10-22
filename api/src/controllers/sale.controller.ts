// [KO] 세일 컨트롤러: 현재 세일 상태 조회

import type { Request, Response } from 'express';
import { ok } from '../common/response.js';
import type { SaleService } from '../services/sale.service.js';

export function createSaleController(saleService: SaleService) {
  return {
    async getSale(_req: Request, res: Response): Promise<void> {
      ok(res, await saleService.getSale());
    },
  };
}
