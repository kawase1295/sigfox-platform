import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { z } from "zod";
import {
	createParserRequestSchema,
	type ParseResult,
	type ParserList,
	type ParserSampleList,
	testParserRequestSchema,
	updateParserRequestSchema,
} from "#shared/parsers";
import type { AppEnv } from "../auth/middleware";
import { createDb } from "../db/client";
import { deleteParser, getParser, insertParser, listParsers, updateParser } from "../db/parsers";
import { PARSER_SAMPLES } from "../parsers/samples";
import { runParser } from "../parsers/sandbox";

const notFound = { error: "not_found" } as const;

const body = <T extends z.ZodType>(schema: T) =>
	zValidator("json", schema, (result, c) => {
		if (!result.success) return c.json({ error: "invalid_request" }, 400);
	});

export const parserRoutes = new Hono<AppEnv>()
	.get("/", async (c) => c.json({ parsers: await listParsers(createDb(c.env.DB)) } satisfies ParserList))
	.post("/", body(createParserRequestSchema), async (c) =>
		c.json(await insertParser(createDb(c.env.DB), c.req.valid("json")), 201),
	)
	// Static paths come before /:id so "samples" and "test" are never read as parser ids.
	.get("/samples", (c) => c.json({ samples: PARSER_SAMPLES } satisfies ParserSampleList))
	.post("/test", body(testParserRequestSchema), async (c) =>
		c.json((await runParser(c.req.valid("json"))) satisfies ParseResult),
	)
	.get("/:id", async (c) => {
		const parser = await getParser(createDb(c.env.DB), c.req.param("id"));
		return parser ? c.json(parser) : c.json(notFound, 404);
	})
	.patch("/:id", body(updateParserRequestSchema), async (c) => {
		const parser = await updateParser(createDb(c.env.DB), c.req.param("id"), c.req.valid("json"));
		return parser ? c.json(parser) : c.json(notFound, 404);
	})
	.delete("/:id", async (c) =>
		(await deleteParser(createDb(c.env.DB), c.req.param("id"))) ? c.body(null, 204) : c.json(notFound, 404),
	);
