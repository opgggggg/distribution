import { objectBounds, type Bounds } from "./geometry";
import { multiply, type Matrix, type Point, type VectorObject } from "./model";

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";
export const alignmentCommands = [
	["left", "Align left", "align-left"],
	["center", "Center horizontally", "align-center"],
	["right", "Align right", "align-right"],
	["top", "Align top", "align-top"],
	["middle", "Center vertically", "align-middle"],
	["bottom", "Align bottom", "align-bottom"],
] as const;

export function unionBounds(boxes: readonly Bounds[]): Bounds | undefined {
	let left = Infinity,
		top = Infinity,
		right = -Infinity,
		bottom = -Infinity;
	for (const box of boxes) {
		left = Math.min(left, box.x);
		top = Math.min(top, box.y);
		right = Math.max(right, box.x + box.width);
		bottom = Math.max(bottom, box.y + box.height);
	}
	return Number.isFinite(left)
		? { x: left, y: top, width: right - left, height: bottom - top }
		: undefined;
}

export function boxBetween(a: Point, b: Point): Bounds {
	return {
		x: Math.min(a[0], b[0]),
		y: Math.min(a[1], b[1]),
		width: Math.abs(a[0] - b[0]),
		height: Math.abs(a[1] - b[1]),
	};
}

export function enclosed(box: Bounds, frame: Bounds): boolean {
	const tolerance = 0.001;
	return (
		box.x >= frame.x - tolerance &&
		box.y >= frame.y - tolerance &&
		box.x + box.width <= frame.x + frame.width + tolerance &&
		box.y + box.height <= frame.y + frame.height + tolerance
	);
}

export function transformObjects(objects: readonly VectorObject[], matrix: Matrix): VectorObject[] {
	return objects.map((object) => ({ ...object, matrix: multiply(matrix, object.matrix) }));
}

/** Group members are one alignment unit. The group's relative geometry and paint order stay intact. */
export function selectionUnits(
	objects: readonly VectorObject[],
): { objects: VectorObject[]; bounds: Bounds }[] {
	const entries = new Map<string, VectorObject[]>();
	for (const object of objects) {
		const key = object.groupId ? "group:" + object.groupId : "object:" + object.id;
		let members = entries.get(key);
		if (!members) entries.set(key, (members = []));
		members.push(object);
	}
	return [...entries.values()].map((members) => ({
		objects: members,
		bounds: unionBounds(members.map(objectBounds))!,
	}));
}

function reference(box: Bounds, alignment: Alignment): number {
	switch (alignment) {
		case "left":
			return box.x;
		case "center":
			return box.x + box.width / 2;
		case "right":
			return box.x + box.width;
		case "top":
			return box.y;
		case "middle":
			return box.y + box.height / 2;
		case "bottom":
			return box.y + box.height;
	}
}

export function alignObjects(
	units: ReturnType<typeof selectionUnits>,
	alignment: Alignment,
	target: Bounds,
): VectorObject[] {
	const horizontal = alignment === "left" || alignment === "center" || alignment === "right";
	return units.flatMap(({ objects, bounds }) => {
		const delta = reference(target, alignment) - reference(bounds, alignment);
		return Math.abs(delta) < 1e-6
			? []
			: transformObjects(objects, [
					1,
					0,
					0,
					1,
					horizontal ? delta : 0,
					horizontal ? 0 : delta,
				]);
	});
}

export function distributeObjects(
	units: ReturnType<typeof selectionUnits>,
	axis: "x" | "y",
): VectorObject[] {
	if (units.length < 3) return [];
	const size = axis === "x" ? "width" : "height";
	const ordered = [...units].sort((a, b) => a.bounds[axis] - b.bounds[axis]);
	const first = ordered[0].bounds,
		last = ordered.at(-1)!.bounds;
	const total = ordered.reduce((sum, unit) => sum + unit.bounds[size], 0);
	// In a crowded selection, use touching edges so narrow items cannot pass wider ones.
	const gap = Math.max(0, (last[axis] + last[size] - first[axis] - total) / (ordered.length - 1));
	let position = first[axis] + first[size] + gap;
	return ordered.slice(1).flatMap(({ objects, bounds }) => {
		const delta = position - bounds[axis];
		position += bounds[size] + gap;
		return Math.abs(delta) < 1e-6
			? []
			: transformObjects(objects, [
					1,
					0,
					0,
					1,
					axis === "x" ? delta : 0,
					axis === "y" ? delta : 0,
				]);
	});
}
