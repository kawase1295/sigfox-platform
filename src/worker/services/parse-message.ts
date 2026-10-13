import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { ParseError } from "#shared/parsers";
import type { Db } from "../db/client";
import type { DeviceRow, MessageRow } from "../db/devices";
import { messages, parsers } from "../db/schema";
import { runParser } from "../parsers/sandbox";

// Stored before the parser runs. Native builtins (Array.fill, String.repeat...) cannot be interrupted, so a hostile
// parser can still hit the Worker CPU limit; the marker makes that visible and stops redeliveries from rerunning it.
const UNFINISHED: ParseError = {
	kind: "timeout",
	message: "The parser did not finish within the Worker's CPU limit",
};

/**
 * Runs the device's parser on a freshly ingested message and stores the outcome on it. Parser failures end up in
 * `parseError`; the message itself is never lost. Returns the message as stored afterwards (unchanged when the
 * device has no parser or the message was already parsed, e.g. a redelivered frame).
 */
export async function parseMessage(
	db: Db,
	device: DeviceRow,
	message: MessageRow,
	now = new Date(),
): Promise<MessageRow> {
	if (!device.parserId || message.parsedAt !== null) return message;
	const parser = await db.select({ code: parsers.code }).from(parsers).where(eq(parsers.id, device.parserId)).get();
	if (!parser) return message;

	// Why a conditional claim: two stations reporting the same frame at once must not both run the parser.
	const claimed = await db
		.update(messages)
		.set({ parsed: null, parseError: UNFINISHED, parsedAt: now })
		.where(and(eq(messages.id, message.id), isNull(messages.parsedAt)))
		.returning({ id: messages.id })
		.get();
	if (!claimed) return message;

	const result = await runParser({
		code: parser.code,
		payload: message.data,
		lastParsedPayload: (await previousParsed(db, message)) ?? [],
	});
	return db
		.update(messages)
		.set(result.ok ? { parsed: result.parsed, parseError: null } : { parsed: null, parseError: result.error })
		.where(eq(messages.id, message.id))
		.returning()
		.get() as Promise<MessageRow>;
}

/** Parsed output of the device's previous frame by Sigfox time, which is what stateful legacy parsers expect. */
async function previousParsed(db: Db, message: MessageRow) {
	const row = await db
		.select({ parsed: messages.parsed })
		.from(messages)
		.where(
			and(
				eq(messages.deviceId, message.deviceId),
				or(lt(messages.time, message.time), and(eq(messages.time, message.time), lt(messages.id, message.id))),
			),
		)
		.orderBy(desc(messages.time), desc(messages.id))
		.limit(1)
		.get();
	return row?.parsed ?? null;
}
