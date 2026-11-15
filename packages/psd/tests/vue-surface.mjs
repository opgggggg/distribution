import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, contribution, styles] = await Promise.all([
	readFile(new URL("../src/vue/PsdEditor.vue", import.meta.url), "utf8"),
	readFile(new URL("../src/vue/format-contribution.ts", import.meta.url), "utf8"),
	readFile(new URL("../src/vue/styles.css", import.meta.url), "utf8"),
]);

assert.match(component, /defineExpose<PsdEditorApi>/u);
assert.match(component, /decodePsdComposite/u);
assert.match(component, /toggleLayerVisibility/u);
assert.match(component, /commitOpacity/u);
assert.match(component, /Export PNG/u);
assert.match(contribution, /PSD_ARTIFACT_PLUGIN/u);
assert.match(contribution, /createUiArtifactSurfaceHandle/u);
assert.match(styles, /prefers-reduced-motion/u);
assert.match(styles, /focus-visible/u);

console.log("PSD Vue contribution exposes the desktop editing contract: ok");
