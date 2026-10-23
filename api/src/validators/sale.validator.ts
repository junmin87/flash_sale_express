// [KO] 관리자 세일 설정 요청(startAt, endAt, stock)의 Joi 검증 스키마

import Joi, { CustomHelpers } from 'joi';

export interface SetSaleInput {
  startAt: string;
  endAt: string;
  stock: number;
}

// [KO] endAt이 startAt보다 늦은지 확인
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
  // [KO] strict: 문자열 '10'을 숫자로 변환하지 않고 거부
  stock: Joi.number().strict().integer().min(0).required(),
});
