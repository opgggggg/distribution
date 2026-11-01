// Regenerate after building @cubexp/notes. Expectations come from the original editor helpers.
import { writeFileSync, mkdirSync } from "node:fs";
import { createNotebook } from "../packages/notes/dist/index.js";
import { shapePoints } from "../packages/notes/dist/geometry.js";
import { snapMove } from "../packages/notes/dist/manipulation.js";
const rect = (id, x, y, width = 80) => ({ id, kind: "stroke", tool: "pen", shape: "rectangle", color: "#222b40", width: 2, opacity: 1, pressure: false, points: shapePoints("rectangle", { x, y }, { x: x + width, y: y + 60 }) });
const cases = [];
for (const infinite of [true, false]) {
  for (const spacing of [true, false]) {
    const page = createNotebook().pages[0];
    page.infinite = infinite;
    page.layers[0].elements = spacing
      ? [rect("a", 202, 100, 40), rect("left", 40, 100), rect("right", 320, 100)]
      : [rect("a", 40, 100), rect("b", 240, 100)];
    for (const [dx, dy, threshold, grid, align] of [[30, 3, 6, false, true], [7, 9, 6, false, false], [7, 9, 6, true, false], [0, 0, 6, false, true], [-300, -200, 6, true, true], [0, 8, 3, true, true], [0, 8, 12, false, true], [1000, 1000, 6, false, false]]) {
      cases.push({ page, ids: ["a"], dx, dy, threshold, grid, align, expected: snapMove(page, ["a"], dx, dy, threshold, grid, align) });
    }
  }
}
const path = new URL("../crates/notes-core/tests/fixtures/native-manipulation.json", import.meta.url);
mkdirSync(new URL(".", path), { recursive: true });
writeFileSync(path, JSON.stringify(cases, null, 2) + "\n");
console.log(`Wrote ${cases.length} original-editor manipulation fixtures`);
