import { useI18n } from "../i18n";

// AGPL-3.0 §13: users interacting over a network must be offered the Corresponding Source.
// Why a fixed URL, not a config var: forks that change the code must point this at their own source anyway.
export const SOURCE_URL = "https://github.com/kawase1295/sigfox-platform";
export const LICENSE_NAME = "AGPL-3.0-only";

export function Footer() {
	const { t } = useI18n();
	return (
		<footer className="footer label-13 secondary">
			<a className="link" href={SOURCE_URL} target="_blank" rel="noreferrer">
				{t("footer.source")}
			</a>
			<span>
				{t("footer.license")} {LICENSE_NAME}
			</span>
		</footer>
	);
}
