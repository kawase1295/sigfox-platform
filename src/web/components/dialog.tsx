import { type ReactNode, useEffect, useId, useRef } from "react";

type Props = { open: boolean; title: string; onClose: () => void; children: ReactNode };

/** Native <dialog> driven by React state, so focus trapping and Escape come from the browser. */
export function Dialog({ open, title, onClose, children }: Props) {
	const ref = useRef<HTMLDialogElement>(null);
	const titleId = useId();

	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		// Why the fallback: some DOM implementations (and older browsers) lack showModal.
		if (open && !dialog.open)
			typeof dialog.showModal === "function" ? dialog.showModal() : dialog.setAttribute("open", "");
		if (!open && dialog.open) dialog.close();
	}, [open]);

	return (
		<dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose}>
			{open && (
				<>
					<h2 id={titleId} className="heading-20">
						{title}
					</h2>
					{children}
				</>
			)}
		</dialog>
	);
}
