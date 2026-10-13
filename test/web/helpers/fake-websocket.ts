/** Stand-in for the browser WebSocket; tests drive the server side by hand. */
export class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	static get latest(): FakeWebSocket {
		const ws = FakeWebSocket.instances.at(-1);
		if (!ws) throw new Error("no WebSocket was opened");
		return ws;
	}

	readyState = 0;
	onopen: ((e: Event) => void) | null = null;
	onmessage: ((e: MessageEvent) => void) | null = null;
	onclose: ((e: CloseEvent) => void) | null = null;
	onerror: ((e: Event) => void) | null = null;

	constructor(readonly url: string) {
		FakeWebSocket.instances.push(this);
	}

	close() {
		this.readyState = 3;
	}

	open() {
		this.readyState = 1;
		this.onopen?.(new Event("open"));
	}

	receive(frame: unknown) {
		const data = typeof frame === "string" ? frame : JSON.stringify(frame);
		this.onmessage?.(new MessageEvent("message", { data }));
	}

	drop() {
		this.readyState = 3;
		this.onclose?.(new CloseEvent("close", { code: 1006 }));
	}
}
