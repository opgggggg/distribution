<script setup lang="ts">
import type { PsdImageServices } from "./image-services";
import { ref, shallowRef, watch, computed, nextTick, useId, onMounted, onBeforeUnmount } from "vue";
import { createBlankPsdDocument, writePsd } from "@cubexp/psd";
import { UiDialog, UiButton } from "@yaochn/als-office-editor-ui/vue";
import PsdEditor from "./PsdEditor.vue";
import type { PsdEditorApi, PsdSource, PsdEditorAppearance } from "./component-types";
import { PROJECT_LAYER_MIME, layerImportAction } from "./psd-project-drag";
const props = withDefaults(
	defineProps<{
		source?: PsdSource | null;
		imageServices?: PsdImageServices;
		fileName?: string;
		appearance?: PsdEditorAppearance;
	}>(),
	{ source: null, fileName: "Untitled.psd", appearance: "dark" },
);
const localAppearance = ref(props.appearance);
watch(() => props.appearance, value => { localAppearance.value = value; });
interface Project {
	id: string;
	name: string;
	source: PsdSource | null;
	dirty: boolean;
}
const projects = shallowRef<Project[]>([]),
	active = ref(""),
	error = ref(""),
	closing = ref(""),
	fileInput = ref<HTMLInputElement | null>(null),
	apis = new Map<string, PsdEditorApi>();
let serial = 0;
function add(source: PsdSource | null = null, name = "Untitled.psd") {
	const id = `project-${Date.now()}-${++serial}`;
	projects.value = [...projects.value, { id, name, source, dirty: false }];
	active.value = id;
}
watch(
	() => props.source,
	(source) => {
		add(source ?? null, props.fileName);
	},
	{ immediate: true },
);
const creating = ref(false),
	newWidth = ref(800),
	newHeight = ref(600),
	newPpi = ref(72),
	newBackground = ref("white"),
	newName = ref("Untitled.psd"),
	createError = ref("");
type DimensionField = "width" | "height" | "ppi";
const formId = useId();
const dimensionInputs = new Map<DimensionField, HTMLInputElement>();
const fieldErrors = ref<Partial<Record<DimensionField, string>>>({});
const closingOpen = computed({get: () => Boolean(closing.value), set: open => { if (!open) closing.value = ""; }});
watch(creating, () => { fieldErrors.value = {}; createError.value = ""; });
async function createProject() {
 fieldErrors.value = {};
 createError.value = "";
 for (const [field, label, value] of [["width", "Width", newWidth.value], ["height", "Height", newHeight.value], ["ppi", "Resolution", newPpi.value]] as const) {
  if (!Number.isInteger(value) || value < 1 || value > 30000) fieldErrors.value[field] = `${label} must be a whole number from 1 to 30000.`;
 }
 const first = Object.keys(fieldErrors.value)[0] as DimensionField | undefined;
 if (first) { await nextTick(); dimensionInputs.get(first)?.focus(); return; }
 try {
		const doc = createBlankPsdDocument({
			width: newWidth.value,
			height: newHeight.value,
			resolutionPpi: newPpi.value,
			background:
				newBackground.value === "transparent"
					? null
					: newBackground.value === "black"
						? { r: 0, g: 0, b: 0 }
						: undefined,
		});
		add(writePsd(doc), newName.value.trim() || "Untitled.psd");
		creating.value = false;
		createError.value = "";
	} catch (e) {
		createError.value = e instanceof Error ? e.message : "Could not create the project. Try smaller dimensions.";
	}
}
function preventUnsavedClose(event: BeforeUnloadEvent) {
	if (projects.value.some((p) => apis.get(p.id)?.isDirty())) {
		event.preventDefault();
		event.returnValue = "";
	}
}
onMounted(() => window.addEventListener("beforeunload", preventUnsavedClose));
onBeforeUnmount(() => window.removeEventListener("beforeunload", preventUnsavedClose));
function navigateTabs(event: KeyboardEvent, id: string) {
	const index = projects.value.findIndex((p) => p.id === id);
	let next = index;
	if (event.key === "ArrowRight") next = (index + 1) % projects.value.length;
	else if (event.key === "ArrowLeft")
		next = (index + projects.value.length - 1) % projects.value.length;
	else if (event.key === "Home") next = 0;
	else if (event.key === "End") next = projects.value.length - 1;
	else return;
	event.preventDefault();
	active.value = projects.value[next].id;
	const tabs = (event.currentTarget as HTMLElement)
		.closest("[role=tablist]")
		?.querySelectorAll<HTMLButtonElement>("[role=tab]");
	tabs?.[next]?.focus();
}
function changed(id: string) {
	projects.value = projects.value.map((p) =>
		p.id === id ? { ...p, dirty: apis.get(id)?.isDirty() ?? true } : p,
	);
}
function remove(id: string) {
	projects.value = projects.value.filter((p) => p.id !== id);
	apis.delete(id);
	closing.value = "";
	if (active.value === id) active.value = projects.value.at(-1)?.id ?? "";
	if (!projects.value.length) add();
}
function close(id: string) {
	if (apis.get(id)?.isDirty()) closing.value = id;
	else remove(id);
}
async function openFiles(files: FileList | null) {
	if (!files) return;
	for (const f of Array.from(files)) add(f, f.name);
	if (fileInput.value) fileInput.value.value = "";
}
function drop(event: DragEvent, id: string) {
	event.preventDefault();
	event.stopPropagation();
	try {
		const raw = event.dataTransfer?.getData(PROJECT_LAYER_MIME);
		if (raw) {
			const source = JSON.parse(raw);
			if (source.project === id) return;
			const api = apis.get(id);
			const result = api?.apply(
				[layerImportAction(source.project, source.id)],
				"Copy Layer from Project",
			);
			if (!result) throw Error("Could not copy layer");
			changed(id);
			active.value = id;
		} else if (event.dataTransfer?.files.length) void openFiles(event.dataTransfer.files);
	} catch (e) {
		error.value = String(e);
	}
}
async function copyMerged() {
	try {
		const blob = await apis.get(active.value)?.copyMerged();
		if (!blob) return;
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		error.value = "";
	} catch (e) {
		error.value = `Could not copy image: ${String(e)}`;
	}
}
function workspaceKeydown(event: KeyboardEvent) {
	if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
	if (event.key.toLowerCase() === "w") { event.preventDefault(); close(active.value); }
}
async function paste(event: ClipboardEvent) {
	const target = event.target as HTMLElement | null;
	if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
	const images = Array.from(event.clipboardData?.files ?? []).filter((f) =>
		f.type.startsWith("image/"),
	);
	if (images.length) {
		event.preventDefault();
		try {
			const api = apis.get(active.value);
			if (!api) throw Error("No active document");
			for (const f of images) await api.pasteImage(f);
			error.value = "";
		} catch (e) { error.value = String(e); }
	}
}
</script>
<template>
	<section
		class="als-ofs-editor-ui psd-workspace"
		:data-appearance="localAppearance"
		:data-theme="localAppearance"
		@paste="paste"
		@keydown="workspaceKeydown"
		@dragover.prevent
		@drop.prevent="openFiles($event.dataTransfer?.files ?? null)"
	>
		<div class="psd-project-bar" role="tablist" aria-label="Open projects">
			<div
				v-for="p in projects"
				:key="p.id"
				class="psd-project-tab"
				:data-project-tab="p.id"
				@dragover.prevent
				@drop="drop($event, p.id)"
			>
				<button
					role="tab"
					:tabindex="active === p.id ? 0 : -1"
					:aria-selected="active === p.id"
					@keydown="navigateTabs($event, p.id)"
					@click="active = p.id"
				>
					{{ p.name }}{{ p.dirty ? " •" : "" }}</button
				><button :aria-label="`Close ${p.name}`" @click="close(p.id)">×</button>
			</div>
			<button aria-label="New project" @click="creating = true">＋</button
			><button @click="fileInput?.click()">Open images / PSD</button
			><button @click="copyMerged">Copy Merged</button>
			<input
				ref="fileInput"
				hidden
				type="file"
				multiple
				accept=".psd,image/*"
				@change="openFiles(($event.target as HTMLInputElement).files)"
			/>
		</div>
		<p v-if="error" role="alert">{{ error }} <button @click="error = ''">Dismiss</button></p>
		<UiDialog v-model="closingOpen" title="Unsaved project" size="sm" :close-on-outside="false" initial-focus="[data-keep-editing]">
   <p>This project has unsaved changes.</p>
   <template #footer>
    <UiButton data-keep-editing @click="closing = ''">Keep editing</UiButton>
    <UiButton @click="remove(closing)">Close without saving</UiButton>
   </template>
  </UiDialog>
		<div
			v-for="p in projects"
			v-show="active === p.id"
			:key="p.id"
			class="psd-project-body"
			role="tabpanel"
			:aria-label="p.name"
		>
			<PsdEditor
				:ref="
					(api) => {
						if (api) apis.set(p.id, api as unknown as PsdEditorApi);
					}
				"
				:project-id="p.id"
				:image-services="imageServices"
				:source="p.source"
				:file-name="p.name"
				:appearance="localAppearance"
				@update:appearance="localAppearance = $event"
				@activate="active = p.id"
				@change="changed(p.id)"
				@filename="name => projects = projects.map(item => item.id === p.id ? { ...item, name } : item)"
				@dirty="changed(p.id)"
				@error="error = $event.message"
			/>
		</div>
		<UiDialog v-model="creating" title="New Project" size="sm">
			<div class="psd-new-fields">
				<label>Name<input v-model="newName" /></label
				><label
					>Width<input
						v-model.number="newWidth"
       :ref="el => { if (el) dimensionInputs.set('width', el as HTMLInputElement); }"
       :aria-invalid="fieldErrors.width ? true : undefined"
       :aria-describedby="fieldErrors.width ? `${formId}-width-error` : undefined"
       @input="delete fieldErrors.width"
						type="number"
						min="1"
						max="30000" /></label
				><label
					>Height<input
						v-model.number="newHeight"
       :ref="el => { if (el) dimensionInputs.set('height', el as HTMLInputElement); }"
       :aria-invalid="fieldErrors.height ? true : undefined"
       :aria-describedby="fieldErrors.height ? `${formId}-height-error` : undefined"
       @input="delete fieldErrors.height"
						type="number"
						min="1"
						max="30000" /></label
				><label
					>Resolution (ppi)<input
						v-model.number="newPpi"
       :ref="el => { if (el) dimensionInputs.set('ppi', el as HTMLInputElement); }"
       :aria-invalid="fieldErrors.ppi ? true : undefined"
       :aria-describedby="fieldErrors.ppi ? `${formId}-ppi-error` : undefined"
       @input="delete fieldErrors.ppi"
						type="number"
						min="1"
						max="30000" /></label
				><label
					>Background<select v-model="newBackground">
						<option value="white">White</option>
						<option value="black">Black</option>
						<option value="transparent">Transparent</option>
					</select></label
				>
			</div>
			<div aria-live="polite">
   <p v-for="(message, field) in fieldErrors" :id="`${formId}-${field}-error`" :key="field" class="psd-field-error">{{ message }}</p>
  </div>
  <p v-if="createError" role="alert">{{ createError }}</p>
			<template #footer
				><UiButton @click="creating = false">Cancel</UiButton
				><UiButton kind="primary" @click="createProject">Create project</UiButton></template
			>
		</UiDialog>
	</section>
</template>
<style scoped>
.psd-new-fields {
	display: grid;
	gap: 12px;
}
.psd-new-fields label {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
}
.psd-new-fields input,
.psd-new-fields select {
	padding: 6px;
	width: 160px;
}
.psd-workspace {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--als-ofs-ui-surface-muted);
	color: var(--als-ofs-ui-text);
	font: 12px system-ui;
}
.psd-project-bar {
	display: flex;
	align-items: center;
	gap: 3px;
	overflow-x: auto;
	padding: 4px;
	flex-shrink: 0;
}
.psd-project-tab {
	display: flex;
	white-space: nowrap;
}
.psd-project-bar button {
	background: var(--als-ofs-ui-surface);
	color: var(--als-ofs-ui-text);
	border: 1px solid var(--als-ofs-ui-border-strong);
	padding: 7px;
	cursor: pointer;
}
.psd-project-bar [aria-selected="true"] {
	background: var(--als-ofs-ui-accent-soft);
	border-color: var(--als-ofs-ui-accent);
}
.psd-project-body {
	flex: 1;
	min-height: 0;
}
.psd-field-error { color: var(--als-ofs-ui-danger); }
.psd-new-fields input[aria-invalid="true"] { border: 1px solid var(--als-ofs-ui-danger); }
.psd-workspace p {
	padding: 8px;
	margin: 0;
}
</style>
