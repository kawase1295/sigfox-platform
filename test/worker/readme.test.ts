import { describe, expect, it } from "vitest";
import {
	ADVANCED_BODY_TEMPLATE,
	ADVANCED_CALLBACK_PATH,
	ERROR_BODY_TEMPLATE,
	ERROR_CALLBACK_PATH,
	UPLINK_BODY_TEMPLATE,
	UPLINK_CALLBACK_PATH,
} from "#shared/sigfox";
import readme from "../../README.md?raw";

// Users copy the callback settings from the README before the app is even deployed, so it must match the code.
describe("README callback setup", () => {
	it.each([
		["uplink path", UPLINK_CALLBACK_PATH],
		["uplink body", UPLINK_BODY_TEMPLATE],
		["advanced path", ADVANCED_CALLBACK_PATH],
		["advanced body", ADVANCED_BODY_TEMPLATE],
		["error path", ERROR_CALLBACK_PATH],
		["error body", ERROR_BODY_TEMPLATE],
	])("quotes the %s exactly", (_, text) => {
		expect(readme).toContain(text);
	});
});
