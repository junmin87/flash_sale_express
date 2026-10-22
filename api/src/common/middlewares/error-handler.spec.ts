import type { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { errorHandler } from './error-handler.js';
import { validate } from './validate.js';

const testSchema = Joi.object({
  name: Joi.string().required(),
  quantity: Joi.number().integer().required(),
});

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function handle(err: unknown) {
  const response = createResponse();
  errorHandler(
    err,
    {} as Request,
    response as unknown as Response,
    vi.fn() as NextFunction,
  );
  return response;
}

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responds with the code and status of an AppError', () => {
    const response = handle(new AppError('SOLD_OUT'));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'SOLD_OUT', message: 'The item is sold out' },
    });
  });

  it('uses the custom message of an AppError', () => {
    const response = handle(new AppError('SALE_NOT_STARTED', 'Starts at noon'));

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'SALE_NOT_STARTED', message: 'Starts at noon' },
    });
  });

  it('maps a validate() error to VALIDATION_ERROR and joins the messages', () => {
    let error: unknown;
    try {
      validate(testSchema)(
        { body: { name: 1, quantity: 1.5 } } as Request,
        {} as Response,
        vi.fn() as NextFunction,
      );
    } catch (err) {
      error = err;
    }

    const response = handle(error);

    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message).toContain('"name" must be a string');
    expect(body.error.message).toContain('"quantity" must be an integer');
  });

  it('maps a malformed JSON body to VALIDATION_ERROR', () => {
    const error = Object.assign(new SyntaxError('Unexpected end of JSON input'), {
      type: 'entity.parse.failed',
      status: 400,
    });

    const response = handle(error);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Unexpected end of JSON input',
      },
    });
  });

  it('maps a NOT_FOUND AppError to NOT_FOUND', () => {
    const response = handle(new AppError('NOT_FOUND', 'Cannot GET /api/nope'));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Cannot GET /api/nope' },
    });
  });

  it('responds 500 INTERNAL_ERROR to an unexpected error without exposing details', () => {
    const logSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const response = handle(new Error('connection string secret=abc'));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'secret',
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('secret=abc'));
  });
});
