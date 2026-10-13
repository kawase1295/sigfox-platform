import type { RealtimeEvent } from "#shared/realtime";
import type { RealtimeHub } from "./hub";

/** MVP has a single tenant; organizations (v1.x) will map to `org:<id>`. */
export const REALTIME_SCOPE = "global";

/** The hub of one scope. */
export const realtimeHub = (env: Pick<Env, "REALTIME">, scope = REALTIME_SCOPE) =>
	// Why a cast: a binding to the Worker's own class names it by string, so cf infers an untyped namespace.
	(env.REALTIME as DurableObjectNamespace<RealtimeHub>).getByName(scope);

/**
 * Fans an event out to connected browsers. Never rejects: realtime is best effort, and a hub
 * outage must not fail the Sigfox callback that triggered it (clients refetch on reconnect).
 */
export async function publish(env: Pick<Env, "REALTIME">, event: RealtimeEvent): Promise<void> {
	try {
		await realtimeHub(env).broadcast(event);
	} catch (error) {
		console.error("realtime publish failed", event.type, error);
	}
}
