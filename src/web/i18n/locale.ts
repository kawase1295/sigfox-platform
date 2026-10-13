export const locales = ["en", "ja"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = { en: "English", ja: "日本語" };

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

export function detectLocale({ saved, browser }: { saved: string | null; browser: readonly string[] }): Locale {
	if (isLocale(saved)) return saved;
	for (const tag of browser) {
		const base = tag.toLowerCase().split("-")[0];
		if (isLocale(base)) return base;
	}
	return defaultLocale;
}
