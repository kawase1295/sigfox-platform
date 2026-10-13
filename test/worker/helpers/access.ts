import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";

export const TEAM_DOMAIN = "acme.cloudflareaccess.com";
export const AUD = "test-aud-0123456789";
export const accessEnv = { ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, ACCESS_AUD: AUD };

// A throwaway signing key per test run stands in for Cloudflare's rotating Access keys.
export async function createAccessIssuer() {
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256" };
	const keys = createLocalJWKSet({ keys: [jwk] });

	const sign = (
		claims: { email?: string; aud?: string; iss?: string; exp?: number | string } = {},
		key: CryptoKey = privateKey,
	) =>
		new SignJWT(claims.email === undefined ? {} : { email: claims.email })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(claims.iss ?? `https://${TEAM_DOMAIN}`)
			.setAudience(claims.aud ?? AUD)
			.setIssuedAt()
			.setExpirationTime(claims.exp ?? "5m")
			.sign(key);

	return { keys, sign };
}
