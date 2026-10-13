import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { ApiToken } from "#shared/api-tokens";
import type { Db } from "./client";
import { apiTokens, users } from "./schema";

const columns = {
	id: apiTokens.id,
	name: apiTokens.name,
	createdAt: apiTokens.createdAt,
	lastUsedAt: apiTokens.lastUsedAt,
	revokedAt: apiTokens.revokedAt,
	createdBy: users.email,
};

type Row = {
	id: string;
	name: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
	createdBy: string | null;
};

const toApiToken = (r: Row): ApiToken => ({
	id: r.id,
	name: r.name,
	createdAt: r.createdAt.toISOString(),
	lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
	revokedAt: r.revokedAt?.toISOString() ?? null,
	createdBy: r.createdBy,
});

export async function listApiTokens(db: Db): Promise<ApiToken[]> {
	const rows = await db
		.select(columns)
		.from(apiTokens)
		.leftJoin(users, eq(apiTokens.createdBy, users.id))
		.orderBy(desc(apiTokens.createdAt));
	return rows.map(toApiToken);
}

export async function insertApiToken(
	db: Db,
	input: { name: string; tokenHash: string; createdBy: { id: number; email: string } },
): Promise<ApiToken> {
	const row = await db
		.insert(apiTokens)
		.values({
			id: crypto.randomUUID(),
			name: input.name,
			tokenHash: input.tokenHash,
			createdAt: new Date(),
			createdBy: input.createdBy.id,
		})
		.returning()
		.get();
	return toApiToken({ ...row, createdBy: input.createdBy.email });
}

/** Keeps the first revocation time; returns false when the token does not exist. */
export async function revokeApiToken(db: Db, id: string): Promise<boolean> {
	const row = await db
		.update(apiTokens)
		.set({ revokedAt: sql`coalesce(${apiTokens.revokedAt}, ${Date.now()})` })
		.where(eq(apiTokens.id, id))
		.returning({ id: apiTokens.id })
		.get();
	return row !== undefined;
}

/** Looks the token up by digest and stamps its use in one statement; revoked tokens never match. */
export async function touchActiveApiToken(db: Db, tokenHash: string): Promise<boolean> {
	const row = await db
		.update(apiTokens)
		.set({ lastUsedAt: new Date() })
		.where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
		.returning({ id: apiTokens.id })
		.get();
	return row !== undefined;
}
