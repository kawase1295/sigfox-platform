import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

type Props = { value: string; onChange: (value: string) => void; label: string };

// Geist tokens resolve per color scheme, so one theme covers light and dark.
const theme = EditorView.theme({
	"&": { background: "var(--background-100)", color: "var(--gray-1000)", font: "var(--copy-14-mono)" },
	".cm-content": { caretColor: "var(--gray-1000)", fontFamily: "var(--font-mono)" },
	".cm-gutters": { background: "var(--background-200)", color: "var(--gray-900)", border: "none" },
	".cm-activeLine, .cm-activeLineGutter": { background: "var(--gray-alpha-100)" },
	"&.cm-focused": { outline: "none" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { background: "var(--blue-300)" },
});

const highlight = HighlightStyle.define([
	{ tag: [tags.keyword, tags.operatorKeyword], color: "var(--red-900)" },
	{ tag: [tags.string, tags.regexp], color: "var(--green-900)" },
	{ tag: [tags.number, tags.bool, tags.null], color: "var(--blue-900)" },
	{ tag: tags.comment, color: "var(--gray-900)", fontStyle: "italic" },
	{ tag: [tags.function(tags.variableName), tags.propertyName], color: "var(--amber-900)" },
]);

/** Uncontrolled CodeMirror instance; React only seeds the initial value and listens for edits. */
export default function CodeEditor({ value, onChange, label }: Props) {
	const host = useRef<HTMLDivElement>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	// Why track the latest value: a locale switch rebuilds the editor and must not drop unsaved edits.
	const latest = useRef(value);
	latest.current = value;

	useEffect(() => {
		if (!host.current) return;
		const view = new EditorView({
			parent: host.current,
			doc: latest.current,
			extensions: [
				basicSetup,
				javascript(),
				theme,
				syntaxHighlighting(highlight),
				EditorView.contentAttributes.of({ "aria-label": label }),
				EditorView.updateListener.of((u) => {
					if (u.docChanged) onChangeRef.current(u.state.doc.toString());
				}),
			],
		});
		return () => view.destroy();
	}, [label]);

	return <div ref={host} className="code-editor" />;
}
