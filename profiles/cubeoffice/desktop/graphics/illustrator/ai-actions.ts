import {
	isObjectHidden,
	newPath,
	parseVectorProject,
	type PathCommand,
	type VectorProject,
} from "./model";

const pathCommandSchema = {
	type: "object",
	required: ["op", "points"],
	properties: {
		op: { enum: ["M", "L", "C", "Z"] },
		points: {
			type: "array",
			maxItems: 3,
			items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
		},
	},
};

const actions = [
	{
		type: "manifest.get",
		group: "manifest",
		effect: "read",
		description: "Return all or selected command definitions.",
		schema: {
			type: "object",
			properties: {
				type: { const: "manifest.get" },
				types: { type: "array", items: { type: "string" } },
				groups: { type: "array", items: { type: "string" } },
			},
		},
	},
	{
		type: "artboard.list",
		group: "artboard",
		effect: "read",
		description: "List artboard IDs, dimensions and artwork IDs.",
		schema: { type: "object", properties: { type: { const: "artboard.list" } } },
	},
	{
		type: "path.add",
		group: "path",
		effect: "write",
		description:
			"Add an editable Bézier path in artboard coordinates (origin at top left). M and L take one point, C takes two control points and the endpoint, Z closes the subpath.",
		schema: {
			type: "object",
			required: ["type", "artboardId", "name", "commands", "fill"],
			properties: {
				type: { const: "path.add" },
				artboardId: { type: "string" },
				name: { type: "string", maxLength: 128 },
				commands: { type: "array", minItems: 1, items: pathCommandSchema },
				fill: { type: ["string", "null"], pattern: "^#[0-9a-fA-F]{6}$" },
				fillRule: { enum: ["nonzero", "evenodd"] },
				stroke: { type: ["string", "null"], pattern: "^#[0-9a-fA-F]{6}$" },
				strokeWidth: { type: "number", minimum: 0, maximum: 4096 },
			},
		},
	},
] as const;

export function illustratorActionManifest(
	readonly: boolean,
	types?: readonly unknown[],
	groups?: readonly unknown[],
) {
	return {
		commands: actions.filter(
			(action) =>
				(!readonly || action.effect === "read") &&
				(!types || types.includes(action.type)) &&
				(!groups || groups.includes(action.group)),
		),
	};
}

export function applyIllustratorActions(
	project: VectorProject,
	commands: readonly unknown[],
	readonly: boolean,
) {
	let next = project;
	const values = [];
	for (const input of commands) {
		if (!input || typeof input !== "object" || !("type" in input))
			throw new Error("Expected an Illustrator action with a type.");

		const command = input as Record<string, unknown>;
		switch (command.type) {
			case "manifest.get":
				values.push(
					illustratorActionManifest(
						readonly,
						Array.isArray(command.types) ? command.types : undefined,
						Array.isArray(command.groups) ? command.groups : undefined,
					),
				);
				break;
			case "artboard.list":
				values.push(
					next.artboards.map((board) => ({
						id: board.id,
						name: board.name,
						width: board.width,
						height: board.height,
						...(board.groups ? { groups: board.groups } : {}),
						objects: board.objects.map((object) => ({
							id: object.id,
							name: object.name,
							kind: object.kind,
							locked: object.locked,
							hidden: isObjectHidden(board, object),
							...(object.groupId ? { groupId: object.groupId } : {}),
						})),
					})),
				);
				break;
			case "path.add": {
				if (readonly) throw new Error("This Illustrator document is read-only.");
				const board = next.artboards.find(({ id }) => id === command.artboardId);
				if (!board) throw new Error("The Illustrator artboard was not found.");

				const path = {
					...newPath(command.name as string, command.commands as PathCommand[]),
					fill: command.fill as string | null,
					fillRule: (command.fillRule === undefined ? "nonzero" : command.fillRule) as
						| "nonzero"
						| "evenodd",
					stroke: (command.stroke === undefined ? null : command.stroke) as string | null,
					strokeWidth: (command.strokeWidth === undefined
						? 1.5
						: command.strokeWidth) as number,
				};
				next = {
					...next,
					artboards: next.artboards.map((artboard) =>
						artboard === board
							? { ...board, objects: [...board.objects, path] }
							: artboard,
					),
				};
				values.push({ id: path.id, artboardId: board.id });
				break;
			}
			default:
				throw new Error("Unsupported Illustrator action type.");
		}
	}
	return {
		project: next === project ? project : parseVectorProject(JSON.stringify(next)),
		values,
	};
}
