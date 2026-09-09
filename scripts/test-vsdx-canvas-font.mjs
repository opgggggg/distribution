import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const source = await readFile(
	new URL("../als-office/packages/vsdx/src/render/canvas.ts", import.meta.url),
	"utf8",
);
const ast = ts.createSourceFile("canvas.ts", source, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(
	(node) =>
		ts.isFunctionDeclaration(node) && ["fontSize", "applyTextFormat"].includes(node.name?.text),
);
assert.equal(functions.length, 2);
const script = ts.transpileModule(
	`const DEFAULT_FONT_FAMILY = "sans-serif";\n${functions.map((node) => node.getText(ast)).join("\n")}`,
	{ compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const page = await browser.newPage();
	await page.addScriptTag({ content: script });
	const result = await page.evaluate(() => {
		const context = document.createElement("canvas").getContext("2d");
		// Deliberately start with a different font, so rejected shorthand is detected.
		context.font = "10px sans-serif";
		applyTextFormat(context, { fontSizePt: 24, fontFamily: "Arial", bold: true });
		const first = context.font;
		applyTextFormat(context, {
			fontSizePt: 12,
			fontFamily: "Arial",
			italic: true,
			fontScale: 0.75,
		});
		return { first, second: context.font };
	});
	assert.match(result.first, /32px/);
	assert.match(result.first, /bold|700/);
	assert.match(result.second, /16px/);
	assert.match(result.second, /italic/);
	console.log(
		"PASS: Canvas accepts VSDX font sizes and formatting instead of retaining 10px fallback.",
	);
} finally {
	await browser.close();
}
