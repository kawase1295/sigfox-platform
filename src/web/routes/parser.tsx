import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, lazy, Suspense, useState } from "react";
import type { ParseResult, Parser } from "#shared/parsers";
import { deleteParser, getParser, testParser, updateParser } from "../api/client";
import { Dialog } from "../components/dialog";
import { useI18n } from "../i18n";

// Why lazy: CodeMirror is the heaviest dependency and only this page needs it.
const CodeEditor = lazy(() => import("../components/code-editor"));

export function ParserPage({ parserId }: { parserId: string }) {
	const { t } = useI18n();
	const parser = useQuery({ queryKey: ["parsers", parserId], queryFn: () => getParser(parserId) });

	return (
		<section className="section">
			<Link to="/parsers" className="label-13 secondary link">
				{t("parser.back")}
			</Link>
			{parser.isPending ? (
				<p className="copy-14 secondary">{t("common.loading")}</p>
			) : parser.isError ? (
				<p className="copy-14 error" role="alert">
					{t("parser.loadError")}
				</p>
			) : (
				<ParserEditor key={parser.data.id} parser={parser.data} />
			)}
		</section>
	);
}

function ParserEditor({ parser }: { parser: Parser }) {
	const { t } = useI18n();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [name, setName] = useState(parser.name);
	const [code, setCode] = useState(parser.code);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const save = useMutation({
		mutationFn: () => updateParser(parser.id, { name, code }),
		onSuccess: (updated) => {
			queryClient.setQueryData(["parsers", parser.id], updated);
			return queryClient.invalidateQueries({ queryKey: ["parsers"], exact: true });
		},
	});
	const remove = useMutation({
		mutationFn: () => deleteParser(parser.id),
		onSuccess: async () => {
			setConfirmDelete(false);
			queryClient.removeQueries({ queryKey: ["parsers", parser.id] });
			await queryClient.invalidateQueries({ queryKey: ["parsers"], exact: true });
			await navigate({ to: "/parsers" });
		},
	});
	const dirty = name.trim() !== parser.name || code !== parser.code;

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (name.trim()) save.mutate();
	};

	return (
		<>
			<form className="stack-form" onSubmit={onSubmit}>
				<label className="field">
					<span className="label-13">{t("parsers.name")}</span>
					<input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
				</label>
				<div className="field wide">
					<span className="label-13">{t("parser.code")}</span>
					<Suspense fallback={<p className="copy-14 secondary">{t("common.loading")}</p>}>
						<CodeEditor value={code} onChange={setCode} label={t("parser.code")} />
					</Suspense>
					<p className="copy-13 secondary">{t("parser.codeHint")}</p>
				</div>
				<div className="inline-form">
					<button type="submit" className="button primary" disabled={save.isPending || !dirty || !name.trim()}>
						{save.isPending ? t("device.saving") : t("parser.save")}
					</button>
					<button type="button" className="button secondary" onClick={() => setConfirmDelete(true)}>
						{t("parser.delete")}
					</button>
				</div>
				{save.isError && (
					<p className="copy-14 error" role="alert">
						{t("parser.saveError")}
					</p>
				)}
			</form>

			<TestRun code={code} />

			<Dialog open={confirmDelete} title={t("parser.deleteDialog.title")} onClose={() => setConfirmDelete(false)}>
				<p className="copy-14 secondary">{t("parser.deleteDialog.body")}</p>
				{remove.isError && (
					<p className="copy-14 error" role="alert">
						{t("parser.deleteError")}
					</p>
				)}
				<div className="dialog-actions">
					<button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>
						{t("tokens.revokeDialog.cancel")}
					</button>
					<button type="button" className="button danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
						{t("parser.deleteDialog.confirm")}
					</button>
				</div>
			</Dialog>
		</>
	);
}

function TestRun({ code }: { code: string }) {
	const { t } = useI18n();
	const [payload, setPayload] = useState("");
	const run = useMutation({ mutationFn: () => testParser({ code, payload }) });
	const valid = /^([0-9a-fA-F]{2}){0,12}$/.test(payload.trim());

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (valid) run.mutate();
	};

	return (
		<section className="stack">
			<h2 className="heading-20">{t("parser.test")}</h2>
			<form className="inline-form" onSubmit={onSubmit}>
				<label className="field">
					<span className="label-13">{t("parser.payload")}</span>
					<input
						className="input mono"
						value={payload}
						placeholder="0a1b2c"
						spellCheck={false}
						onChange={(e) => setPayload(e.target.value)}
					/>
				</label>
				<button type="submit" className="button secondary" disabled={!valid || run.isPending}>
					{run.isPending ? t("parser.running") : t("parser.run")}
				</button>
			</form>
			{!valid && <p className="copy-13 error">{t("parser.payloadHint")}</p>}
			{run.isError && (
				<p className="copy-14 error" role="alert">
					{t("parser.runError")}
				</p>
			)}
			{run.data && <TestResult result={run.data} />}
		</section>
	);
}

function TestResult({ result }: { result: ParseResult }) {
	const { t } = useI18n();
	if (!result.ok)
		return (
			<div className="callout" data-state="error" role="alert">
				<span className="label-13 strong">{t(`parser.error.${result.error.kind}`)}</span>
				<code className="mono">{result.error.message}</code>
			</div>
		);
	if (result.parsed.length === 0) return <p className="copy-14 secondary">{t("parser.noOutput")}</p>;
	return (
		<div className="table-wrap">
			<table className="table">
				<thead>
					<tr>
						<th>{t("parser.key")}</th>
						<th>{t("parser.value")}</th>
						<th>{t("parser.type")}</th>
						<th>{t("parser.unit")}</th>
					</tr>
				</thead>
				<tbody>
					{result.parsed.map((e) => (
						<tr key={e.key}>
							<td className="mono">{e.key}</td>
							<td className="mono">{e.value === null ? "null" : String(e.value)}</td>
							<td className="secondary">{e.type}</td>
							<td>{e.unit || "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
