import { attr, children, number, type XmlElement } from "./archive.js";
export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function numbers(value: string): number[] {
	return value.trim()
		? value
				.trim()
				.split(/\s+/)
				.map((v) => number(v))
		: [];
}
export function matrix(value: string): Matrix {
	const values = numbers(value);
	return values.length === 6 ? (values as Matrix) : [...identity];
}
export function multiply(a: Matrix, b: Matrix): Matrix {
	return [
		a[0] * b[0] + a[2] * b[1],
		a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3],
		a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4],
		a[1] * b[4] + a[3] * b[5] + a[5],
	];
}
export function inverse(m: Matrix): Matrix {
	const det = m[0] * m[3] - m[1] * m[2];
	if (Math.abs(det) < 1e-15) throw new Error("Singular OFD coordinate transform.");
	return [
		m[3] / det,
		-m[1] / det,
		-m[2] / det,
		m[0] / det,
		(m[2] * m[5] - m[3] * m[4]) / det,
		(m[1] * m[4] - m[0] * m[5]) / det,
	];
}
/** GB/T 33190 §9.3: non-abbreviated regions used by action hotspots. */
export function regionPath(region: XmlElement): string {
	const output: string[] = [];
	for (const area of children(region, "Area")) {
		let point = numbers(attr(area, "Start"));
		if (point.length !== 2) throw new Error("Region Area requires a Start point.");
		output.push(`M ${point.join(" ")}`);
		for (const command of children(area)) {
			const p = (name: string, fallback: number[] = point) =>
				command.hasAttribute(name) ? numbers(attr(command, name)) : fallback;
			switch (command.localName) {
				case "Move":
					point = p("Point1");
					output.push(`M ${point.join(" ")}`);
					break;
				case "Line":
					point = p("Point1");
					output.push(`L ${point.join(" ")}`);
					break;
				case "QuadraticBezier":
					output.push(`Q ${p("Point1").join(" ")} ${p("Point2").join(" ")}`);
					point = p("Point2");
					break;
				case "CubicBezier": {
					const end = p("Point3");
					output.push(
						`C ${p("Point1").join(" ")} ${p("Point2", end).join(" ")} ${end.join(" ")}`,
					);
					point = end;
					break;
				}
				case "Arc": {
					const radii = numbers(attr(command, "EllipseSize")).map(Math.abs),
						end = p("EndPoint");
					output.push(
						radii[0] && (radii[1] ?? radii[0])
							? `A ${radii[0]} ${radii[1] ?? radii[0]} ${number(attr(command, "RotationAngle")) % 360} ${attr(command, "LargeArc") === "true" ? 1 : 0} ${attr(command, "SweepDirection") === "true" ? 1 : 0} ${end.join(" ")}`
							: `L ${end.join(" ")}`,
					);
					point = end;
					break;
				}
				case "Close":
					output.push("Z");
					break;
			}
		}
		output.push("Z");
	}
	return output.join(" ");
}
