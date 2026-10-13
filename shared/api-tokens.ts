import { z } from "zod";

// Why a prefix: makes leaked tokens recognizable to secret scanners and humans.
export const API_TOKEN_PREFIX = "sfp_";

export const apiTokenSchema = z.strictObject({
	id: z.uuid(),
	name: z.string(),
	createdAt: z.iso.datetime(),
	lastUsedAt: z.iso.datetime().nullable(),
	revokedAt: z.iso.datetime().nullable(),
	createdBy: z.email().nullable(),
});

export const apiTokenListSchema = z.strictObject({ tokens: z.array(apiTokenSchema) });

export const createApiTokenRequestSchema = z.strictObject({ name: z.string().trim().min(1).max(100) });

// `secret` is the only time the plaintext leaves the server.
export const createApiTokenResponseSchema = z.strictObject({
	token: apiTokenSchema,
	secret: z.string().startsWith(API_TOKEN_PREFIX),
});

export type ApiToken = z.infer<typeof apiTokenSchema>;
export type ApiTokenList = z.infer<typeof apiTokenListSchema>;
export type CreateApiTokenRequest = z.infer<typeof createApiTokenRequestSchema>;
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
