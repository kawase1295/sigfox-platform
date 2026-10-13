import type { z } from "zod";
import { apiTokenListSchema, type CreateApiTokenRequest, createApiTokenResponseSchema } from "#shared/api-tokens";
import { meResponseSchema } from "#shared/auth";
import { configResponseSchema } from "#shared/config";
import { deviceListSchema, deviceSchema, messagePageSchema, type UpdateDeviceRequest } from "#shared/devices";
import { locationListSchema } from "#shared/locations";
import {
	type CreateParserRequest,
	parseResultSchema,
	parserListSchema,
	parserSampleListSchema,
	parserSchema,
	type TestParserRequest,
	type UpdateParserRequest,
} from "#shared/parsers";

async function request<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
	const res = await fetch(path, init);
	if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
	return schema.parse(await res.json());
}

export const fetchMe = () => request(meResponseSchema, "/api/me");

export const listApiTokens = () => request(apiTokenListSchema, "/api/tokens").then((r) => r.tokens);

export const createApiToken = (body: CreateApiTokenRequest) =>
	request(createApiTokenResponseSchema, "/api/tokens", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

export async function revokeApiToken(id: string): Promise<void> {
	const res = await fetch(`/api/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (!res.ok) throw new Error(`DELETE /api/tokens/${id} failed: ${res.status}`);
}

const devicePath = (id: string) => `/api/devices/${encodeURIComponent(id)}`;

export const listDevices = () => request(deviceListSchema, "/api/devices").then((r) => r.devices);

export const getDevice = (id: string) => request(deviceSchema, devicePath(id));

export const updateDevice = (id: string, body: UpdateDeviceRequest) =>
	request(deviceSchema, devicePath(id), {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

export function listMessages(id: string, cursor: string | null) {
	const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
	return request(messagePageSchema, `${devicePath(id)}/messages${query}`);
}

export const fetchConfig = () => request(configResponseSchema, "/api/config");

export const listLatestLocations = () => request(locationListSchema, "/api/locations/latest").then((r) => r.locations);

/** The newest positions (server default limit), oldest first. */
export const listTrack = (id: string) =>
	request(locationListSchema, `${devicePath(id)}/locations`).then((r) => r.locations);

const jsonInit = (method: string, body: unknown): RequestInit => ({
	method,
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

const parserPath = (id: string) => `/api/parsers/${encodeURIComponent(id)}`;

export const listParsers = () => request(parserListSchema, "/api/parsers").then((r) => r.parsers);

export const listParserSamples = () => request(parserSampleListSchema, "/api/parsers/samples").then((r) => r.samples);

export const getParser = (id: string) => request(parserSchema, parserPath(id));

export const createParser = (body: CreateParserRequest) =>
	request(parserSchema, "/api/parsers", jsonInit("POST", body));

export const updateParser = (id: string, body: UpdateParserRequest) =>
	request(parserSchema, parserPath(id), jsonInit("PATCH", body));

export async function deleteParser(id: string): Promise<void> {
	const res = await fetch(parserPath(id), { method: "DELETE" });
	if (!res.ok) throw new Error(`DELETE ${parserPath(id)} failed: ${res.status}`);
}

export const testParser = (body: TestParserRequest) =>
	request(parseResultSchema, "/api/parsers/test", jsonInit("POST", body));
