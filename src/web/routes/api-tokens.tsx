import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import type { ApiToken, CreateApiTokenResponse } from "#shared/api-tokens";
import { createApiToken, listApiTokens, revokeApiToken } from "../api/client";
import { Dialog } from "../components/dialog";
import { useI18n } from "../i18n";

const QUERY_KEY = ["api-tokens"];

export function ApiTokensPage() {
	const { t, locale } = useI18n();
	const queryClient = useQueryClient();
	const tokens = useQuery({ queryKey: QUERY_KEY, queryFn: listApiTokens });
	const [name, setName] = useState("");
	const [created, setCreated] = useState<CreateApiTokenResponse | null>(null);
	const [revoking, setRevoking] = useState<ApiToken | null>(null);
	const [copied, setCopied] = useState(false);

	const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	const create = useMutation({
		mutationFn: createApiToken,
		onSuccess: (result) => {
			setName("");
			setCopied(false);
			setCreated(result);
			return refresh();
		},
	});
	const revoke = useMutation({
		mutationFn: revokeApiToken,
		onSuccess: () => {
			setRevoking(null);
			return refresh();
		},
	});

	const formatDate = (iso: string | null) =>
		iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (name.trim()) create.mutate({ name: name.trim() });
	};

	const copy = async (secret: string) => {
		try {
			await navigator.clipboard.writeText(secret);
			setCopied(true);
		} catch {}
	};

	return (
		<section className="section">
			<header className="stack">
				<h1 className="heading-32">{t("tokens.heading")}</h1>
				<p className="copy-14 secondary">{t("tokens.body")}</p>
			</header>

			<form className="inline-form" onSubmit={onSubmit}>
				<label className="field">
					<span className="label-13">{t("tokens.name")}</span>
					<input
						className="input"
						value={name}
						maxLength={100}
						placeholder={t("tokens.namePlaceholder")}
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				<button type="submit" className="button primary" disabled={!name.trim() || create.isPending}>
					{create.isPending ? t("tokens.creating") : t("tokens.create")}
				</button>
			</form>
			{create.isError && (
				<p className="copy-14 error" role="alert">
					{t("tokens.createError")}
				</p>
			)}

			{tokens.isPending ? (
				<p className="copy-14 secondary">{t("tokens.loading")}</p>
			) : tokens.isError ? (
				<p className="copy-14 error" role="alert">
					{t("tokens.loadError")}
				</p>
			) : tokens.data.length === 0 ? (
				<p className="copy-14 secondary">{t("tokens.empty")}</p>
			) : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr>
								<th>{t("tokens.name")}</th>
								<th>{t("tokens.createdAt")}</th>
								<th>{t("tokens.lastUsedAt")}</th>
								<th>{t("tokens.status")}</th>
								<th>
									<span className="visually-hidden">{t("tokens.actions")}</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{tokens.data.map((token) => (
								<tr key={token.id}>
									<td>{token.name}</td>
									<td className="mono">{formatDate(token.createdAt)}</td>
									<td className="mono">{formatDate(token.lastUsedAt)}</td>
									<td>
										<span className="badge" data-state={token.revokedAt ? "revoked" : "active"}>
											{token.revokedAt ? t("tokens.revoked") : t("tokens.active")}
										</span>
									</td>
									<td className="actions">
										{!token.revokedAt && (
											<button type="button" className="button tertiary small" onClick={() => setRevoking(token)}>
												{t("tokens.revoke")}
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<Dialog open={created !== null} title={t("tokens.created.title")} onClose={() => setCreated(null)}>
				<p className="copy-14 secondary">{t("tokens.created.body")}</p>
				<code className="secret">{created?.secret}</code>
				<div className="dialog-actions">
					<button type="button" className="button secondary" onClick={() => created && copy(created.secret)}>
						{copied ? t("tokens.created.copied") : t("tokens.created.copy")}
					</button>
					<button type="button" className="button primary" onClick={() => setCreated(null)}>
						{t("tokens.created.done")}
					</button>
				</div>
			</Dialog>

			<Dialog open={revoking !== null} title={t("tokens.revokeDialog.title")} onClose={() => setRevoking(null)}>
				<p className="copy-14 secondary">{t("tokens.revokeDialog.body")}</p>
				<p className="copy-14 strong">{revoking?.name}</p>
				{revoke.isError && (
					<p className="copy-14 error" role="alert">
						{t("tokens.revokeError")}
					</p>
				)}
				<div className="dialog-actions">
					<button type="button" className="button secondary" onClick={() => setRevoking(null)}>
						{t("tokens.revokeDialog.cancel")}
					</button>
					<button
						type="button"
						className="button danger"
						disabled={revoke.isPending}
						onClick={() => revoking && revoke.mutate(revoking.id)}
					>
						{revoke.isPending ? t("tokens.revoking") : t("tokens.revokeDialog.confirm")}
					</button>
				</div>
			</Dialog>
		</section>
	);
}
