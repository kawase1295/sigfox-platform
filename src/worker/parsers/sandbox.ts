import releaseSync from "@jitl/quickjs-ng-wasmfile-release-sync";
import {
	newQuickJSWASMModuleFromVariant,
	newVariant,
	type QuickJSContext,
	type QuickJSHandle,
	type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import wasmModule from "#quickjs.wasm";
import { type ParsedEntry, type ParseErrorKind, type ParseResult, parserOutputSchema } from "#shared/parsers";

export type SandboxLimits = {
	/** Heap limit for one execution. */
	memoryBytes: number;
	/**
	 * QuickJS calls the interrupt handler roughly every 10k bytecode operations; this caps how many times.
	 * Why a count and not only a clock: deployed Workers freeze Date.now() during synchronous work,
	 * so a wall-clock deadline alone would never fire there.
	 */
	interruptBudget: number;
	/** Wall-clock backstop, effective where the clock does advance (local dev, tests). */
	deadlineMs: number;
};

// ~100 interrupts is ~1M operations, about 45 ms on a laptop; real parsers need well under 1% of that.
export const DEFAULT_LIMITS: SandboxLimits = { memoryBytes: 8 * 1024 * 1024, interruptBudget: 100, deadlineMs: 50 };

export type RunParserInput = {
	code: string;
	/** Lowercase hex payload of the message. */
	payload: string;
	/** Parsed output of the device's previous message; legacy parsers received [] when there was none. */
	lastParsedPayload?: ParsedEntry[];
	limits?: Partial<SandboxLimits>;
};

// Why console: legacy samples log on bad frames; a no-op inside the sandbox keeps them from throwing.
// Why Function(): it compiles the body on its own, so a syntax error is told apart from runtime errors
// and user code cannot close the wrapper early.
const COMPILE = `
var console = { log: function () {}, info: function () {}, warn: function () {}, error: function () {} };
var __fn = Function("payload", "lastParsedPayload", __code);
delete globalThis.__code;`;
const RUN = `
(function (fn, payload, last) {
	delete globalThis.__fn; delete globalThis.__payload; delete globalThis.__last;
	return JSON.stringify(fn.call(undefined, payload, JSON.parse(last)));
})(__fn, __payload, __last)`;

let quickjs: Promise<QuickJSWASMModule> | null = null;
// Why one module per isolate: instantiating the wasm costs far more than a parse; isolation comes from a fresh runtime.
const loadQuickJS = () => {
	quickjs ??= newQuickJSWASMModuleFromVariant(newVariant(releaseSync, { wasmModule }));
	return quickjs;
};

/** Runs user parser code in a fresh QuickJS runtime. Never throws for anything the user code does. */
export async function runParser({
	code,
	payload,
	lastParsedPayload = [],
	limits,
}: RunParserInput): Promise<ParseResult> {
	const { memoryBytes, interruptBudget, deadlineMs } = { ...DEFAULT_LIMITS, ...limits };
	const runtime = (await loadQuickJS()).newRuntime();
	try {
		runtime.setMemoryLimit(memoryBytes);
		runtime.setMaxStackSize(256 * 1024);
		let interrupts = 0;
		const deadline = Date.now() + deadlineMs;
		runtime.setInterruptHandler(() => ++interrupts > interruptBudget || Date.now() > deadline);

		const vm = runtime.newContext();
		try {
			setString(vm, "__code", code);
			setString(vm, "__payload", payload);
			setString(vm, "__last", JSON.stringify(lastParsedPayload));

			const compiled = evaluate(vm, COMPILE, "compile");
			if (!compiled.ok) return { ok: false, error: compiled.error };
			const ran = evaluate(vm, RUN, "run");
			if (!ran.ok) return { ok: false, error: ran.error };
			return validate(ran.value);
		} finally {
			vm.dispose();
		}
	} catch (e) {
		// The wasm instance may be corrupt after an abort; start from a fresh one next time.
		quickjs = null;
		return failure("runtime", { message: e instanceof Error ? e.message : String(e) });
	} finally {
		disposeQuietly(runtime);
	}
}

type Evaluated = { ok: true; value: unknown } | { ok: false; error: { kind: ParseErrorKind; message: string } };

function evaluate(vm: QuickJSContext, source: string, phase: "compile" | "run"): Evaluated {
	const result = vm.evalCode(source, "parser.js");
	if (result.error) return { ok: false, error: classify(dumpAndDispose(vm, result.error), phase) };
	return { ok: true, value: dumpAndDispose(vm, result.value) };
}

function classify(raw: unknown, phase: "compile" | "run"): { kind: ParseErrorKind; message: string } {
	const err = (typeof raw === "object" && raw !== null ? raw : { message: String(raw) }) as {
		name?: string;
		message?: string;
	};
	const message = [err.name, err.message].filter(Boolean).join(": ") || "Unknown error";
	if (err.name === "InternalError" && err.message === "interrupted") return { kind: "timeout", message };
	if (err.name === "InternalError" && err.message === "out of memory") return { kind: "memory", message };
	if (raw === null) return { kind: "memory", message: "out of memory" };
	// Why the phase: a SyntaxError while running comes from user calls such as JSON.parse, not from the code.
	if (err.name === "SyntaxError" && phase === "compile") return { kind: "syntax", message };
	return { kind: "runtime", message };
}

function validate(json: unknown): ParseResult {
	if (typeof json !== "string") return failure("invalid_output", { message: "The parser must return an array" });
	const parsed = parserOutputSchema.safeParse(JSON.parse(json));
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
		return failure("invalid_output", { message: `${issue?.message ?? "Invalid output"}${where}` });
	}
	return {
		ok: true,
		parsed: parsed.data.map(({ unit, ...e }) => (unit === undefined ? e : { ...e, unit })),
	};
}

const failure = (kind: ParseErrorKind, { message }: { message: string }): ParseResult => ({
	ok: false,
	error: { kind, message },
});

function setString(vm: QuickJSContext, name: string, value: string) {
	const handle = vm.newString(value);
	vm.setProp(vm.global, name, handle);
	handle.dispose();
}

function dumpAndDispose(vm: QuickJSContext, handle: QuickJSHandle): unknown {
	try {
		return vm.dump(handle);
	} finally {
		handle.dispose();
	}
}

function disposeQuietly(runtime: { dispose(): void }) {
	try {
		runtime.dispose();
	} catch {
		quickjs = null;
	}
}
