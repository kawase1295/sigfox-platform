import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { applyRealtimeEvent, deviceKeys, locationKeys } from "./apply";
import { connectRealtime, type RealtimeStatus } from "./connection";

const realtimeUrl = () => `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/realtime`;

/** Streams server events into the query cache for as long as the caller is mounted. Mount once. */
export function useRealtime(): RealtimeStatus {
	const client = useQueryClient();
	const [status, setStatus] = useState<RealtimeStatus>("connecting");

	useEffect(
		() =>
			connectRealtime({
				url: realtimeUrl(),
				onEvent: (event) => applyRealtimeEvent(client, event),
				onStatus: setStatus,
				onReconnect: () => {
					client.invalidateQueries({ queryKey: deviceKeys.all });
					client.invalidateQueries({ queryKey: locationKeys.latest });
				},
			}),
		[client],
	);

	return status;
}
