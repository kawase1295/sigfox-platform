import { DurableObject } from "cloudflare:workers";
import type { RealtimeEvent } from "#shared/realtime";

/**
 * Fans realtime events out to the browsers of one scope. Uses the Hibernation API so idle
 * connections cost nothing; all connection state lives in the runtime, none in memory.
 */
export class RealtimeHub extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Expected a WebSocket upgrade", { status: 426 });
		}
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	/** Sends the event to every open socket and returns how many received it. */
	async broadcast(event: RealtimeEvent): Promise<number> {
		const frame = JSON.stringify(event);
		let delivered = 0;
		for (const ws of this.ctx.getWebSockets()) {
			if (ws.readyState !== WebSocket.OPEN) continue;
			try {
				ws.send(frame);
				delivered++;
			} catch {
				// Why not rethrow: one half-closed socket must not stop delivery to the others.
			}
		}
		return delivered;
	}

	// Why no-op: the channel is server-to-client only; clients have nothing to say yet.
	async webSocketMessage(): Promise<void> {}

	// Why no explicit close(): the compatibility date enables automatic close replies.
	async webSocketClose(): Promise<void> {}

	async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
		console.warn("realtime socket error", error);
	}
}
