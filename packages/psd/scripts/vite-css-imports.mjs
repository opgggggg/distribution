import { posix } from "node:path";

/**
 * Vite's library mode extracts every `import "./x.css"` a component carries
 * into a standalone asset and replaces the statement with an `/* empty css *\/`
 * marker. The published components then render unstyled until the host app
 * imports the stylesheets by hand.
 *
 * Re-attach one relative import per chunk so the shipped components stay
 * self-contained: `import { DocxViewer } from "@bbk.co/openfilekit-docx/vue"`
 * pulls its CSS through the host bundler exactly like the source build does.
 * The aggregate stylesheets stay exported for hosts that prefer to load the
 * CSS themselves.
 */
export function preserveCssImports() {
	return {
		name: "preserve-css-imports",
		enforce: "post",
		generateBundle(_options, bundle) {
			for (const output of Object.values(bundle)) {
				if (output.type !== "chunk") continue;
				const importedCss = output.viteMetadata?.importedCss;
				if (!importedCss?.size) continue;
				const chunkDirectory = posix.dirname(output.fileName);
				const statements = [...importedCss].map((cssFileName) => {
					const target = posix.relative(chunkDirectory, cssFileName);
					return `import "${target.startsWith(".") ? target : `./${target}`}";`;
				});
				output.code = `${statements.join("\n")}\n${output.code}`;
			}
		},
	};
}
