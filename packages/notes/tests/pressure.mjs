import assert from "node:assert/strict";
import { test } from "node:test";
import { VelocityPressure } from "../dist/pressure.js";
import { inkWidth } from "../dist/model.js";
import { strokeOutline } from "../dist/render.js";

function sample(speed, duration = 500, interval = 10) {
	const input = new VelocityPressure({ x: 0, y: 0 }, 0);
	const points = [{ x: 0, y: 0, pressure: 0.5 }];
	for (let time = interval; time <= duration; time += interval)
		points.push({
			x: speed * time,
			y: 0,
			pressure: input.sample({ x: speed * time, y: 0 }, time),
		});
	return { input, points };
}
const stroke = (points) => ({
	id: "ink",
	kind: "stroke",
	tool: "pen",
	penStyle: "brush",
	pressure: true,
	width: 6,
	color: "#222b40",
	opacity: 1,
	points,
});

test("slow finger writing is visibly wider than fast writing in model and rendered outline", () => {
	const slow = stroke(sample(0.08).points),
		fast = stroke(sample(1.5).points);
	assert.ok(inkWidth(slow, slow.points.at(-1)) > inkWidth(fast, fast.points.at(-1)) * 3);
	const span = (s) => {
		const middle = s.points[Math.floor(s.points.length / 2)].x;
		const outline = strokeOutline(s),
			ys = [];
		// Intersect polygon edges: straight edges may have no vertex near the midpoint.
		for (let i = 0; i < outline.length; i++) {
			const a = outline[i],
				b = outline[(i + 1) % outline.length];
			if ((a[0] <= middle && b[0] > middle) || (b[0] <= middle && a[0] > middle))
				ys.push(a[1] + ((middle - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
		}
		assert.equal(ys.length, 2);
		return Math.max(...ys) - Math.min(...ys);
	};
	assert.ok(span(slow) > span(fast) * 3);
});

test("response remains consistent across touch sampling rates and stationary release events", () => {
	const p60 = sample(0.3, 600, 1000 / 60).points.at(-1).pressure;
	const p120 = sample(0.3, 600, 1000 / 120).points.at(-1).pressure;
	assert.ok(Math.abs(p60 - p120) < 0.01);
	const { input, points } = sample(1.5);
	assert.equal(input.sample({ x: 750, y: 0 }, 1000), points.at(-1).pressure);
	assert.ok(Number.isFinite(input.sample({ x: 760, y: 0 }, 1000)));
});

test("speed changes blend smoothly while pressure-off and ballpoint strokes remain uniform", () => {
	const input = new VelocityPressure({ x: 0, y: 0 }, 0);
	let previous = 0.5;
	for (let i = 1; i < 80; i++) {
		const p = input.sample({ x: i < 40 ? i * 0.8 : 31.2 + (i - 39) * 15, y: 0 }, i * 10);
		assert.ok(p >= 0.12 && p <= 0.92);
		assert.ok(Math.abs(p - previous) < 0.25);
		previous = p;
	}
	const s = stroke(sample(0.08).points);
	assert.equal(inkWidth({ ...s, pressure: false }, s.points.at(-1)), s.width);
	assert.equal(inkWidth({ ...s, penStyle: "ballpoint" }, s.points.at(-1)), s.width);
});
