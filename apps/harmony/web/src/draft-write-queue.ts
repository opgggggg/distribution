/** Capture order, not export completion order, determines the latest durable draft. */
export class DraftWriteQueue {
	private next = 0;
	private readonly committed = new Map<string, number>();
	private readonly pending = new Map<string, Promise<unknown>>();
	capture(): number {
		return ++this.next;
	}
	async write(
		key: string,
		sequence: number,
		operation: () => Promise<boolean | void>,
	): Promise<boolean> {
		const previous = this.pending.get(key);
		const write = (async () => {
			await previous?.catch(() => undefined);
			if (sequence <= (this.committed.get(key) ?? 0)) return false;
			if ((await operation()) === false) return false;
			this.committed.set(key, sequence);
			return true;
		})();
		this.pending.set(key, write);
		try {
			return await write;
		} finally {
			if (this.pending.get(key) === write) this.pending.delete(key);
		}
	}
}
