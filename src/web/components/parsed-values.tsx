import type { Message } from "#shared/devices";
import type { ParsedValue } from "#shared/parsers";
import { useI18n } from "../i18n";

const format = (v: ParsedValue) => (typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v));

/** Compact key=value chips for the messages table; null values are omitted because legacy parsers emit every key. */
export function ParsedValues({ message }: { message: Message }) {
	const { t } = useI18n();
	if (message.parseError)
		return (
			<span className="badge" data-state="error" title={message.parseError.message}>
				{t("parsers.parseError")}
			</span>
		);
	const entries = message.parsed?.filter((e) => e.value !== null) ?? [];
	if (entries.length === 0) return <span className="secondary">—</span>;
	return (
		<ul className="chips">
			{entries.map((e) => (
				<li key={e.key} className="chip">
					<span className="secondary">{e.key}=</span>
					{format(e.value)}
					{e.unit ? ` ${e.unit}` : ""}
				</li>
			))}
		</ul>
	);
}
