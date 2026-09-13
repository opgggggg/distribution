import { createDocumentConverters } from "./converters.js";
import { convertDocumentNode, type NodeConvertOptions } from "./node.js";
/** Create headless registry converters using an explicitly configured native backend. */
export function createOfdNodeConverters(options: NodeConvertOptions = {}) {
	return createDocumentConverters(
		(source, from, to, context) =>
			convertDocumentNode(source, from, to, { ...options, ...context }),
		true,
	);
}
