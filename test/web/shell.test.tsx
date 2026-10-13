import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageToggle } from "../../src/web/components/language-toggle";
import { I18nProvider } from "../../src/web/i18n";
import { Home } from "../../src/web/routes/home";

afterEach(() => localStorage.clear());

describe("Home with the language toggle", () => {
	it("greets in English by default and switches to Japanese on toggle", async () => {
		render(
			<I18nProvider initial="en">
				<LanguageToggle />
				<Home />
			</I18nProvider>,
		);
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello");

		await act(async () => fireEvent.click(screen.getByRole("button", { name: "日本語" })));

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("こんにちは");
		expect(localStorage.getItem("locale")).toBe("ja");
	});
});
