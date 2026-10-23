// Joi schema for the purchase userId. The body and the URL parameter use the
// same rule

import Joi from 'joi';

export interface UserIdInput {
  userId: string;
}

// 1 to 64 characters after trimming (empty or whitespace-only values are
// rejected)
export const userIdSchema = Joi.object<UserIdInput>({
  userId: Joi.string().trim().min(1).max(64).required(),
});
