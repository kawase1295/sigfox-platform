import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiToken } from "#shared/api-tokens";
import { I18nProvider } from "../../src/web/i18n";
import { ApiTokensPage } from "../../src/web/routes/api-tokens";

const token = (over: Partial<ApiToken>): ApiToken => ({
	id: crypto.randomUUID(),
	name: "token",
	createdAt: "2026-10-01T00:00:00.000Z",
	lastUsedAt: null,
	revokedAt: null,
	createdBy: "alice@example.com",
	...over,
});

let tokens: ApiToken[];
let fetchMock: ReturnType<typeof vi.fn>;
const SECRET = "sfp_secret-shown-once";

beforeEach(() => {
	tokens = [token({ name: "backend" }), token({ name: "old", revokedAt: "2026-10-02T00:00:00.000Z" })];
	fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		if (url === "/api/tokens" && method === "GET") return Response.json({ tokens });
		if (url === "/api/tokens" && method === "POST") {
			const created = token({ name: JSON.parse(String(init?.body)).name });
			tokens = [created, ...tokens];
			return Response.json({ token: created, secret: SECRET }, { status: 201 });
		}
		if (url.startsWith("/api/tokens/") && method === "DELETE") {
			tokens = tokens.map((t) => (url.endsWith(t.id) ? { ...t, revokedAt: "2026-10-03T00:00:00.000Z" } : t));
			return new Response(null, { status: 204 });
		}
		return new Response(null, { status: 404 });
	});
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<I18nProvider initial="en">
			<QueryClientProvider client={client}>
				<ApiTokensPage />
			</QueryClientProvider>
		</I18nProvider>,
	);
}

describe("API tokens page", () => {
	it("lists tokens with their status and offers revoke only for active ones", async () => {
		renderPage();

		const active = (await screen.findByText("backend")).closest("tr") as HTMLElement;
		const revoked = screen.getByText("old").closest("tr") as HTMLElement;
		expect(within(active).getByText("Active")).toBeTruthy();
		expect(within(active).queryByRole("button", { name: "Revoke" })).toBeTruthy();
		expect(within(revoked).getByText("Revoked")).toBeTruthy();
		expect(within(revoked).queryByRole("button", { name: "Revoke" })).toBeNull();
	});

	it("creates a token and shows the secret once", async () => {
		renderPage();
		await screen.findByText("backend");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "sigfox" } });
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create token" })));

		const dialog = await screen.findByRole("dialog", { name: "Copy your API token" });
		expect(within(dialog).getByText(SECRET)).toBeTruthy();
		expect(JSON.parse(String(fetchMock.mock.calls.find(([, i]) => i?.method === "POST")?.[1]?.body))).toEqual({
			name: "sigfox",
		});

		await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Done" })));
		await waitFor(() => expect(screen.queryByText(SECRET)).toBeNull());
		expect(await screen.findByText("sigfox")).toBeTruthy();
	});

	it("revokes a token only after confirmation", async () => {
		renderPage();
		const row = (await screen.findByText("backend")).closest("tr") as HTMLElement;

		await act(async () => fireEvent.click(within(row).getByRole("button", { name: "Revoke" })));
		const dialog = await screen.findByRole("dialog", { name: "Revoke API token" });
		expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);

		await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Revoke token" })));

		await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(true));
		await waitFor(() =>
			expect(within(screen.getByText("backend").closest("tr") as HTMLElement).getByText("Revoked")).toBeTruthy(),
		);
	});
});
