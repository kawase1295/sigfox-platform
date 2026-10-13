import { createRootRoute, createRoute, createRouter, Link, Outlet, type RouterHistory } from "@tanstack/react-router";
import { ApiStatus } from "./components/api-status";
import { CurrentUser } from "./components/current-user";
import { LanguageToggle } from "./components/language-toggle";
import { useI18n } from "./i18n";
import { ApiTokensPage } from "./routes/api-tokens";
import { CallbackSetupPage } from "./routes/callback-setup";
import { DevicePage } from "./routes/device";
import { DevicesPage } from "./routes/devices";
import { ParserPage } from "./routes/parser";
import { ParsersPage } from "./routes/parsers";

function Shell() {
	const { t } = useI18n();
	return (
		<>
			<header className="header">
				<div className="header-start">
					<span className="label-16 strong">{t("app.title")}</span>
					<nav className="nav" aria-label={t("nav.label")}>
						<Link to="/" activeOptions={{ exact: true }}>
							{t("nav.devices")}
						</Link>
						<Link to="/parsers">{t("nav.parsers")}</Link>
						<Link to="/settings/callback">{t("nav.callback")}</Link>
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
const devicesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DevicesPage });
const deviceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/devices/$deviceId",
	component: function DeviceRoute() {
		return <DevicePage deviceId={deviceRoute.useParams().deviceId} />;
	},
});
const parsersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/parsers", component: ParsersPage });
const parserRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/parsers/$parserId",
	component: function ParserRoute() {
		return <ParserPage parserId={parserRoute.useParams().parserId} />;
	},
});
const callbackRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/callback",
	component: CallbackSetupPage,
});
const apiTokensRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/tokens",
	component: ApiTokensPage,
});

const routeTree = rootRoute.addChildren([
	devicesRoute,
	deviceRoute,
	parsersRoute,
	parserRoute,
	callbackRoute,
	apiTokensRoute,
]);

// Why a factory: tests mount the real route tree on a memory history.
export const createAppRouter = (history?: RouterHistory) => createRouter({ routeTree, history });

export const router = createAppRouter();

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
