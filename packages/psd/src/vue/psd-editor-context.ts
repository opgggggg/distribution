import { inject, type InjectionKey } from "vue";
import type { PsdEditorController } from "./use-psd-editor";

export const PSD_EDITOR_CONTEXT: InjectionKey<PsdEditorController> = Symbol("psd-editor");

export function usePsdEditorContext(): PsdEditorController {
	const controller = inject(PSD_EDITOR_CONTEXT);
	if (!controller) throw new Error("PSD editor context is not provided");
	return controller;
}
