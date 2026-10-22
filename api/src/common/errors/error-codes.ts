// [KO] 모든 에러 코드와 HTTP status·기본 메시지를 정의하는 유일한 곳

export const ERROR_CODES = {
  SALE_NOT_ACTIVE: { status: 403, message: 'The sale is not active' },
  SOLD_OUT: { status: 409, message: 'The item is sold out' },
  ALREADY_PURCHASED: {
    status: 409,
    message: 'You have already purchased this item',
  },
  VALIDATION_ERROR: {
    status: 400,
    message: 'Invalid request',
  },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'Service is temporarily unavailable',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'Internal server error',
  },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;
