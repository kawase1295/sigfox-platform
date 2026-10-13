import { expect } from "vitest";

export type TestSocket = { ws: WebSocket; next: () => Promise<unknown>; close: () => void };

/** Accepts the client end of an upgrade response and queues every JSON frame it receives. */
export function acceptSocket(res: Response): TestSocket {
	expect(res.status).toBe(101);
	const ws = res.webSocket;
	if (!ws) throw new Error("upgrade response has no webSocket");
	ws.accept();

	const frames: unknown[] = [];
	const waiters: ((frame: unknown) => void)[] = [];
	ws.addEventListener("message", (e) => {
		const frame = JSON.parse(String(e.data));
		const waiter = waiters.shift();
		if (waiter) waiter(frame);
		else frames.push(frame);
	});

	return {
		ws,
		next: () => (frames.length ? Promise.resolve(frames.shift()) : new Promise((resolve) => waiters.push(resolve))),
		close: () => ws.close(1000, "test done"),
	};
}

export const upgradeHeaders = { Upgrade: "websocket" };
