import {
	transformPoint,
	type PathCommand,
	type Point,
	type VectorObject,
	type VectorPath,
} from "./model";

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface PenPoint {
	point: Point;
	handle?: Point;
}

export function penPath(points: readonly PenPoint[], close: boolean): PathCommand[] {
	if (!points.length) return [];
	const commands: PathCommand[] = [{ op: "M", points: [points[0].point] }];
	const length = points.length + Number(close);
	for (let i = 1; i < length; i++) {
		const previous = points[i - 1],
			next = points[i % points.length];
		if (!previous.handle && !next.handle) {
			if (i < points.length) commands.push({ op: "L", points: [next.point] });
		} else {
			const incoming: Point = next.handle
				? [2 * next.point[0] - next.handle[0], 2 * next.point[1] - next.handle[1]]
				: next.point;
			commands.push({
				op: "C",
				points: [previous.handle ?? previous.point, incoming, next.point],
			});
		}
	}
	if (close) commands.push({ op: "Z", points: [] });
	return commands;
}

function cubicAt([a, b, c, d]: readonly number[], t: number): number {
	const q = 1 - t;
	return a * q * q * q + 3 * b * q * q * t + 3 * c * q * t * t + d * t * t * t;
}

function cubicExtremes([p0, p1, p2, p3]: readonly number[]): number[] {
	const a = -p0 + 3 * p1 - 3 * p2 + p3;
	const b = 2 * (p0 - 2 * p1 + p2);
	const c = p1 - p0;
	if (Math.abs(a) < 1e-9) return Math.abs(b) < 1e-9 ? [] : [-c / b];
	const disc = b * b - 4 * a * c;
	return disc < 0 ? [] : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)];
}

export function objectBounds(object: VectorObject): Bounds {
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	const add = ([x, y]: Point) => {
		left = Math.min(left, x);
		right = Math.max(right, x);
		top = Math.min(top, y);
		bottom = Math.max(bottom, y);
	};
	if (object.kind === "text") {
		const context = document.createElement("canvas").getContext("2d");
		if (context) context.font = `${object.size}px Arial, sans-serif`;
		const w = context?.measureText(object.text).width ?? object.text.length * object.size * 0.5;
		for (const point of [
			[0, -object.size],
			[0, object.size * 0.2],
			[w, -object.size],
			[w, object.size * 0.2],
		] as Point[])
			add(transformPoint(object.matrix, point));
	} else {
		let last: Point = [0, 0],
			start: Point = last;
		for (const command of object.commands) {
			const points = command.points.map((point) => transformPoint(object.matrix, point));
			if (command.op === "Z") {
				last = start;
				continue;
			}
			if (command.op === "C") {
				const axisX = [last[0], ...points.map((p) => p[0])];
				const axisY = [last[1], ...points.map((p) => p[1])];
				for (const t of [...cubicExtremes(axisX), ...cubicExtremes(axisY)])
					if (t > 0 && t < 1) add([cubicAt(axisX, t), cubicAt(axisY, t)]);
			}
			last = points.at(-1)!;
			if (command.op === "M") start = last;
			add(last);
		}
	}
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export function reshapeNode(
	object: VectorPath,
	index: number,
	pointIndex: number,
	position: Point,
): VectorPath {
	const commands = object.commands.map((command) => ({
		...command,
		points: [...command.points],
	})) as PathCommand[];
	const command = commands[index];
	const old = command.points[pointIndex];
	if (!old) return object;
	command.points[pointIndex] = position;
	if (pointIndex === command.points.length - 1) {
		const dx = position[0] - old[0],
			dy = position[1] - old[1];
		const offset = (point: Point): Point => [point[0] + dx, point[1] + dy];
		if (command.op === "C") command.points[1] = offset(command.points[1]);
		const next = commands[index + 1];
		if (next?.op === "C") next.points[0] = offset(next.points[0]);
		// Some closed curves repeat the first anchor explicitly before Z.
		if (command.op === "M") {
			let end = index + 1;
			while (end < commands.length && commands[end].op !== "M" && commands[end].op !== "Z")
				end++;
			const closing = commands[end - 1];
			const closingPoint = closing.points.at(-1);
			if (
				end > index + 1 &&
				commands[end]?.op === "Z" &&
				closingPoint &&
				Math.abs(old[0] - closingPoint[0]) < 1e-6 &&
				Math.abs(old[1] - closingPoint[1]) < 1e-6
			) {
				closing.points[closing.points.length - 1] = position;
				if (closing.op === "C") closing.points[1] = offset(closing.points[1]);
			}
		}
	}
	return { ...object, commands };
}

export function pathNodes(object: VectorPath) {
	const nodes: { index: number; pointIndex: number; point: Point; from?: Point }[] = [];
	let last: Point | undefined;
	for (const [index, command] of object.commands.entries()) {
		const points = command.points.map((point) => transformPoint(object.matrix, point));
		if (!points.length) continue;
		if (command.op === "C") {
			nodes.push(
				{ index, pointIndex: 0, point: points[0], from: last },
				{ index, pointIndex: 1, point: points[1], from: points[2] },
			);
		}
		last = points.at(-1)!;
		nodes.push({ index, pointIndex: points.length - 1, point: last });
	}
	// A curve that returns exactly to its first anchor should show one handle target.
	return nodes.filter((node) => {
		if (node.from || object.commands[node.index + 1]?.op !== "Z") return true;
		const start = nodes.findLast(
			(item) => item.index < node.index && object.commands[item.index].op === "M",
		);
		return (
			!start ||
			Math.hypot(start.point[0] - node.point[0], start.point[1] - node.point[1]) >= 1e-6
		);
	});
}
