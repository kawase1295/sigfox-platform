import { z } from "zod";

export const PARSER_OUTPUT_MAX_ENTRIES = 100;
export const PARSER_CODE_MAX_LENGTH = 64 * 1024;

export const parsedValueSchema = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

/** One decoded value, as stored on a message and returned by the API. */
export const parsedEntrySchema = z.strictObject({
	key: z.string().min(1).max(100),
	value: parsedValueSchema,
	// Legacy parsers use "number" | "string" | "boolean" but nothing enforced it, so any short label passes.
	type: z.string().max(32),
	unit: z.string().max(32).optional(),
});

/**
 * What user code may return. Lenient where legacy parsers rely on it: a missing (undefined) value becomes null,
 * so the bundled samples that emit every key regardless of mode keep working.
 */
export const parserOutputSchema = z
	.array(
		z.object({
			key: parsedEntrySchema.shape.key,
			value: parsedValueSchema.optional().transform((v) => v ?? null),
			type: parsedEntrySchema.shape.type,
			unit: parsedEntrySchema.shape.unit,
		}),
	)
	.max(PARSER_OUTPUT_MAX_ENTRIES);

export const parseErrorKindSchema = z.enum(["syntax", "runtime", "timeout", "memory", "invalid_output"]);

export const parseErrorSchema = z.strictObject({
	kind: parseErrorKindSchema,
	message: z.string(),
});

export const parseResultSchema = z.discriminatedUnion("ok", [
	z.strictObject({ ok: z.literal(true), parsed: z.array(parsedEntrySchema) }),
	z.strictObject({ ok: z.literal(false), error: parseErrorSchema }),
]);

export const parserSchema = z.strictObject({
	id: z.string(),
	name: z.string(),
	code: z.string(),
	deviceCount: z.number().int().nonnegative(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});

export const parserListSchema = z.strictObject({ parsers: z.array(parserSchema) });

const parserName = z.string().trim().min(1).max(100);
const parserCode = z.string().max(PARSER_CODE_MAX_LENGTH);

export const createParserRequestSchema = z.strictObject({ name: parserName, code: parserCode });

export const updateParserRequestSchema = z
	.strictObject({ name: parserName.optional(), code: parserCode.optional() })
	.refine((r) => r.name !== undefined || r.code !== undefined, "Nothing to update");

export const testParserRequestSchema = z.strictObject({
	code: parserCode,
	payload: z
		.string()
		.trim()
		.regex(/^([0-9a-fA-F]{2}){0,12}$/, "Expected 0-12 bytes of hex")
		.transform((s) => s.toLowerCase()),
	lastParsedPayload: z.array(parsedEntrySchema).optional(),
});

export const parserSampleSchema = z.strictObject({
	id: z.string(),
	name: z.string(),
	code: z.string(),
	/** A payload the sample decodes meaningfully, prefilled in the editor's test run. */
	examplePayload: z.string(),
});

export const parserSampleListSchema = z.strictObject({ samples: z.array(parserSampleSchema) });

export type ParsedValue = z.infer<typeof parsedValueSchema>;
export type ParsedEntry = z.infer<typeof parsedEntrySchema>;
export type ParseErrorKind = z.infer<typeof parseErrorKindSchema>;
export type ParseError = z.infer<typeof parseErrorSchema>;
export type ParseResult = z.infer<typeof parseResultSchema>;
export type Parser = z.infer<typeof parserSchema>;
export type ParserList = z.infer<typeof parserListSchema>;
export type CreateParserRequest = z.input<typeof createParserRequestSchema>;
export type UpdateParserRequest = z.input<typeof updateParserRequestSchema>;
export type TestParserRequest = z.input<typeof testParserRequestSchema>;
export type ParserSample = z.infer<typeof parserSampleSchema>;
export type ParserSampleList = z.infer<typeof parserSampleListSchema>;
