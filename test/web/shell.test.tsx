import { act, cleanup, fireEvent, screen } from "@testing-library/react";
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
