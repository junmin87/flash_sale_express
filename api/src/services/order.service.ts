// Service that saves orders to the PostgreSQL orders table. A factory function
// that takes the DB

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
  // Returns true if the order was saved, false if it already existed
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
