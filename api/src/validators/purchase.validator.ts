// [KO] 구매 요청 userId의 Joi 검증 스키마. body와 URL 파라미터에 같은 규칙을 쓴다

import Joi from 'joi';

export interface UserIdInput {
  userId: string;
}

// [KO] 앞뒤 공백을 제거한 뒤 1~64자 (빈 문자열·공백만 있는 값은 거부)
export const userIdSchema = Joi.object<UserIdInput>({
  userId: Joi.string().trim().min(1).max(64).required(),
});
