import { useState } from "react";
import { useI18n } from "../i18n";

export function CopyButton({ text, label }: { text: string; label: string }) {
	const { t } = useI18n();
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
		} catch {}
	};
	return (
		<button type="button" className="button secondary small" onClick={copy}>
			{copied ? t("copy.copied") : label}
		</button>
	);
}
