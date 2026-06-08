/** Shared read-only flag for remote sync connections (set by ReadOnlyBanner). */
let readOnly = false;

export function setProjectReadOnly(value: boolean): void {
	readOnly = value;
}

export function isProjectReadOnly(): boolean {
	return readOnly;
}
