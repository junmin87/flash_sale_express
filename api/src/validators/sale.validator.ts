// [KO] 관리자 세일 설정 요청(startAt, endAt, stock)의 Joi 검증 스키마

import Joi, { CustomHelpers } from 'joi';

export interface SetSaleInput {
  startAt: string;
  endAt: string;
  stock: number;
}

// Date.parse rolls a day that does not exist (2026-02-30) over into the next
// month, so the calendar date is checked on the original string
// [KO] 존재하지 않는 날짜(예: 2월 30일) 거부
function existingDate(value: string, helpers: CustomHelpers) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(helpers.original as string);
  if (!match) return value;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : helpers.error('string.isoDate');
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
  startAt: Joi.string().isoDate().custom(existingDate).required(),
  endAt: Joi.string()
    .isoDate()
    .custom(existingDate)
    .custom(startBeforeEnd)
    .required(),
  // [KO] strict: 문자열 '10'을 숫자로 변환하지 않고 거부
  stock: Joi.number().strict().integer().min(0).required(),
});
