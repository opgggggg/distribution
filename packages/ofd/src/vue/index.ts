import { svgAtDeviceScale } from "../strokes.js";
import { assertOfdPermission } from "../policy.js";
import {
	executeOfdActions,
	readDestination,
	type OfdActionHost,
	type OfdDestination,
} from "../actions.js";
import { openOfdPackage, type OfdAction, type OfdOutline, type OfdXmlNode } from "../package.js";
import {
	defineComponent,
	ref,
	shallowRef,
	computed,
	watch,
	onBeforeUnmount,
	nextTick,
	h,
	type PropType,
} from "vue";
import { readSource, type OfdSource as ArtifactSource } from "../source.js";
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
		respectPermissions: { type: Boolean, default: true },
		convert: { type: Function as PropType<OfdConverter> },
		actionHost: { type: Object as PropType<OfdActionHost> },
		allowAutomaticExternalActions: { type: Boolean, default: false },
		preview: {
			type: Function as PropType<
				(source: Blob, options: ConvertOptions) => Promise<OfdDocument>
			>,
		},
	},
	emits: ["loaded", "error", "exported", "action", "preferences", "permissions"],
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
		const viewport = ref<HTMLElement>(),
			surface = ref<HTMLElement>(),
			mediaElement = ref<HTMLMediaElement>();
		const activeMedia = ref<{
			id: string;
			url: string;
			kind: "audio" | "video";
			repeat: boolean;
			volume: number;
		}>();
		let actionCount = 0;
		function clearMedia() {
			mediaElement.value?.pause();
			if (activeMedia.value) URL.revokeObjectURL(activeMedia.value.url);
			activeMedia.value = undefined;
		}
		const current = computed(() => model.value?.pages[page.value]);
		const displayedSvg = computed(() =>
			current.value ? svgAtDeviceScale(current.value.svg, zoom.value / 100) : "",
		);
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
				actionCount = 0;
				clearMedia();
				controller?.abort();
				const activeController = new AbortController();
				controller = activeController;
				error.value = "";
				model.value = undefined;
				original.value = undefined;
				loading.value = true;
				page.value = 0;
				try {
					const bytes = await readSource(source, { signal: activeController.signal });
					if (id !== generation) return;
					const document = props.preview
						? await props.preview(new Blob([bytes.slice().buffer as ArrayBuffer]), {
								signal: activeController.signal,
							})
						: await readOfdDocument(bytes, { signal: activeController.signal });
					if (id !== generation) return;
					original.value = new Blob([bytes.slice().buffer as ArrayBuffer], {
						type: OFD_MIME_TYPES[document.format],
					});
					if (props.respectPermissions)
						for (const metadata of document.documents ?? [])
							assertOfdPermission(metadata.policy, "read");
					model.value = document;
					const preferences =
						document.documents?.[document.pages[0]?.documentIndex ?? 0]?.view;
					if (preferences?.zoom && Number.isFinite(preferences.zoom))
						zoom.value = preferences.zoom * 100;
					emit("preferences", preferences);
					emit(
						"permissions",
						document.documents?.map((doc) => doc.policy),
					);
					document.documents?.forEach((doc, index) => {
						if (document.pages.some((page) => (page.documentIndex ?? 0) === index))
							void dispatch(
								doc.actions.filter((a) => a.event === "DO"),
								false,
								index,
							);
					});
					void dispatch(
						document.pages[0]?.actions?.filter((a) => a.event === "PO") ?? [],
						false,
					);
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
			clearMedia();
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
			const id = generation;
			error.value = "";
			try {
				if (props.respectPermissions)
					for (const document of model.value.documents ?? [])
						assertOfdPermission(document.policy, "export");
				const options = { fileName: props.fileName, signal: controller?.signal };
				const result = props.convert
					? await props.convert(original.value, model.value.format, target.value, options)
					: await exportDocument(model.value, target.value, options);
				if (id !== generation || controller?.signal.aborted) return;
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
				if (id !== generation) return;
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
		const outlineOptions = computed(() => {
			const items: { label: string; actions: OfdAction[]; documentIndex: number }[] = [];
			function add(nodes: OfdOutline[], documentIndex: number, depth = 0) {
				for (const node of nodes) {
					items.push({
						label: "　".repeat(depth) + node.title,
						actions: node.actions,
						documentIndex,
					});
					add(node.children, documentIndex, depth + 1);
				}
			}
			model.value?.documents?.forEach((document, index) => add(document.outlineItems, index));
			return items;
		});
		async function goTo(
			destination: OfdDestination,
			documentIndex = current.value?.documentIndex ?? 0,
		) {
			const index =
				model.value?.pages.findIndex(
					(p) => p.id === destination.pageId && (p.documentIndex ?? 0) === documentIndex,
				) ?? -1;
			if (index < 0) throw new Error("Unknown destination page.");
			page.value = index;
			const target = model.value!.pages[index],
				width = (viewport.value?.clientWidth ?? target.width) - 40,
				height = (viewport.value?.clientHeight ?? target.height) - 40;
			if (destination.type === "Fit")
				zoom.value = Math.min(width / target.width, height / target.height) * 100;
			else if (destination.type === "FitH") zoom.value = (width / target.width) * 100;
			else if (destination.type === "FitV") zoom.value = (height / target.height) * 100;
			else if (destination.type === "FitR") {
				const w = (destination.right ?? destination.left) - destination.left,
					h = (destination.bottom ?? destination.top) - destination.top;
				if (w <= 0 || h <= 0) throw new Error("Invalid FitR destination rectangle.");
				zoom.value = Math.min(width / ((w * 96) / 25.4), height / ((h * 96) / 25.4)) * 100;
			} else if (destination.zoom) zoom.value = destination.zoom * 100;
			await nextTick();
			viewport.value?.scrollTo?.({
				left:
					(((destination.left * 96) / 25.4) * zoom.value) / 100 +
					(surface.value?.offsetLeft ?? 0) -
					(viewport.value?.offsetLeft ?? 0),
				top: (((destination.top * 96) / 25.4) * zoom.value) / 100,
			});
		}
		async function sourcePackage() {
			if (!original.value) throw new Error("Document is not loaded.");
			return openOfdPackage(original.value, { signal: controller?.signal });
		}
		async function openAttachment(id: string) {
			const pkg = await sourcePackage(),
				file = pkg.documents
					.flatMap((doc) => doc.attachments)
					.find((file) => file.id === id);
			if (!file) throw new Error("Unknown OFD attachment.");
			const url = URL.createObjectURL(new Blob([pkg.read(file.path).buffer as ArrayBuffer])),
				a = document.createElement("a");
			a.href = url;
			a.download = file.name.split(/[\\/]/).at(-1) || "attachment";
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		}
		async function startMedia(
			id: string,
			kind: "audio" | "video",
			repeat = false,
			volume = 100,
		) {
			const pkg = await sourcePackage(),
				media = pkg.media(id, { pageId: current.value?.id });
			clearMedia();
			activeMedia.value = { id, kind, repeat, volume, url: URL.createObjectURL(media.blob) };
			await nextTick();
			const element = mediaElement.value;
			if (!element) throw new Error("Media playback is unavailable.");
			element.volume = volume / 100;
			await element.play();
			return element;
		}
		async function dispatch(
			actions: OfdAction[],
			userGesture = true,
			documentIndex = current.value?.documentIndex ?? 0,
		) {
			const generationAtStart = generation;
			emit("action", actions, { documentIndex });
			try {
				actionCount += actions.length;
				if (actionCount > 10000)
					throw new Error("Document action execution budget exceeded.");
				const selected =
					props.allowAutomaticExternalActions || userGesture
						? actions
						: actions.filter((a) => a.type === "Goto");
				await executeOfdActions(
					selected,
					{
						goTo: (destination) => goTo(destination, documentIndex),
						resolveBookmark: (name) => {
							for (const bookmark of model.value?.documents?.[documentIndex]
								?.bookmarks ?? [])
								if (bookmark.attributes.Name === name) {
									const dest = bookmark.children.find(
										(n): n is OfdXmlNode =>
											typeof n !== "string" &&
											n.name.split(":").at(-1) === "Dest",
									);
									if (dest) return readDestination(dest);
								}
							return undefined;
						},
						openAttachment,
						openUri: (uri) => {
							if (!/^(https?:|mailto:|tel:)/i.test(uri))
								throw new Error("This browser cannot open this link type.");
							window.open(uri, "_blank", "noopener,noreferrer");
						},
						playSound: async (id, options) => {
							const element = await startMedia(
								id,
								"audio",
								options.repeat,
								options.volume,
							);
							if (options.synchronous)
								await new Promise<void>((resolve, reject) => {
									const signal = controller?.signal;
									const cleanup = () => {
										element.removeEventListener("ended", done);
										element.removeEventListener("error", failed);
										signal?.removeEventListener("abort", cancel);
									};
									const done = () => {
										cleanup();
										resolve();
									};
									const failed = () => {
										cleanup();
										reject(new Error("Audio playback failed."));
									};
									const cancel = () => {
										cleanup();
										reject(
											new DOMException("Playback cancelled.", "AbortError"),
										);
									};
									element.addEventListener("ended", done, { once: true });
									element.addEventListener("error", failed, { once: true });
									signal?.addEventListener("abort", cancel, { once: true });
									if (signal?.aborted) cancel();
								});
						},
						playMovie: async (id, operator) => {
							if (operator === "Play") {
								await startMedia(id, "video");
								return;
							}
							if (activeMedia.value?.id !== id) return;
							const element = mediaElement.value;
							if (!element) return;
							if (operator === "Resume") await element.play();
							else {
								element.pause();
								if (operator === "Stop") element.currentTime = 0;
							}
						},
						...props.actionHost,
					},
					controller?.signal,
				);
			} catch (reason) {
				if (generationAtStart !== generation) return;
				error.value = reason instanceof Error ? reason.message : String(reason);
				emit("error", reason);
			}
		}
		watch(page, async (next, previous) => {
			const old = model.value?.pages[previous],
				current = model.value?.pages[next];
			if (old)
				await dispatch(
					(old.actions ?? []).filter((a) => a.event === "PC"),
					false,
					old.documentIndex,
				);
			if (current)
				await dispatch(
					(current.actions ?? []).filter((a) => a.event === "PO"),
					false,
					current.documentIndex,
				);
		});

		expose({
			getPageCount: () => model.value?.pages.length ?? 0,
			getCurrentPage: () => page.value,
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
			executeActions: dispatch,
			getAttachments: () => model.value?.documents?.flatMap((doc) => doc.attachments) ?? [],
			readAttachment: async (id: string, documentIndex = 0) => {
				if (!original.value) throw new Error("Document is not loaded.");
				return (await openOfdPackage(original.value)).attachment(id, documentIndex);
			},
			exportFile: async (format?: ConversionFormat, options: ConvertOptions = {}) => {
				if (!original.value || !model.value) throw new Error("Document is not loaded.");
				if (props.respectPermissions)
					for (const document of model.value.documents ?? [])
						assertOfdPermission(document.policy, "export");
				if (!format || format === model.value.format) return original.value;
				const settings = {
					fileName: props.fileName,
					signal: controller?.signal,
					...options,
				};
				const id = generation;
				const result = props.convert
					? await props.convert(original.value, model.value.format, format, settings)
					: await exportDocument(model.value, format, settings);
				if (id !== generation)
					throw new DOMException("Document changed during export.", "AbortError");
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
								display: model.value?.documents?.[current.value?.documentIndex ?? 0]
									?.view.hideToolbar
									? "none"
									: "flex",
								flexWrap: "wrap",
								gap: "8px",
								alignItems: "center",
								padding: "10px",
								background: "#f8fafc",
								borderBottom: "1px solid #cbd5e1",
							},
						},
						[
							outlineOptions.value.length
								? h(
										"select",
										{
											style: control,
											"aria-label": "Document outline",
											value: "",
											onChange: (event: Event) => {
												const index = Number(
													(event.target as HTMLSelectElement).value,
												);
												void dispatch(
													outlineOptions.value[index].actions,
													true,
													outlineOptions.value[index].documentIndex,
												);
											},
										},
										[
											h("option", { value: "", disabled: true }, "Outline"),
											...outlineOptions.value.map((entry, index) =>
												h("option", { value: index }, entry.label),
											),
										],
									)
								: null,
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
								[...new Set([50, 75, 100, 125, 150, 200, zoom.value])]
									.sort((a, b) => a - b)
									.map((n) =>
										h("option", { value: n }, `${Math.round(n * 10) / 10}%`),
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
					activeMedia.value
						? h("div", { style: { padding: "12px", background: "white" } }, [
								h(activeMedia.value.kind, {
									ref: mediaElement,
									src: activeMedia.value.url,
									controls: true,
									loop: activeMedia.value.repeat,
									style: { maxWidth: "100%", maxHeight: "320px" },
									onError: () => {
										error.value =
											"This browser cannot play the document’s media format.";
									},
								}),
								button("Close media", clearMedia),
							])
						: null,
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
						{ ref: viewport, style: { overflow: "auto", flex: "1", padding: "20px" } },
						current.value
							? h(
									"div",
									{
										ref: surface,
										style: {
											position: "relative",
											width: `${(current.value.width * zoom.value) / 100}px`,
											height: `${(current.value.height * zoom.value) / 100}px`,
											margin: "0 auto",
										},
									},
									[
										h("iframe", {
											title: `${props.fileName} — ${current.value.name}`,
											sandbox: "",
											srcdoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>html,body{margin:0}svg{display:block;width:100%;height:auto}</style></head><body>${displayedSvg.value}</body></html>`,
											style: {
												display: "block",
												width: `${(current.value.width * zoom.value) / 100}px`,
												height: `${(current.value.height * zoom.value) / 100}px`,
												border: 0,
												background: "white",
												margin: "0 auto",
												boxShadow: "0 2px 12px #14253b25",
											},
										}),
										h(
											"svg",
											{
												viewBox: `${(current.value.origin ?? [0, 0]).join(" ")} ${(current.value.width * 25.4) / 96} ${(current.value.height * 25.4) / 96}`,
												style: {
													position: "absolute",
													inset: 0,
													width: "100%",
													height: "100%",
													pointerEvents: "none",
												},
											},
											current.value.hotspots?.map((hotspot) =>
												h("path", {
													d: hotspot.region,
													transform: `matrix(${hotspot.transform.join(" ")})`,
													fill: "transparent",
													role: "button",
													tabindex: 0,
													"aria-label": `Document action ${hotspot.actions[0]?.type}`,
													style: {
														pointerEvents: "all",
														cursor: "pointer",
													},
													onClick: () => void dispatch(hotspot.actions),
													onKeydown: (event: KeyboardEvent) => {
														if (
															event.key === "Enter" ||
															event.key === " "
														) {
															event.preventDefault();
															void dispatch(hotspot.actions);
														}
													},
												}),
											),
										),
									],
								)
							: [],
					),
				],
			);
	},
});
