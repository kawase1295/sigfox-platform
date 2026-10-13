import type { Db } from "./client";
import { users } from "./schema";

export type User = { id: number; email: string };

export function upsertUser(db: Db, email: string, now = new Date()): Promise<User> {
	return db
		.insert(users)
		.values({ email, createdAt: now, lastSeenAt: now })
		.onConflictDoUpdate({ target: users.email, set: { lastSeenAt: now } })
		.returning({ id: users.id, email: users.email })
		.get() as Promise<User>;
}
