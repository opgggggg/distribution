import {
	defineComponent,
	ref,
	shallowRef,
	computed,
	watch,
	onBeforeUnmount,
	h,
	type PropType,
} from "vue";
type ArtifactSource = Blob | ArrayBuffer | Uint8Array | string;
async function artifactSourceToUint8Array(source: ArtifactSource): Promise<Uint8Array> {
	if (typeof source === "string") {
		const response = await fetch(source);
		if (!response.ok) throw new Error(`Unable to load OFD: HTTP ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	}
	return source instanceof Uint8Array
		? source
		: new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source);
}
import {
	readOfdDocument,
	exportDocument,
	conversionTargets,
	OFD_MIME_TYPES,
	type OfdDocument,
	type ConversionFormat,
	type ConversionResult,
	type ConvertOptions,
} from "../index.js";
export type OfdConverter = (
	source: Blob,
	from: ConversionFormat,
	to: ConversionFormat,
	options: ConvertOptions,
) => Promise<ConversionResult>;
export const OfdViewer = defineComponent({
	name: "OfdViewer",
	props: {
		source: {
			type: [Blob, ArrayBuffer, Uint8Array, String] as PropType<ArtifactSource>,
			required: true,
		},
		fileName: { type: String, default: "document" },
		convert: { type: Function as PropType<OfdConverter> },
		preview: {
			type: Function as PropType<
				(source: Blob, options: ConvertOptions) => Promise<OfdDocument>
			>,
		},
	},
	emits: ["loaded", "error", "exported"],
	setup(props, { emit, expose }) {
		const model = shallowRef<OfdDocument>(),
			original = shallowRef<Blob>(),
			error = ref(""),
			busy = ref(false),
			page = ref(0),
			zoom = ref(100),
			query = ref(""),
			target = ref<ConversionFormat>("pdf"),
			loading = ref(false);
		let generation = 0,
			controller: AbortController | undefined;
		const current = computed(() => model.value?.pages[page.value]);
		const matches = computed(() => {
			const needle = query.value.toLocaleLowerCase();
			return needle
				? (model.value?.pages.flatMap((p, i) =>
						p.text.toLocaleLowerCase().includes(needle) ? [i] : [],
					) ?? [])
				: [];
		});
		watch(
			() => props.source,
			async (source) => {
				const id = ++generation;
				controller?.abort();
				controller = new AbortController();
				error.value = "";
				model.value = undefined;
				loading.value = true;
				page.value = 0;
				try {
					const bytes = await artifactSourceToUint8Array(source);
					const document = props.preview
						? await props.preview(new Blob([bytes.slice().buffer as ArrayBuffer]), {
								signal: controller.signal,
							})
						: await readOfdDocument(bytes, { signal: controller.signal });
					if (id !== generation) return;
					original.value = new Blob([bytes.slice().buffer as ArrayBuffer], {
						type: OFD_MIME_TYPES[document.format],
					});
					model.value = document;
					emit("loaded", {
						pageCount: document.pages.length,
						format: document.format,
						diagnostics: document.diagnostics,
					});
				} catch (reason) {
					if (id !== generation) return;
					error.value = reason instanceof Error ? reason.message : String(reason);
					emit("error", reason);
				} finally {
					if (id === generation) loading.value = false;
				}
			},
			{ immediate: true },
		);
		onBeforeUnmount(() => {
			generation++;
			controller?.abort();
		});
		const available = computed(() => {
			const format = model.value?.format;
			if (!format) return [];
			return (conversionTargets[format] ?? []).filter(
				(to) =>
					props.convert ||
					(!["xlsx", "pptx"].includes(to) && !(to === "docx" && format !== "ofd")),
			);
		});
		watch(available, (formats) => {
			if (formats.length && !formats.includes(target.value)) target.value = formats[0];
		});
		async function exportFiles() {
			if (!model.value || !original.value || busy.value) return;
			busy.value = true;
			error.value = "";
			try {
				const options = { fileName: props.fileName, signal: controller?.signal };
				const result = props.convert
					? await props.convert(original.value, model.value.format, target.value, options)
					: await exportDocument(model.value, target.value, options);
				for (const file of result.files) {
					const url = URL.createObjectURL(file.blob),
						a = document.createElement("a");
					a.href = url;
					a.download = file.name;
					a.click();
					setTimeout(() => URL.revokeObjectURL(url), 1000);
				}
				emit("exported", result);
			} catch (reason) {
				error.value = reason instanceof Error ? reason.message : String(reason);
				emit("error", reason);
			} finally {
				busy.value = false;
			}
		}
		function findNext() {
			const next = matches.value.find((i) => i > page.value) ?? matches.value[0];
			if (next !== undefined) page.value = next;
		}
		expose({
			getPageCount: () => model.value?.pages.length ?? 0,
			goToPage: (index: number) => {
				if (
					model.value &&
					Number.isInteger(index) &&
					index >= 0 &&
					index < model.value.pages.length
				)
					page.value = index;
			},
			getDocument: () => model.value,
			exportFile: async (format?: ConversionFormat) => {
				if (!original.value || !model.value) throw new Error("Document is not loaded.");
				if (!format || format === model.value.format) return original.value;
				const result = await exportDocument(model.value, format, {
					fileName: props.fileName,
				});
				if (result.files.length !== 1)
					throw new Error("Use exportDocument for multi-file export.");
				return result.files[0].blob;
			},
		});
		const control = {
			border: "1px solid #cbd5e1",
			borderRadius: "6px",
			padding: "6px 9px",
			background: "white",
			color: "#172033",
		};
		const button = (label: string, action: () => void, disabled = false) =>
			h("button", { type: "button", style: control, onClick: action, disabled }, label);
		return () =>
			h(
				"section",
				{
					class: "als-ofs-ofd",
					style: {
						display: "flex",
						flexDirection: "column",
						height: "100%",
						minHeight: "360px",
						fontFamily: "system-ui,sans-serif",
						background: "#e8edf3",
						color: "#172033",
					},
					"aria-label": "OfdDocument viewer",
				},
				[
					h(
						"div",
						{
							role: "toolbar",
							"aria-label": "Document controls",
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: "8px",
								alignItems: "center",
								padding: "10px",
								background: "#f8fafc",
								borderBottom: "1px solid #cbd5e1",
							},
						},
						[
							button("Previous", () => page.value--, page.value <= 0),
							h(
								"select",
								{
									style: { ...control, maxWidth: "230px" },
									"aria-label": "Page or sheet",
									value: page.value,
									onChange: (ev: Event) =>
										(page.value = Number(
											(ev.target as HTMLSelectElement).value,
										)),
								},
								model.value?.pages.map((p, i) => h("option", { value: i }, p.name)),
							),
							button(
								"Next",
								() => page.value++,
								!model.value || page.value >= model.value.pages.length - 1,
							),
							h(
								"select",
								{
									style: control,
									"aria-label": "Zoom",
									value: zoom.value,
									onChange: (ev: Event) =>
										(zoom.value = Number(
											(ev.target as HTMLSelectElement).value,
										)),
								},
								[50, 75, 100, 125, 150, 200].map((n) =>
									h("option", { value: n }, `${n}%`),
								),
							),
							h("input", {
								style: control,
								type: "search",
								placeholder: "Find text",
								"aria-label": "Find text",
								value: query.value,
								onInput: (ev: Event) =>
									(query.value = (ev.target as HTMLInputElement).value),
								onKeydown: (ev: KeyboardEvent) => {
									if (ev.key === "Enter") findNext();
								},
							}),
							button(
								`Find next${query.value ? ` (${matches.value.length} pages)` : ""}`,
								findNext,
								!matches.value.length,
							),
							h(
								"select",
								{
									style: control,
									"aria-label": "Export format",
									value: target.value,
									onChange: (ev: Event) =>
										(target.value = (ev.target as HTMLSelectElement)
											.value as ConversionFormat),
								},
								available.value.map((format) =>
									h("option", { value: format }, format.toUpperCase()),
								),
							),
							button(
								busy.value ? "Exporting…" : "Export",
								() => {
									void exportFiles();
								},
								busy.value || !model.value,
							),
						],
					),
					error.value
						? h(
								"p",
								{ role: "alert", style: { padding: "12px", color: "#a12222" } },
								error.value,
							)
						: null,
					loading.value
						? h(
								"p",
								{ role: "status", style: { padding: "16px" } },
								"Loading document…",
							)
						: null,
					model.value?.diagnostics.length
						? h("details", { style: { padding: "6px 12px", background: "#fff8e8" } }, [
								h(
									"summary",
									`${model.value.diagnostics.length} compatibility notes`,
								),
								h(
									"ul",
									[...new Set(model.value.diagnostics.map((d) => d.message))].map(
										(message) => h("li", message),
									),
								),
							])
						: null,
					h(
						"div",
						{ style: { overflow: "auto", flex: "1", padding: "20px" } },
						current.value
							? h("iframe", {
									title: `${props.fileName} — ${current.value.name}`,
									sandbox: "",
									srcdoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>html,body{margin:0}svg{display:block;width:100%;height:auto}</style></head><body>${current.value.svg}</body></html>`,
									style: {
										display: "block",
										width: `${(current.value.width * zoom.value) / 100}px`,
										height: `${(current.value.height * zoom.value) / 100}px`,
										border: 0,
										background: "white",
										margin: "0 auto",
										boxShadow: "0 2px 12px #14253b25",
									},
								})
							: [],
					),
				],
			);
	},
});
