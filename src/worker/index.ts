import { createApp } from "./app";
import { runRetention } from "./services/retention";

const app = createApp();

export default {
	fetch: app.fetch,
	// Why scheduledTime instead of Date.now(): a delayed or retried run still purges the window it was scheduled for.
	scheduled: (controller, env) => runRetention(env, new Date(controller.scheduledTime)),
} satisfies ExportedHandler<Env>;
