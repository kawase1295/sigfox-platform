import { useQuery } from "@tanstack/react-query";
import { healthResponseSchema } from "#shared/health";
import { useI18n } from "../i18n";

async function fetchHealth() {
	const res = await fetch("/api/health");
	if (!res.ok) throw new Error(`health check failed: ${res.status}`);
	return healthResponseSchema.parse(await res.json());
}

export function ApiStatus() {
	const { t } = useI18n();
	const { status } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });
	const label = status === "pending" ? t("api.loading") : status === "success" ? t("api.ok") : t("api.error");
	return (
		<p className="api-status" data-state={status}>
			<span className="dot" aria-hidden="true" />
			{t("api.status")}: {label}
		</p>
	);
}
