const backHandlers = new WeakMap<Element, () => boolean>();

/** Called by a mounted reader; returns the unregister function. */
export function registerEpubBackHandler(element: Element, handler: () => boolean): () => void {
	backHandlers.set(element, handler);
	return () => { backHandlers.delete(element); };
}

/**
 * Close the innermost open layer of a mounted reader (sheet, popover, menu).
 * Mobile hosts call it from the system back gesture before leaving the book.
 * Kept apart from the reader so a host can import it without the reader chunk.
 */
export function handleEpubBack(element: Element | null | undefined): boolean {
	const root = element?.matches(".cubexp-epub") ? element : element?.querySelector(".cubexp-epub");
	return root ? backHandlers.get(root)?.() ?? false : false;
}
