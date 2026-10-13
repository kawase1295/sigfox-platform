// Workers compile wasm only at deploy time, so the binary is imported as a module instead of fetched.
declare module "#quickjs.wasm" {
	const module: WebAssembly.Module;
	export default module;
}

// Vite inlines `?raw` imports as strings; the worker tsconfig does not load vite/client for the rest of it.
declare module "*?raw" {
	const source: string;
	export default source;
}
