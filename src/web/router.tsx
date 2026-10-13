import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { ApiStatus } from "./components/api-status";
import { CurrentUser } from "./components/current-user";
import { LanguageToggle } from "./components/language-toggle";
import { useI18n } from "./i18n";
import { ApiTokensPage } from "./routes/api-tokens";
import { Home } from "./routes/home";

function Shell() {
	const { t } = useI18n();
	return (
		<>
			<header className="header">
				<div className="header-start">
					<span className="label-16 strong">{t("app.title")}</span>
					<nav className="nav" aria-label={t("nav.label")}>
						<Link to="/" activeOptions={{ exact: true }}>
							{t("nav.home")}
						</Link>
						<Link to="/settings/tokens">{t("nav.apiTokens")}</Link>
					</nav>
				</div>
				<div className="header-end">
					<CurrentUser />
					<LanguageToggle />
				</div>
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
const apiTokensRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/tokens",
	component: ApiTokensPage,
});

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, apiTokensRoute]) });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
