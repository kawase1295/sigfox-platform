import { Link } from "@tanstack/react-router";
import { UPLINK_BODY_TEMPLATE, UPLINK_CALLBACK_PATH } from "#shared/sigfox";
import { CopyButton } from "../components/copy-button";
import { useI18n } from "../i18n";

export function CallbackSetupPage() {
	const { t } = useI18n();
	const url = `${location.origin}${UPLINK_CALLBACK_PATH}`;

	return (
		<section className="section">
			<header className="stack">
				<h1 className="heading-32">{t("callback.heading")}</h1>
				<p className="copy-14 secondary">{t("callback.body")}</p>
			</header>

			<dl className="settings-list">
				<div>
					<dt className="label-13 secondary">{t("callback.type")}</dt>
					<dd className="mono">DATA / UPLINK</dd>
				</div>
				<div>
					<dt className="label-13 secondary">{t("callback.url")}</dt>
					<dd className="copy-row">
						<code className="secret">{url}</code>
						<CopyButton text={url} label={t("callback.copyUrl")} />
					</dd>
				</div>
				<div>
					<dt className="label-13 secondary">{t("callback.method")}</dt>
					<dd className="mono">POST</dd>
				</div>
				<div>
					<dt className="label-13 secondary">{t("callback.contentType")}</dt>
					<dd className="mono">application/json</dd>
				</div>
				<div>
					<dt className="label-13 secondary">{t("callback.header")}</dt>
					<dd className="stack">
						<code className="mono">Authorization: Bearer &lt;token&gt;</code>
						<span className="copy-14 secondary">
							{t("callback.headerHint")}{" "}
							<Link to="/settings/tokens" className="link">
								{t("nav.apiTokens")}
							</Link>
						</span>
					</dd>
				</div>
				<div>
					<dt className="label-13 secondary">{t("callback.bodyTemplate")}</dt>
					<dd className="copy-row">
						<code className="secret">{UPLINK_BODY_TEMPLATE}</code>
						<CopyButton text={UPLINK_BODY_TEMPLATE} label={t("callback.copyBody")} />
					</dd>
				</div>
			</dl>
			<p className="copy-14 secondary">{t("callback.duplicates")}</p>
		</section>
	);
}
