import { createRemoteJWKSet, errors, type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";

export const DEV_USER_EMAIL = "dev@example.com";

/** Resolves the key set for an Access certs URL; injectable so tests never reach the network. */
export type AccessKeySource = (certsUrl: URL) => JWTVerifyGetKey;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

// Cached per isolate so jose's built-in JWKS caching and cooldown survive across requests.
export const remoteAccessKeys: AccessKeySource = (certsUrl) => {
	let keys = remoteKeySets.get(certsUrl.href);
	if (!keys) {
		keys = createRemoteJWKSet(certsUrl);
		remoteKeySets.set(certsUrl.href, keys);
	}
	return keys;
};

const optionalVar = z
	.string()
	.optional()
	.transform((v) => v?.trim() || undefined);

const authEnvSchema = z.object({
	ACCESS_TEAM_DOMAIN: optionalVar,
	ACCESS_AUD: optionalVar,
	AUTH_DEV_BYPASS: optionalVar,
});

export type AuthMode =
	| { kind: "access"; teamOrigin: string; aud: string }
	| { kind: "dev" }
	| { kind: "misconfigured" };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The dev bypass needs three independent signals: the explicit flag, no Access config at all, and a loopback host.
 * Why not the flag alone: a flag copied into a deployed Worker would silently open the whole API.
 * Why not a hostname check alone: Access config is what production must have, so its presence always wins.
 * Anything in between fails closed instead of guessing.
 */
export function resolveAuthMode(env: unknown, url: string): AuthMode {
	const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud, AUTH_DEV_BYPASS: bypass } = authEnvSchema.parse(env);
	if (team && aud)
		return { kind: "access", teamOrigin: `https://${team.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`, aud };
	if (!team && !aud && bypass === "1" && LOOPBACK_HOSTS.has(new URL(url).hostname)) return { kind: "dev" };
	return { kind: "misconfigured" };
}

/** Returns the verified email, or null when the assertion is not a valid user token for this application. */
export async function verifyAccessJwt(
	token: string,
	{ teamOrigin, aud }: { teamOrigin: string; aud: string },
	keySource: AccessKeySource,
): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, keySource(new URL("/cdn-cgi/access/certs", teamOrigin)), {
			issuer: teamOrigin,
			audience: aud,
			algorithms: ["RS256"],
		});
		// Service-token assertions carry no email; they must not become users.
		return typeof payload.email === "string" && payload.email ? payload.email.toLowerCase() : null;
	} catch (e) {
		if (e instanceof errors.JOSEError) return null;
		throw e;
	}
}
