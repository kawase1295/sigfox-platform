import { useI18n } from "../i18n";

export function Home() {
	const { t } = useI18n();
	return (
		<section className="stack">
			<h1 className="heading-32">{t("home.heading")}</h1>
			<p className="copy-14 secondary">{t("home.body")}</p>
		</section>
	);
}
