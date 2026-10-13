import { describe, expect, it } from "vitest";
import { detectLocale } from "../../src/web/i18n/locale";

describe("detectLocale", () => {
	it("prefers a saved override over the browser languages", () => {
		expect(detectLocale({ saved: "ja", browser: ["en-US"] })).toBe("ja");
	});

	it("picks the first supported browser language, ignoring region", () => {
		expect(detectLocale({ saved: null, browser: ["fr-FR", "ja-JP", "en"] })).toBe("ja");
	});

	it("falls back to English when nothing is supported", () => {
		expect(detectLocale({ saved: "xx", browser: ["fr", "de"] })).toBe("en");
	});
});
