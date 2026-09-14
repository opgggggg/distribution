/** Private Node worker. Native renderer faults must not terminate the caller. */
import { renderAsync } from "@resvg/resvg-js";
if (process.send)
	process.once("message", async (message: { svg: string; width: number; font: string }) => {
		try {
			const rendered = await renderAsync(message.svg, {
				fitTo: { mode: "width", value: message.width },
				font: {
					loadSystemFonts: /<text\b[^>]*fill="(?!transparent)[^"]*"/.test(message.svg),
					defaultFontFamily: message.font,
				},
				background: "white",
			});
			process.send?.({ bytes: rendered.asPng() }, () => process.disconnect());
		} catch (error) {
			process.send?.({ error: error instanceof Error ? error.message : String(error) }, () =>
				process.disconnect(),
			);
		}
	});
