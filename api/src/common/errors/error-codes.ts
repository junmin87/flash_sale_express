export const ERROR_CODES = {
  SALE_NOT_STARTED: {
    status: 403,
    message: 'The sale has not started yet',
  },
  SALE_ENDED: { status: 403, message: 'The sale has ended' },
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
