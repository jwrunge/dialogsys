export const SAVE_DEBOUNCE_MS = 450;

export class DebouncedTask {
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly delayMs: number,
		private readonly fn: () => void,
	) {}

	schedule(): void {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.fn(), this.delayMs);
	}

	cancel(): void {
		clearTimeout(this.timer);
		this.timer = undefined;
	}
}
