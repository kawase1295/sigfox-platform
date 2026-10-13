import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { ApiStatus } from "./components/api-status";
import { LanguageToggle } from "./components/language-toggle";
import { useI18n } from "./i18n";
import { Home } from "./routes/home";

function Shell() {
	const { t } = useI18n();
	return (
		<>
			<header className="header">
				<span className="label-16 strong">{t("app.title")}</span>
				<LanguageToggle />
			</header>
			<main className="container">
				<Outlet />
				<ApiStatus />
			</main>
		</>
	);
}

const rootRoute = createRootRoute({ component: Shell });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute]) });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
