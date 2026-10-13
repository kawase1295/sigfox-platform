export const en = {
	"app.title": "Sigfox Platform",
	"home.heading": "Hello",
	"home.body": "The new Sigfox Platform is being set up. Devices and messages will appear here.",
	"api.status": "API status",
	"api.ok": "Healthy",
	"api.error": "Unreachable",
	"api.loading": "Checking…",
	"locale.label": "Language",
} as const;

export type MessageKey = keyof typeof en;
export type Dictionary = Record<MessageKey, string>;
