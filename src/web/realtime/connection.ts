import { type RealtimeEvent, realtimeEventSchema } from "#shared/realtime";

export type RealtimeStatus = "connecting" | "open" | "reconnecting";

export type RealtimeOptions = {
	url: string;
	onEvent: (event: RealtimeEvent) => void;
	onStatus: (status: RealtimeStatus) => void;
	/** Called when a connection opens after a drop; events sent meanwhile were missed. */
	onReconnect: () => void;
	createSocket?: (url: string) => WebSocket;
	minDelayMs?: number;
	maxDelayMs?: number;
};

/** Keeps one socket open, reconnecting with exponential backoff. Returns a function that stops it. */
export function connectRealtime({
	url,
	onEvent,
	onStatus,
	onReconnect,
	createSocket = (u) => new WebSocket(u),
	minDelayMs = 1000,
	maxDelayMs = 30_000,
}: RealtimeOptions): () => void {
	let failures = 0;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let socket: WebSocket;

	const connect = () => {
		socket = createSocket(url);
		socket.onopen = () => {
			const reconnected = failures > 0;
			failures = 0;
			onStatus("open");
			if (reconnected) onReconnect();
		};
		socket.onmessage = (e) => {
			const event = parseFrame(e.data);
			if (event) onEvent(event);
		};
		socket.onclose = () => {
			if (stopped) return;
			onStatus("reconnecting");
			timer = setTimeout(connect, Math.min(maxDelayMs, minDelayMs * 2 ** failures));
			failures++;
		};
	};

	onStatus("connecting");
	connect();
	return () => {
		stopped = true;
		clearTimeout(timer);
		socket.close();
	};
}

// Why drop instead of throw: a newer server may send event types this bundle does not know yet.
function parseFrame(data: unknown): RealtimeEvent | null {
	if (typeof data !== "string") return null;
	try {
		const parsed = realtimeEventSchema.safeParse(JSON.parse(data));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
