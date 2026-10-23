// Joi schema for the admin sale settings request (startAt, endAt, stock)

import Joi, { CustomHelpers } from 'joi';

export interface SetSaleInput {
  startAt: string;
  endAt: string;
  stock: number;
}

function startBeforeEnd(endAt: string, helpers: CustomHelpers) {
  const { startAt } = helpers.state.ancestors[0] as { startAt?: unknown };
  if (typeof startAt === 'string' && Date.parse(startAt) < Date.parse(endAt)) {
    return endAt;
  }
  return helpers.message({ custom: '{{#label}} must be later than "startAt"' });
}

export const setSaleSchema = Joi.object<SetSaleInput>({
  startAt: Joi.string().isoDate().required(),
  endAt: Joi.string().isoDate().custom(startBeforeEnd).required(),
  // strict: reject the string '10' instead of converting it to a number
  stock: Joi.number().strict().integer().min(0).required(),
});
