import { useI18n } from "../i18n";
import { localeNames, locales } from "../i18n/locale";

export function LanguageToggle() {
	const { locale, setLocale, t } = useI18n();
	return (
		<fieldset className="segmented">
			<legend className="visually-hidden">{t("locale.label")}</legend>
			{locales.map((l) => (
				<button key={l} type="button" aria-pressed={l === locale} onClick={() => setLocale(l)}>
					{localeNames[l]}
				</button>
			))}
		</fieldset>
	);
}
