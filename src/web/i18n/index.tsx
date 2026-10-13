import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Dictionary, en, type MessageKey } from "./en";
import { ja } from "./ja";
import { detectLocale, type Locale } from "./locale";

const dictionaries: Record<Locale, Dictionary> = { en, ja };
const STORAGE_KEY = "locale";

// Why not let storage failures throw: private mode and blocked storage must still render the UI.
function readSaved(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeSaved(locale: Locale) {
	try {
		localStorage.setItem(STORAGE_KEY, locale);
	} catch {}
}

export const initialLocale = (): Locale => detectLocale({ saved: readSaved(), browser: navigator.languages ?? [] });

type I18n = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
	const [locale, setLocaleState] = useState(initial);

	const setLocale = useCallback((next: Locale) => {
		writeSaved(next);
		setLocaleState(next);
	}, []);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	const value = useMemo<I18n>(
		() => ({ locale, setLocale, t: (key) => dictionaries[locale][key] }),
		[locale, setLocale],
	);
	return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
	return ctx;
}
