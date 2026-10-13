// Stand-in for maplibre-gl: happy-dom has no WebGL. Records what the app asks the map to do.
type Handler = (event?: unknown) => unknown;

type FakeSource = { spec: Record<string, unknown>; data: unknown; setData: (data: unknown) => void };

class FakeMap {
	static instances: FakeMap[] = [];
	readonly sources = new Map<string, FakeSource & { getClusterExpansionZoom: () => Promise<number> }>();
	readonly layers: string[] = [];
	readonly handlers = new Map<string, Handler[]>();
	readonly fitted: unknown[] = [];
	removed = false;

	constructor(readonly options: { style: string }) {
		FakeMap.instances.push(this);
		queueMicrotask(() => this.fire("load"));
	}

	on(event: string, layerOrHandler: string | Handler, handler?: Handler) {
		const key = typeof layerOrHandler === "string" ? `${event}:${layerOrHandler}` : event;
		const fn = typeof layerOrHandler === "string" ? handler : layerOrHandler;
		if (fn) this.handlers.set(key, [...(this.handlers.get(key) ?? []), fn]);
		return this;
	}

	fire(key: string, event?: unknown) {
		for (const fn of this.handlers.get(key) ?? []) fn(event);
	}

	addControl() {
		return this;
	}

	addSource(id: string, spec: Record<string, unknown>) {
		const source = {
			spec,
			data: spec.data,
			setData: (data: unknown) => {
				source.data = data;
			},
			getClusterExpansionZoom: async () => 5,
		};
		this.sources.set(id, source);
	}

	addLayer(layer: { id: string }) {
		this.layers.push(layer.id);
	}

	getSource(id: string) {
		return this.sources.get(id);
	}

	getCanvas() {
		return { style: {} as Record<string, string> };
	}

	fitBounds(bounds: unknown) {
		this.fitted.push(bounds);
	}

	easeTo() {}

	remove() {
		this.removed = true;
	}
}

class FakePopup {
	static opened: FakePopup[] = [];
	node: HTMLElement | null = null;

	setLngLat() {
		return this;
	}

	setDOMContent(node: HTMLElement) {
		this.node = node;
		return this;
	}

	addTo() {
		FakePopup.opened.push(this);
		return this;
	}
}

class FakeNavigationControl {}

export const setWorkerUrl = (_url: string) => {};

export { FakeMap as Map, FakeNavigationControl as NavigationControl, FakePopup as Popup };
