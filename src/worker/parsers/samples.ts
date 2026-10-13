import type { ParserSample } from "#shared/parsers";
import connectedPlant from "./samples/connected-plant.js?raw";
import hidnseek from "./samples/hidnseek.js?raw";
import sensitV2 from "./samples/sensit-v2.js?raw";
import sensitV3 from "./samples/sensit-v3.js?raw";
import simplepack from "./samples/simplepack.js?raw";
import td1205p from "./samples/td1205p-tracker.js?raw";

// Copied unchanged from the original project's docs/parsers (iot-makers/sigfox-platform) so existing users can paste their old parsers and expect the same output.
export const PARSER_SAMPLES: ParserSample[] = [
	{ id: "connected-plant", name: "Connected plant", code: connectedPlant, examplePayload: "3c50" },
	{ id: "hidnseek", name: "HidnSeek", code: hidnseek, examplePayload: "6b89434295621340e43ed042" },
	{ id: "sensit-v2", name: "Sens'it v2", code: sensitV2, examplePayload: "a96f2e4d" },
	{ id: "sensit-v3", name: "Sens'it v3", code: sensitV3, examplePayload: "b60b9e64" },
	{ id: "simplepack", name: "Simplepack", code: simplepack, examplePayload: "1102" },
	{ id: "td1205p-tracker", name: "TD1205P tracker", code: td1205p, examplePayload: "1a2b3c4d5e6f708192a3b4c5" },
];
