import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./helpers/render-app";

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ devices: [] })),
	);
});

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.unstubAllGlobals();
});

describe("Shell with the language toggle", () => {
	it("renders English by default and switches to Japanese on toggle", async () => {
		renderApp("/");
		expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Devices");

		await act(async () => fireEvent.click(screen.getByRole("button", { name: "日本語" })));

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("デバイス");
		expect(localStorage.getItem("locale")).toBe("ja");
	});
});

describe("Shell footer", () => {
	it("links to the corresponding source and names the license in both languages", async () => {
		renderApp("/");
		const footer = await screen.findByRole("contentinfo");
		const source = within(footer).getByRole("link", { name: "Source code" });
		expect(source.getAttribute("href")).toBe("https://github.com/kawase1295/sigfox-platform");
		expect(footer.textContent).toContain("AGPL-3.0");

		await act(async () => fireEvent.click(screen.getByRole("button", { name: "日本語" })));

		expect(within(footer).getByRole("link", { name: "ソースコード" }).getAttribute("href")).toBe(
			"https://github.com/kawase1295/sigfox-platform",
		);
		expect(footer.textContent).toContain("AGPL-3.0");
	});
});
