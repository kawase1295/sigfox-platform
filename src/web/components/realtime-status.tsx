import { useI18n } from "../i18n";
import type { RealtimeStatus as Status } from "../realtime/connection";

const labelKey = {
	connecting: "realtime.connecting",
	open: "realtime.open",
	reconnecting: "realtime.reconnecting",
} as const;

export function RealtimeStatus({ status }: { status: Status }) {
	const { t } = useI18n();
	return (
		<span className="realtime-status" role="status" data-state={status}>
			<span className="dot" aria-hidden="true" />
			{t(labelKey[status])}
		</span>
	);
}
