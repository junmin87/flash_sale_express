// [KO] Redis 키 이름 상수. 키 문자열은 여기서만 정의한다

export const REDIS_KEYS = {
  // Sale window boundaries, epoch milliseconds
  SALE_START_AT: 'sale:start_at',
  SALE_END_AT: 'sale:end_at',
  // Remaining stock
  SALE_STOCK: 'sale:stock',
  // Stock the sale was configured with
  SALE_TOTAL_STOCK: 'sale:total_stock',
  // Set of user ids that have purchased
  SALE_BUYERS: 'sale:buyers',
  // Stream of orders waiting to be persisted
  ORDER_STREAM: 'sale:orders',
  // Consumer group of the order stream, read by the order worker
  ORDER_GROUP: 'order-workers',
} as const;
