import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "../api/client";
import { useI18n } from "../i18n";

export function CurrentUser() {
	const { t } = useI18n();
	const { data } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
	if (!data) return null;
	return (
		<span className="label-13 secondary" title={t("user.signedInAs")}>
			<span className="visually-hidden">{t("user.signedInAs")} </span>
			{data.email}
		</span>
	);
}
