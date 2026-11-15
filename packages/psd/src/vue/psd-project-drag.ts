import { type InjectionKey } from "vue";
import { findPsdLayer, writePsd, psdBytesToBase64, type PsdEditorAction } from "@cubexp/psd";
import type { PsdEditorApi } from "./component-types";
export const PSD_PROJECT_ID: InjectionKey<string> = Symbol("psd-project");
export const PROJECT_LAYER_MIME = "application/x-cubexp-psd-layer";
const projects = new Map<string, PsdEditorApi>();
export function registerProject(id: string, api: PsdEditorApi) {
	projects.set(id, api);
	return () => projects.delete(id);
}
export function layerImportAction(
	project: string,
	layerId: string,
	parentId?: string | null,
	index?: number,
): PsdEditorAction {
	const doc = projects.get(project)?.document();
	if (!doc) throw new Error("Source project is no longer open");
	const layer = findPsdLayer(doc.layers, layerId)?.layer;
	if (!layer) throw new Error("Source layer is no longer available");
	return {
		type: "layer.import",
		psdBase64: psdBytesToBase64(writePsd({ ...doc, layers: [layer] })),
		parentId,
		index,
	};
}
const activators = new Map<string, () => void>();
export function registerProjectActivation(id: string, activate: () => void) {
	activators.set(id, activate);
	return () => activators.delete(id);
}
export function dropProjectLayer(
	sourceProject: string,
	sourceId: string,
	targetProject: string,
	targetId: string | null,
	ratio: number,
	copy: boolean,
) {
	const target = projects.get(targetProject),
		doc = target?.document();
	if (!target) throw new Error("Destination project is no longer registered");
	if (!doc) throw new Error("Destination project is still loading");
	if (target.isReadonly()) throw new Error("Destination project is read-only");
	const found = targetId ? findPsdLayer(doc.layers, targetId) : undefined,
		into = found?.layer.kind === "group" && ratio > 0.25 && ratio < 0.75;
	const parent = into ? found!.layer : found?.parent,
		parentId = parent?.id ?? null,
		siblings = parent?.kind === "group" ? parent.children : doc.layers;
	let index =
		found && !into
			? siblings.findIndex((l) => l.id === targetId) + (ratio < 0.5 ? 1 : 0)
			: siblings.length;
	if (sourceProject === targetProject && !copy) {
		if (sourceId === targetId) return;
		const old = siblings.findIndex((l) => l.id === sourceId);
		if (old >= 0 && old < index) index--;
		if (
			!target.apply(
				[{ type: "layer.reorder", layerId: sourceId, parentId, index }],
				"Move Layer",
			)
		)
			throw Error("Could not move layer");
	} else if (
		!target.apply(
			[layerImportAction(sourceProject, sourceId, parentId, index)],
			"Copy Layer from Project",
		)
	)
		throw Error("Could not copy layer");
	activators.get(targetProject)?.();
}
