import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	ADVANCED_BODY_TEMPLATE,
	ADVANCED_CALLBACK_PATH,
	UPLINK_BODY_TEMPLATE,
	UPLINK_CALLBACK_PATH,
} from "#shared/sigfox";
import { CopyButton } from "../components/copy-button";
import { useI18n } from "../i18n";

export function CallbackSetupPage() {
	const { t } = useI18n();

	return (
		<section className="section">
			<header className="stack">
				<h1 className="heading-32">{t("callback.heading")}</h1>
				<p className="copy-14 secondary">{t("callback.body")}</p>
			</header>

			<dl className="settings-list">
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
			</dl>

			<CallbackType
				type="DATA / UPLINK"
				body={t("callback.uplinkBody")}
				path={UPLINK_CALLBACK_PATH}
				template={UPLINK_BODY_TEMPLATE}
				note={t("callback.duplicates")}
			/>
			<CallbackType
				type="DATA / ADVANCED"
				body={t("callback.advancedBody")}
				path={ADVANCED_CALLBACK_PATH}
				template={ADVANCED_BODY_TEMPLATE}
			/>
		</section>
	);
}

type CallbackTypeProps = { type: string; body: string; path: string; template: string; note?: ReactNode };

function CallbackType({ type, body, path, template, note }: CallbackTypeProps) {
	const { t } = useI18n();
	const url = `${location.origin}${path}`;
	return (
		<section className="stack">
			<h2 className="heading-20 mono">{type}</h2>
			<p className="copy-14 secondary">{body}</p>
			<dl className="settings-list">
				<div>
					<dt className="label-13 secondary">{t("callback.url")}</dt>
					<dd className="copy-row">
						<code className="secret">{url}</code>
						<CopyButton text={url} label={t("callback.copyUrl")} />
					</dd>
				</div>
				<div>
					<dt className="label-13 secondary">{t("callback.bodyTemplate")}</dt>
					<dd className="copy-row">
						<code className="secret">{template}</code>
						<CopyButton text={template} label={t("callback.copyBody")} />
					</dd>
				</div>
			</dl>
			{note && <p className="copy-14 secondary">{note}</p>}
		</section>
	);
}
