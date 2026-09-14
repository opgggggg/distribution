import { StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { highlightText } from "../index.js";

/** highlight.js owns token colours; CodeMirror owns editing, selection and layout. */
export function highlightJsExtension(fileName: string, language?: string) {
	function decorate(text: string): DecorationSet {
		const highlighted = highlightText(text, { fileName, language });
		if (!highlighted.highlighted) return Decoration.none;
		const template = document.createElement("template");
		template.innerHTML = highlighted.html;
		const ranges: { from: number; to: number; className: string }[] = [];
		let offset = 0;
		function walk(node: Node, classes: string[]) {
			if (node.nodeType === 3) {
				const length = node.textContent?.length ?? 0;
				if (length && classes.length) ranges.push({ from: offset, to: offset + length, className: classes.join(" ") });
				offset += length;
				return;
			}
			const next = node instanceof Element && node.className ? [...classes, node.className] : classes;
			for (const child of node.childNodes) walk(child, next);
		}
		walk(template.content, []);
		const builder = new RangeSetBuilder<Decoration>();
		for (const range of ranges) builder.add(range.from, range.to, Decoration.mark({ class: range.className }));
		return builder.finish();
	}
	return StateField.define<DecorationSet>({
		create: state => state.doc.length > 200_000 ? Decoration.none : decorate(state.doc.toString()),
		update: (value, transaction) => transaction.docChanged ? transaction.newDoc.length > 200_000 ? Decoration.none : decorate(transaction.newDoc.toString()) : value,
		provide: field => EditorView.decorations.from(field),
	});
}
