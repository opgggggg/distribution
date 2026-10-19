import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { icon } from "./icons.js";
import {
	IPAD_GRID_COLORS,
	loadColorSamples,
	loadColorMode,
	saveColorMode,
	normalizeHex,
	rgb,
	rgbHex,
	saveColorSamples,
	spectrumBackground,
	spectrumColor,
	spectrumPosition,
} from "./color-picker-model.js";
/** Native iPad palette layout for hosts that cannot present UIColorPickerViewController. */
export const NoteColorPicker = defineComponent({
	name: "NoteColorPicker",
	props: {
		value: { type: String, required: true },
		opacity: { type: Number, default: 1 },
		titleId: { type: String, default: "" },
		locale: { type: String, default: "zh-CN" },
	},
	emits: ["change", "opacity", "layout", "close", "sample"],
	setup(props, { emit, slots }) {
		const scope = useId(),
			color = ref(props.value),
			alpha = ref(props.opacity),
			mode = ref(loadColorMode()),
			hex = ref(props.value.slice(1).toUpperCase());
		const pin = ref(spectrumPosition(props.value)),
			gridIndex = ref(Math.max(0, IPAD_GRID_COLORS.indexOf(props.value.toLowerCase()))),
			samples = ref(loadColorSamples()),
			samplePage = ref(0),
			removeSample = ref<number>();
		let pointer: number | undefined, capture: HTMLElement | undefined;
		const t = (zh: string, en: string) => (props.locale.startsWith("zh") ? zh : en);
		const commit = (opacity?: number) => {
			emit("change", color.value, typeof opacity === "number" ? opacity : undefined);
		};
		function choose(value: string, opacity?: number) {
			color.value = value;
			hex.value = value.slice(1).toUpperCase();
			pin.value = spectrumPosition(value);
			const index = IPAD_GRID_COLORS.indexOf(value);
			if (index >= 0) gridIndex.value = index;
			if (opacity !== undefined) {
				alpha.value = opacity;
			}
			commit(opacity);
		}
		watch(
			() => props.value,
			(value) => {
				color.value = value;
				hex.value = value.slice(1).toUpperCase();
				pin.value = spectrumPosition(value);
			},
		);
		watch(
			() => props.opacity,
			(value) => (alpha.value = value),
		);
		watch(mode, async () => {
			saveColorMode(mode.value);
			await nextTick();
			emit("layout");
		});
		function cancel() {
			const id = pointer;
			pointer = undefined;
			if (id !== undefined && capture?.hasPointerCapture(id))
				capture.releasePointerCapture(id);
			capture = undefined;
			color.value = props.value;
			hex.value = props.value.slice(1).toUpperCase();
			pin.value = spectrumPosition(props.value);
		}
		onMounted(() => window.addEventListener("blur", cancel));
		onBeforeUnmount(() => {
			window.removeEventListener("blur", cancel);
			const id = pointer;
			pointer = undefined;
			if (id !== undefined && capture?.hasPointerCapture(id))
				capture.releasePointerCapture(id);
		});
		function sample(e: PointerEvent, grid: boolean) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(),
				x = Math.max(0, Math.min(0.999999, (e.clientX - rect.left) / rect.width)),
				y = Math.max(0, Math.min(0.999999, (e.clientY - rect.top) / rect.height));
			if (grid) {
				const index = Math.floor(y * 10) * 12 + Math.floor(x * 12);
				gridIndex.value = index;
				color.value = IPAD_GRID_COLORS[index];
				pin.value = spectrumPosition(color.value);
			} else {
				pin.value = { x, y };
				color.value = spectrumColor(x, y);
			}
			hex.value = color.value.slice(1).toUpperCase();
		}
		const contact = (grid: boolean) => ({
			onPointerdown: (e: PointerEvent) => {
				if (e.pointerType === "mouse" && e.button !== 0) return;
				e.preventDefault();
				pointer = e.pointerId;
				capture = e.currentTarget as HTMLElement;
				capture.setPointerCapture(pointer);
				sample(e, grid);
			},
			onPointermove: (e: PointerEvent) => {
				if (pointer === e.pointerId) sample(e, grid);
			},
			onPointerup: (e: PointerEvent) => {
				if (pointer === e.pointerId) {
					sample(e, grid);
					pointer = undefined;
					capture?.releasePointerCapture(e.pointerId);
					capture = undefined;
					commit();
				}
			},
			onPointercancel: cancel,
			onLostpointercapture: () => {
				if (pointer !== undefined) cancel();
			},
		});
		function channel(index: number, value: number) {
			const values = rgb(color.value);
			values[index] = value;
			color.value = rgbHex(values);
			hex.value = color.value.slice(1).toUpperCase();
			pin.value = spectrumPosition(color.value);
		}
		const numberInput = (
			label: string,
			value: number,
			max: number,
			change: (v: number) => void,
			percent = false,
		) =>
			h("input", {
				class: "cube-notes__color-number",
				type: percent ? "text" : "number",
				inputmode: "numeric",
				min: 0,
				max,
				step: 1,
				value: percent ? `${value}%` : value,
				"aria-label": label,
				onChange: (e: Event) => {
					const input = e.currentTarget as HTMLInputElement,
						raw = input.value.replace(/%$/, "").trim(),
						n = raw ? Number(raw) : NaN;
					if (Number.isFinite(n)) change(Math.round(Math.max(0, Math.min(max, n))));
					else input.value = percent ? `${value}%` : String(value);
				},
				onKeydown: (e: KeyboardEvent) => {
					if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
				},
			});
		const slider = (
			label: string,
			value: number,
			max: number,
			background: string,
			change: (v: number) => void,
			done: () => void,
			percent = false,
		) =>
			h("label", { class: "cube-notes__color-slider" }, [
				h("span", label),
				h("div", { class: "cube-notes__color-slider-row" }, [
					h(
						"span",
						{
							class: ["cube-notes__color-track", percent && "is-alpha"],
							style: { "--color-track": background, "--color-ratio": value / max },
						},
						[
							h("input", {
								type: "range",
								min: 0,
								max,
								step: 1,
								value,
								"aria-label": label,
								onInput: (e: Event) =>
									change(Number((e.currentTarget as HTMLInputElement).value)),
								onChange: done,
							}),
							h("i", {
								class: "cube-notes__color-thumb",
								style: { background: color.value },
								"aria-hidden": "true",
							}),
						],
					),
					numberInput(
						`${label}${t("数值", " value")}`,
						value,
						max,
						(v) => {
							change(v);
							done();
						},
						percent,
					),
				]),
			]);
		function saveSample() {
			const index = samples.value.findIndex(
				(s) => s.color === color.value && Math.abs(s.opacity - alpha.value) < 0.005,
			);
			if (index >= 0) {
				samplePage.value = Math.floor(index / 7);
				return;
			}
			samples.value = [...samples.value, { color: color.value, opacity: alpha.value }].slice(
				-32,
			);
			samplePage.value = Math.floor((samples.value.length - 1) / 7);
			saveColorSamples(samples.value);
		}
		const tabs = [
			["grid", "网格", "Grid"],
			["spectrum", "光谱", "Spectrum"],
			["sliders", "滑块", "Sliders"],
		];
		return () =>
			h(
				"div",
				{
					class: ["cube-notes__color-picker", mode.value === "sliders" && "is-sliders"],
					role: "group",
					"aria-label": t("颜色", "Colors"),
				},
				[
					h("header", { class: "cube-notes__color-header" }, [
						h(
							"button",
							{
								type: "button",
								class: "cube-notes__color-eyedropper",
								"aria-label": t("吸管取色", "Eyedropper"),
								title: t("吸管取色", "Eyedropper"),
								onClick: () => emit("sample"),
							},
							icon("eyedropper"),
						),
						h(
							"h2",
							{ id: props.titleId || `${scope}-color-title` },
							t("颜色", "Colors"),
						),
						h(
							"button",
							{
								type: "button",
								class: "cube-notes__color-close",
								"aria-label": t("关闭选色板", "Close colors"),
								onClick: () => emit("close"),
							},
							icon("close"),
						),
					]),
					slots.quickColors?.(),
					h(
						"div",
						{
							class: "cube-notes__color-tabs",
							role: "tablist",
							"aria-label": t("选色方式", "Color mode"),
						},
						tabs.map(([id, zh, en], index) =>
							h(
								"button",
								{
									key: id,
									type: "button",
									role: "tab",
									id: `${scope}-color-${id}`,
									"aria-controls": `${scope}-color-panel`,
									"aria-selected": mode.value === id,
									tabindex: mode.value === id ? 0 : -1,
									onClick: () => (mode.value = id),
									onKeydown: (e: KeyboardEvent) => {
										if (
											!["ArrowLeft", "ArrowRight", "Home", "End"].includes(
												e.key,
											)
										)
											return;
										e.preventDefault();
										const next =
											e.key === "Home"
												? 0
												: e.key === "End"
													? 2
													: (index + (e.key === "ArrowRight" ? 1 : 2)) %
														3;
										mode.value = tabs[next][0];
										(e.currentTarget as HTMLElement).parentElement
											?.querySelectorAll<HTMLButtonElement>("button")
											[next].focus();
									},
								},
								t(zh, en),
							),
						),
					),
					h(
						"div",
						{
							id: `${scope}-color-panel`,
							role: "tabpanel",
							"aria-labelledby": `${scope}-color-${mode.value}`,
							class: "cube-notes__color-panel",
						},
						[
							mode.value === "grid"
								? h(
										"div",
										{
											class: "cube-notes__color-grid",
											role: "group",
											"aria-label": t("120 色网格", "120 color grid"),
											...contact(true),
										},
										IPAD_GRID_COLORS.map((value, index) =>
											h("button", {
												key: value,
												type: "button",
												style: { background: value },
												"aria-label": `${t("颜色", "Color")} ${value}`,
												"aria-pressed": color.value === value,
												tabindex: gridIndex.value === index ? 0 : -1,
												onClick: (e: MouseEvent) => {
													if (e.detail === 0) choose(value);
												},
												onKeydown: (e: KeyboardEvent) => {
													const delta: Record<string, number> = {
														ArrowLeft: -1,
														ArrowRight: 1,
														ArrowUp: -12,
														ArrowDown: 12,
													};
													if (
														!(e.key in delta) &&
														!["Home", "End"].includes(e.key)
													)
														return;
													e.preventDefault();
													const next =
														e.key === "Home"
															? 0
															: e.key === "End"
																? 119
																: Math.max(
																		0,
																		Math.min(
																			119,
																			index + delta[e.key],
																		),
																	);
													choose(IPAD_GRID_COLORS[next]);
													gridIndex.value = next;
													(e.currentTarget as HTMLElement).parentElement
														?.querySelectorAll<HTMLButtonElement>(
															"button",
														)
														[next].focus();
												},
											}),
										),
									)
								: mode.value === "spectrum"
									? h(
											"div",
											{
												class: "cube-notes__color-field",
												role: "slider",
												tabindex: 0,
												"aria-label": t("光谱选色", "Spectrum color"),
												"aria-valuemin": 0,
												"aria-valuemax": 100,
												"aria-valuenow": Math.round(pin.value.x * 100),
												"aria-valuetext": color.value,
												style: { background: spectrumBackground },
												...contact(false),
												onKeydown: (e: KeyboardEvent) => {
													const deltas: Record<string, [number, number]> =
														{
															ArrowLeft: [-0.01, 0],
															ArrowRight: [0.01, 0],
															ArrowUp: [0, -0.01],
															ArrowDown: [0, 0.01],
														};
													if (!deltas[e.key]) return;
													e.preventDefault();
													const [dx, dy] = deltas[e.key];
													pin.value = {
														x: Math.max(
															0,
															Math.min(1, pin.value.x + dx),
														),
														y: Math.max(
															0,
															Math.min(1, pin.value.y + dy),
														),
													};
													color.value = spectrumColor(
														pin.value.x,
														pin.value.y,
													);
													hex.value = color.value.slice(1).toUpperCase();
													commit();
												},
											},
											[
												h("span", {
													class: "cube-notes__color-pin",
													style: {
														left: `${pin.value.x * 100}%`,
														top: `${pin.value.y * 100}%`,
														background: color.value,
													},
												}),
											],
										)
									: h("div", { class: "cube-notes__color-rgb" }, [
											...rgb(color.value).map((value, index) => {
												const colors = rgb(color.value),
													a = [...colors],
													b = [...colors];
												a[index] = 0;
												b[index] = 255;
												const background = `linear-gradient(to right,${rgbHex(a)},${rgbHex(b)})`;
												return slider(
													t(
														["红色", "绿色", "蓝色"][index],
														["RED", "GREEN", "BLUE"][index],
													),
													value,
													255,
													background,
													(v) => channel(index, v),
													commit,
												);
											}),
											h("label", { class: "cube-notes__color-hex" }, [
												h("span", "sRGB Hex Color #"),
												h("input", {
													type: "text",
													value: hex.value,
													maxlength: 7,
													spellcheck: false,
													autocomplete: "off",
													"aria-label": t("颜色十六进制值", "Hex color"),
													onInput: (e: Event) => {
														hex.value = (
															e.currentTarget as HTMLInputElement
														).value;
														if (
															/^#?[\da-f]{6}$/i.test(hex.value.trim())
														)
															choose(normalizeHex(hex.value)!);
													},
													onChange: (e: Event) => {
														const input =
																e.currentTarget as HTMLInputElement,
															value = normalizeHex(input.value);
														if (value) choose(value);
														else {
															input.setCustomValidity(
																t(
																	"请输入 3 或 6 位十六进制颜色",
																	"Enter a 3 or 6 digit hex color",
																),
															);

															input.value = color.value
																.slice(1)
																.toUpperCase();
															input.setCustomValidity("");
														}
													},
													onKeydown: (e: KeyboardEvent) => {
														if (e.key === "Enter")
															(
																e.currentTarget as HTMLInputElement
															).blur();
													},
												}),
											]),
										]),
						],
					),
					slider(
						t("不透明度", "OPACITY"),
						Math.round(alpha.value * 100),
						100,
						`linear-gradient(to right,transparent,${color.value})`,
						(v) => (alpha.value = v / 100),
						() => emit("opacity", alpha.value),
						true,
					),
					h("div", { class: "cube-notes__color-samples" }, [
						h(
							"div",
							{
								class: "cube-notes__color-sample",
								style: {
									"--sample-color": color.value,
									"--sample-opacity": alpha.value,
								},
								"aria-label": t("当前颜色", "Current color"),
							},
							h("span"),
						),
						h("div", { class: "cube-notes__color-favorites" }, [
							h("div", { class: "cube-notes__color-favorites-grid" }, [
								...samples.value
									.slice(samplePage.value * 7, samplePage.value * 7 + 7)
									.map((s, index) =>
										h(
											"button",
											{
												type: "button",
												class: "cube-notes__color-favorite",
												"aria-label": `${t("色样", "Swatch")} ${s.color} ${Math.round(s.opacity * 100)}%`,
												"aria-pressed":
													s.color === color.value &&
													Math.abs(s.opacity - alpha.value) < 0.005,
												onClick: () => choose(s.color, s.opacity),
												onContextmenu: (e: Event) => {
													e.preventDefault();
													removeSample.value =
														samplePage.value * 7 + index;
												},
												onKeydown: (e: KeyboardEvent) => {
													if (
														e.key === "Delete" ||
														e.key === "Backspace"
													) {
														e.preventDefault();
														removeSample.value =
															samplePage.value * 7 + index;
													}
												},
											},
											h(
												"span",
												{
													style: {
														"--sample-color": s.color,
														"--sample-opacity": s.opacity,
													},
												},
												h("i"),
											),
										),
									),
								h(
									"button",
									{
										type: "button",
										class: "cube-notes__color-add",
										"aria-label": t("添加色样", "Add swatch"),
										onClick: saveSample,
									},
									icon("plus"),
								),
							]),
							samples.value.length > 7
								? h(
										"div",
										{ class: "cube-notes__color-sample-pages" },
										Array.from(
											{ length: Math.ceil(samples.value.length / 7) },
											(_, index) =>
												h(
													"button",
													{
														type: "button",
														"aria-label": `${t("色样页", "Swatch page")} ${index + 1}`,
														"aria-pressed": samplePage.value === index,
														onClick: () => (samplePage.value = index),
													},
													h("i"),
												),
										),
									)
								: null,
						]),
						removeSample.value !== undefined
							? h(
									"button",
									{
										class: "cube-notes__color-remove",
										type: "button",
										onClick: () => {
											samples.value = samples.value.filter(
												(_, i) => i !== removeSample.value,
											);
											removeSample.value = undefined;
											samplePage.value = Math.min(
												samplePage.value,
												Math.max(
													0,
													Math.ceil(samples.value.length / 7) - 1,
												),
											);
											saveColorSamples(samples.value);
										},
									},
									t("删除色样", "Delete swatch"),
								)
							: null,
					]),
				],
			);
	},
});
