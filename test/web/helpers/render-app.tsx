import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { I18nProvider } from "../../../src/web/i18n";
import type { Locale } from "../../../src/web/i18n/locale";
import { createAppRouter } from "../../../src/web/router";
import { FakeWebSocket } from "./fake-websocket";

/**
 * Mounts the real route tree at `path`; callers stub fetch for the API. The realtime socket is
 * always a FakeWebSocket (see FakeWebSocket.latest) so no test reaches the network.
 */
export function renderApp(path: string, locale: Locale = "en") {
	FakeWebSocket.instances = [];
	vi.stubGlobal("WebSocket", FakeWebSocket);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
	render(
		<I18nProvider initial={locale}>
			<QueryClientProvider client={client}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</I18nProvider>,
	);
	return router;
}
