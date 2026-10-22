// [KO] 주문을 PostgreSQL orders 테이블에 저장하는 서비스. DB를 인자로 받는 팩토리 함수

import type { Pool } from 'pg';

export interface OrderInput {
  userId: string;
  productId: string;
  // Epoch milliseconds
  purchasedAt: number;
}

export type OrderService = ReturnType<typeof createOrderService>;

export function createOrderService({ pool }: { pool: Pool }) {
  // The same order can be delivered more than once, so an existing
  // (user_id, product_id) row is left as is
  // [KO] 주문 저장. 새로 저장했으면 true, 이미 있어서 무시됐으면 false
  async function createOrder(order: OrderInput): Promise<boolean> {
    const result = await pool.query(
      `INSERT INTO orders (user_id, product_id, purchased_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [order.userId, order.productId, new Date(order.purchasedAt)],
    );
    return result.rowCount === 1;
  }

  return { createOrder };
}
