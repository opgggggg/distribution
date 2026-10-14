import type { Point } from "./geometry.js";

/** Touch has no force sensor: derive a smooth pressure curve from writing speed. */
export class VelocityPressure {
	private previous: Point;
	private time: number;
	private pressure = 0.5;
	constructor(point: Point, time: number) {
		this.previous = { ...point };
		this.time = time;
	}
	sample(point: Point, time: number): number {
		const distance = Math.hypot(point.x - this.previous.x, point.y - this.previous.y);
		// Coordinates are physical page points, so zoom does not change the response.
		const elapsed = time - this.time;
		const dt = Number.isFinite(elapsed) && elapsed > 0 ? Math.min(100, elapsed) : 8;
		this.previous = { ...point };
		this.time = time;
		// Duplicate/up events should not thicken the end of an otherwise finished line.
		if (distance < 0.01) return this.pressure;
		const speed = distance / dt;
		const target = 0.12 + 0.8 / (1 + (speed / 0.45) ** 2);
		this.pressure += (target - this.pressure) * (1 - Math.exp(-dt / 35));
		return this.pressure;
	}
}
