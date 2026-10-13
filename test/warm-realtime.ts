import { env } from "cloudflare:workers";
import { realtimeHub } from "../src/worker/realtime/publish";

// Why: callbacks publish from waitUntil, which can outlive a test file. If that is the hub's first use, the
// pool is still resolving the DO's modules over RPC at teardown and fails the run (EnvironmentTeardownError).
// Loading the hub up front leaves late publishes nothing to resolve.
await realtimeHub(env, "warm-up").broadcast({
	type: "device.upserted",
	device: { id: "WARMUP", name: null, createdAt: new Date(0).toISOString(), lastMessageAt: null, messageCount: 0 },
});
