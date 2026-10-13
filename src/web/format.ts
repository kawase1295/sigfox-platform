export const formatDateTime = (iso: string | null, locale: string) =>
	iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(iso)) : "—";
