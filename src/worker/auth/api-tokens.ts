import { API_TOKEN_PREFIX } from "#shared/api-tokens";

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function generateApiToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return (
		API_TOKEN_PREFIX +
		btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "")
	);
}

// Why an unsalted fast hash: tokens are 256-bit random, so lookup by digest is safe and avoids comparing secrets.
export async function hashApiToken(token: string): Promise<string> {
	return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}
