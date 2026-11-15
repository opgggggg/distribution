<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { OfdViewer, type OfdViewerControls } from "@cubexp/ofd/vue";
import {
	readOfdDocument,
	exportDocument,
	convertDocument,
	type OfdDocument,
	type ConversionFormat,
	type ConvertOptions,
	type OfdViewPreferences,
	type OfdActionHost,
} from "@cubexp/ofd";
import { useUiEditorI18n } from "@yaochn/als-office-editor-ui/vue/i18n";
import {
	UiEditorDock,
	UiRibbonCommandButton,
	UiRibbonField,
	UiRibbonGroup,
	UiRibbonSurface,
	UiRibbonTabs,
	useUiEditorTheme,
} from "@yaochn/als-office-editor-ui/vue";
import * as native from "./bridge";
import { acquireSession, type SessionLease } from "./session-lease";
import type { NativeSession, NativeCapabilities, VerificationReport, PrintStatus } from "./types";
import SignaturePanel from "./SignaturePanel.vue";
import TrustSettings from "./TrustSettings.vue";
const editorTheme = useUiEditorTheme();
const props = defineProps<{
	source: Blob | ArrayBuffer | Uint8Array | string;
	fileName?: string;
	artifactId?: string;
}>();
interface Viewer {
	getDocument(): OfdDocument | undefined;
	getControls(): OfdViewerControls;
	getCurrentPage(): number;
	goToPage(index: number): void;
	exportFile(format?: ConversionFormat, options?: ConvertOptions): Promise<Blob>;
}
const viewer = shallowRef<Viewer>(),
	element = ref<HTMLElement>(),
	mediaElement = ref<HTMLMediaElement>(),
	trustDialog = ref<HTMLDialogElement>(),
	printDialog = ref<HTMLDialogElement>();
const source = shallowRef<Blob>(),
	session = shallowRef<NativeSession>(),
	caps = shallowRef<NativeCapabilities>(),
	report = shallowRef<VerificationReport>(),
	printInfo = ref<PrintStatus>();
const documentIndex = ref(0),
	ready = ref(false),
	opening = ref(false),
	error = ref(""),
	verifyError = ref(""),
	notice = ref(""),
	verifying = ref(false),
	printing = ref(false),
	mediaBusy = ref(false),
	signaturesOpen = ref(false),
	copies = ref(1),
	visible = ref(false),
	clock = ref(Date.now());
const media = ref<{
	id: string;
	kind: "audio" | "video";
	url: string;
	repeat: boolean;
	volume: number;
}>();
let lease: SessionLease | undefined;
const standaloneId = crypto.randomUUID();
let generation = 0,
	loadController = new AbortController(),
	verificationController: AbortController | undefined,
	mediaController: AbortController | undefined,
	printController: AbortController | undefined,
	observer: IntersectionObserver | undefined,
	timer: ReturnType<typeof setInterval> | undefined;
let preferences: OfdViewPreferences | undefined;
const i18n = useUiEditorI18n(),
	zh = computed(() => i18n.value.locale.startsWith("zh"));
const ribbonTab = ref("home");
const ribbonCollapsed = ref(false);
const ribbonTabs = computed(() => [
	{ id: "home", label: zh.value ? "开始" : "Home" },
	{ id: "view", label: zh.value ? "视图" : "View" },
]);
const controls = computed(() => viewer.value?.getControls());
const zoomLevels = computed(() =>
	[...new Set([50, 75, 100, 125, 150, 200, controls.value?.zoom ?? 100])].sort((a, b) => a - b),
);
const host = native.nativeAvailable();
const policy = computed(() => session.value?.documents[documentIndex.value]?.policy);
const readAllowed = computed(
	() =>
		!policy.value ||
		((policy.value.validFrom === null || clock.value >= policy.value.validFrom * 1000) &&
			(policy.value.validUntil === null || clock.value <= policy.value.validUntil * 1000)),
);
const currentPageId = () => viewer.value?.getDocument()?.pages[viewer.value.getCurrentPage()]?.id;
const stale = computed(() => !!report.value && report.value.recheckAfter * 1000 <= clock.value);
const badge = computed(() => {
	if (verifying.value) return zh.value ? "正在验证…" : "Verifying…";
	if (!report.value) return zh.value ? "未验证" : "Not verified";
	if (stale.value) return zh.value ? "验证结果需刷新" : "Verification needs refreshing";
	if (!report.value.signatures.length) return zh.value ? "无数字签名" : "No digital signatures";
	if (report.value.signatures.some((s) => s.trust === "invalid"))
		return zh.value ? "签名检查未通过" : "Signature checks failed";
	if (report.value.signatures.some((s) => s.trust === "untrusted"))
		return zh.value ? "证书不受信任" : "Certificate not trusted";
	if (
		report.value.signatures.some(
			(s) =>
				s.trust !== "trusted" ||
				s.signers.some((c) => c.revocation.some((r) => r.status === "unknown")),
		)
	)
		return zh.value ? "部分信任检查未完成" : "Some trust checks incomplete";
	return zh.value ? "签名已验证" : "Signatures verified";
});
function stopMedia() {
	mediaElement.value?.pause();
	mediaController?.abort();
	media.value = undefined;
}
async function release(current: NativeSession | undefined, currentLease: SessionLease | undefined) {
	if (current) await native.windowPolicy(current.id, 0, undefined, true).catch(() => {});
	await currentLease?.release();
}
async function applyWindow() {
	const current = session.value;
	if (!host || !current || !visible.value || !ready.value) return;
	try {
		const state = await native.windowPolicy(
			current.id,
			documentIndex.value,
			preferences?.pageMode === "FullScreen" ? true : undefined,
		);
		if (state.protectedRequested && state.captureProtection !== "windowApi")
			notice.value = zh.value
				? "当前平台无法保证阻止所有截屏方式。"
				: "This platform cannot guarantee capture protection.";
	} catch (cause) {
		error.value = native.message(cause);
	}
}
watch(
	() => props.source,
	async (value) => {
		const turn = ++generation;
		loadController.abort();
		loadController = new AbortController();
		verificationController?.abort();
		printController?.abort();
		stopMedia();
		const previous = session.value,
			previousLease = lease;
		lease = undefined;
		session.value = undefined;
		source.value = undefined;
		report.value = undefined;
		ready.value = false;
		error.value = "";
		opening.value = true;
		documentIndex.value = 0;
		preferences = undefined;
		void release(previous, previousLease);
		try {
			let blob: Blob;
			if (host) {
				const opened = await acquireSession(
					value,
					props.fileName ?? "document.ofd",
					props.artifactId ?? standaloneId,
					loadController.signal,
				);
				if (turn !== generation) {
					await opened.release();
					return;
				}
				lease = opened;
				session.value = opened.info;
				blob = opened.source;
				caps.value = await native.capabilities();
				await native.authorize(opened.info, 0, "read");
			} else {
				const bytes = await native.sourceBytes(value, loadController.signal);
				blob = new Blob([bytes.slice().buffer]);
			}
			if (turn !== generation) return;
			source.value = blob;
			ready.value = true;
			await nextTick();
			void applyWindow();
			if (host) void verify();
		} catch (cause) {
			if (turn === generation) error.value = native.message(cause);
		} finally {
			if (turn === generation) opening.value = false;
		}
	},
	{ immediate: true },
);
watch(documentIndex, async () => {
	stopMedia();
	ready.value = false;
	error.value = "";
	try {
		if (session.value) await native.authorize(session.value, documentIndex.value, "read");
		ready.value = true;
		await nextTick();
		void applyWindow();
	} catch (cause) {
		error.value = native.message(cause);
	}
});
async function verify() {
	const current = session.value;
	if (!current) return;
	verificationController?.abort();
	const controller = new AbortController();
	verificationController = controller;
	verifying.value = true;
	verifyError.value = "";
	report.value = undefined;
	try {
		const result = await native.verifyDocument(current, controller.signal);
		if (current.id !== session.value?.id || result.documentHash !== current.hash) return;
		report.value = result;
	} catch (cause) {
		if (!controller.signal.aborted && current.id === session.value?.id)
			verifyError.value = native.message(cause);
	} finally {
		if (verificationController === controller) verifying.value = false;
	}
}
function trustChanged() {
	report.value = undefined;
	if (session.value) void verify();
}
async function convert(
	bytes: Blob,
	from: ConversionFormat,
	to: ConversionFormat,
	options: ConvertOptions,
) {
	const current = session.value;
	if (host) {
		if (!current) throw new Error("Document session is unavailable");
		await native.authorize(current, documentIndex.value, "export");
	}
	return convertDocument(bytes, from, to, { ...options, documentIndex: documentIndex.value });
}
async function exportFile(format?: ConversionFormat, options: ConvertOptions = {}) {
	if (!source.value) throw new Error("Document is not loaded");
	if (session.value) {
		if (!format || format === "ofd") {
			for (const doc of session.value.documents)
				await native.authorize(session.value, doc.index, "export");
		} else await native.authorize(session.value, documentIndex.value, "export");
	}
	if (!format || format === "ofd") return source.value;
	const doc = await readOfdDocument(source.value, {
		...options,
		documentIndex: documentIndex.value,
	});
	const result = await exportDocument(doc, format, options);
	if (result.files.length !== 1) throw new Error("Select one page for this export");
	return result.files[0].blob;
}
async function prepare(id: string, kind: "audio" | "video", repeat = false, volume = 100) {
	const current = session.value;
	if (!current) throw new Error("Document session is unavailable");
	stopMedia();
	const controller = new AbortController();
	mediaController = controller;
	mediaBusy.value = true;
	try {
		const result = await native.prepareMedia(
			current,
			documentIndex.value,
			currentPageId(),
			id,
			controller.signal,
		);
		if (current.id !== session.value?.id)
			throw new DOMException("Document changed", "AbortError");
		media.value = { id, kind, url: native.mediaUrl(result.path), repeat, volume };
		await nextTick();
		const player = mediaElement.value;
		if (!player) throw new Error("Media playback is unavailable");
		player.volume = volume / 100;
		try {
			await player.play();
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === "NotAllowedError") return player;
			controller.signal.throwIfAborted();
			if (!caps.value?.media.available)
				throw new Error(
					zh.value
						? "当前浏览器不支持此媒体编码，可选转码组件未启用。"
						: "This media codec needs the optional transcoder.",
				);
			const converted = await native.prepareMedia(
				current,
				documentIndex.value,
				currentPageId(),
				id,
				controller.signal,
				true,
			);
			media.value = { id, kind, url: native.mediaUrl(converted.path), repeat, volume };
			await nextTick();
			const retry = mediaElement.value;
			if (!retry) throw new Error("Media player is unavailable");
			retry.volume = volume / 100;
			await retry.play();
			return retry;
		}
		return player;
	} finally {
		if (mediaController === controller) mediaBusy.value = false;
	}
}
const actionHost: OfdActionHost = {
	openUri: (uri) => native.openUri(uri),
	playSound: async (id, options) => {
		const player = await prepare(id, "audio", options.repeat, options.volume);
		if (options.synchronous)
			await new Promise<void>((resolve, reject) => {
				const signal = mediaController?.signal;
				const cleanup = () => {
					player.removeEventListener("ended", done);
					player.removeEventListener("error", failed);
					signal?.removeEventListener("abort", cancel);
				};
				const done = () => {
					cleanup();
					resolve();
				};
				const failed = () => {
					cleanup();
					reject(new Error("Audio playback failed"));
				};
				const cancel = () => {
					cleanup();
					reject(new DOMException("Playback cancelled", "AbortError"));
				};
				player.addEventListener("ended", done, { once: true });
				player.addEventListener("error", failed, { once: true });
				signal?.addEventListener("abort", cancel, { once: true });
				if (signal?.aborted) cancel();
			});
	},
	playMovie: async (id, operator) => {
		if (operator === "Play") {
			await prepare(id, "video");
			return;
		}
		if (media.value?.id !== id) return;
		const player = mediaElement.value;
		if (!player) return;
		if (operator === "Resume") await player.play();
		else {
			player.pause();
			if (operator === "Stop") player.currentTime = 0;
		}
	},
};
async function showTrust() {
	await nextTick();
	trustDialog.value?.showModal();
}
async function showPrint() {
	const current = session.value;
	if (!current) return;
	error.value = "";
	try {
		await native.authorize(current, documentIndex.value, "print");
		printInfo.value = await native.printStatus(current, documentIndex.value);
		copies.value = 1;
		await nextTick();
		printDialog.value?.showModal();
	} catch (cause) {
		error.value = native.message(cause);
	}
}
async function print() {
	const current = session.value,
		blob = source.value;
	if (!current || !blob || !printInfo.value) return;
	printController?.abort();
	const controller = new AbortController();
	printController = controller;
	printing.value = true;
	error.value = "";
	try {
		await native.authorize(current, documentIndex.value, "print");
		const doc = await readOfdDocument(blob, {
			documentIndex: documentIndex.value,
			intent: "print",
			signal: controller.signal,
		});
		const target = printInfo.value.capability.format === "png" ? "png" : "pdf";
		const output = await exportDocument(doc, target, {
			fileName: props.fileName,
			scale: 2,
			signal: controller.signal,
		});
		const ids: string[] = [];
		for (let i = 0; i < output.files.length; i++) {
			controller.signal.throwIfAborted();
			const bytes = new Uint8Array(await output.files[i].blob.arrayBuffer());
			const uploaded = await native.upload<{ uploadId: string }>(bytes, {
				kind: target === "pdf" ? "print-pdf" : "print-page",
				documentId: current.id,
				documentHash: current.hash,
				documentIndex: documentIndex.value,
				widthMm: (doc.pages[i]?.width * 25.4) / 96,
				heightMm: (doc.pages[i]?.height * 25.4) / 96,
			});
			ids.push(uploaded.uploadId);
		}
		const job = await native.submitPrint(
			current,
			documentIndex.value,
			ids,
			copies.value,
			controller.signal,
		);
		notice.value = job.detail ?? job.status;
		printInfo.value = await native.printStatus(current, documentIndex.value);
		printDialog.value?.close();
	} catch (cause) {
		if (!controller.signal.aborted) error.value = native.message(cause);
		else
			notice.value = zh.value
				? "打印已取消，请检查任务状态；已提交的份数不会自动退回。"
				: "Printing cancelled. Submitted or uncertain copies are not automatically refunded.";
	} finally {
		printing.value = false;
	}
}
function preferencesChanged(value: OfdViewPreferences) {
	preferences = value;
	void applyWindow();
}
function keyboard(event: KeyboardEvent) {
	if (
		event.key === "Escape" &&
		session.value &&
		visible.value &&
		!trustDialog.value?.open &&
		!printDialog.value?.open
	)
		void native.windowPolicy(session.value.id, documentIndex.value, false).catch(() => {});
}
onMounted(() => {
	if (element.value && typeof IntersectionObserver !== "undefined") {
		observer = new IntersectionObserver(([entry]) => {
			visible.value = !!entry?.isIntersecting;
			if (visible.value) void applyWindow();
			else if (session.value)
				void native
					.windowPolicy(session.value.id, documentIndex.value, undefined, true)
					.catch(() => {});
		});
		observer.observe(element.value);
	} else {
		visible.value = true;
		void applyWindow();
	}
	window.addEventListener(native.TRUST_CHANGED, trustChanged);
	window.addEventListener("keydown", keyboard);
	timer = setInterval(() => {
		clock.value = Date.now();
	}, 1000);
});
onBeforeUnmount(() => {
	generation++;
	loadController.abort();
	verificationController?.abort();
	printController?.abort();
	stopMedia();
	observer?.disconnect();
	if (timer) clearInterval(timer);
	window.removeEventListener(native.TRUST_CHANGED, trustChanged);
	window.removeEventListener("keydown", keyboard);
	void release(session.value, lease);
});
defineExpose({
	getDocument: () => viewer.value?.getDocument(),
	getPageCount: () => viewer.value?.getDocument()?.pages.length ?? 0,
	goToPage: (index: number) => viewer.value?.goToPage(index),
	exportFile,
	verifySignatures: verify,
	printDocument: showPrint,
});
</script>
<template>
	<section ref="element" class="cube-ofd-host als-ofs-editor-ui" :data-editor-theme="editorTheme">
		<UiRibbonSurface
			mode="desktop"
			:active-tab="ribbonTab"
			:collapsed="ribbonCollapsed"
			:aria-label="zh ? 'OFD 功能区' : 'OFD ribbon'"
		>
			<template #tabs>
				<UiRibbonTabs
					v-model="ribbonTab"
					v-model:collapsed="ribbonCollapsed"
					mode="desktop"
					:items="ribbonTabs"
					@select="ribbonCollapsed = false"
					@reselect="ribbonCollapsed = !ribbonCollapsed"
				/>
			</template>
			<template #commands>
				<template v-if="ribbonTab === 'home'">
					<UiRibbonGroup :label="zh ? '文件' : 'File'">
						<UiRibbonCommandButton
							data-editor-file-command="open"
							icon="open-file"
							:label="i18n.t('common.open')"
							size="lg"
						/>
						<template v-if="!controls?.hidden">
							<UiRibbonCommandButton
								icon="export-file"
								:label="i18n.t('common.export')"
								size="lg"
								:disabled="
									!controls?.exportFormats.length ||
									controls.exporting ||
									policy?.export === false
								"
								@activate="controls?.exportFiles()"
							/>
							<UiRibbonField :label="zh ? '导出格式' : 'Export format'">
								<select
									:value="controls?.exportFormat"
									:disabled="
										!controls?.exportFormats.length ||
										controls.exporting ||
										policy?.export === false
									"
									@change="
										controls?.setExportFormat(
											($event.target as HTMLSelectElement)
												.value as ConversionFormat,
										)
									"
								>
									<option
										v-for="format in controls?.exportFormats"
										:key="format"
										:value="format"
									>
										{{ format.toUpperCase() }}
									</option>
								</select>
							</UiRibbonField>
						</template>
						<UiRibbonCommandButton
							icon="print"
							:label="i18n.t('common.print')"
							size="lg"
							:disabled="
								!ready ||
								!session ||
								!policy?.print ||
								!caps?.printing.available ||
								printing
							"
							@activate="showPrint"
						/>
					</UiRibbonGroup>
					<UiRibbonGroup :label="zh ? '签名与证书' : 'Signatures and certificates'">
						<UiRibbonCommandButton
							icon="lock"
							:label="badge"
							size="sm"
							:active="signaturesOpen"
							:disabled="!session"
							@activate="signaturesOpen = !signaturesOpen"
						/>
						<UiRibbonCommandButton
							icon="data-check"
							:label="zh ? '验证签名' : 'Verify signatures'"
							size="sm"
							:disabled="!session || verifying"
							@activate="verify"
						/>
						<UiRibbonCommandButton
							icon="lock"
							:label="zh ? '证书信任' : 'Certificate trust'"
							size="sm"
							:disabled="!host"
							@activate="showTrust"
						/>
					</UiRibbonGroup>
				</template>
				<template v-else>
					<UiRibbonGroup
						v-if="session && session.documents.length > 1"
						:label="zh ? '文档' : 'Document'"
					>
						<UiRibbonField
							:label="zh ? '当前文档' : 'Current document'"
							:control-width="180"
						>
							<select v-model.number="documentIndex">
								<option
									v-for="doc in session.documents"
									:key="doc.index"
									:value="doc.index"
								>
									{{
										doc.title || `${zh ? "文档" : "Document"} ${doc.index + 1}`
									}}
								</option>
							</select>
						</UiRibbonField>
					</UiRibbonGroup>
					<template v-if="!controls?.hidden">
						<UiRibbonGroup :label="zh ? '导航' : 'Navigation'">
							<UiRibbonCommandButton
								icon="chevron-left"
								:label="i18n.t('common.previous')"
								size="lg"
								:disabled="!controls || controls.page === 0"
								@activate="controls && controls.selectPage(controls.page - 1)"
							/>
							<UiRibbonField :label="zh ? '页面' : 'Page'" :control-width="100">
								<select
									:value="controls?.page"
									:disabled="!controls?.pages.length"
									@change="
										controls?.selectPage(
											Number(($event.target as HTMLSelectElement).value),
										)
									"
								>
									<option
										v-for="(page, index) in controls?.pages"
										:key="index"
										:value="index"
									>
										{{ page.name }}
									</option>
								</select>
							</UiRibbonField>
							<UiRibbonCommandButton
								icon="chevron-right"
								:label="i18n.t('common.next')"
								size="lg"
								:disabled="!controls || controls.page >= controls.pages.length - 1"
								@activate="controls && controls.selectPage(controls.page + 1)"
							/>
							<UiRibbonField
								v-if="controls?.outlines.length"
								:label="zh ? '目录' : 'Outline'"
								:control-width="140"
							>
								<select
									value=""
									@change="
										controls.selectOutline(
											Number(($event.target as HTMLSelectElement).value),
										)
									"
								>
									<option value="" disabled>
										{{ zh ? "选择章节" : "Choose a section" }}
									</option>
									<option
										v-for="(outline, index) in controls.outlines"
										:key="index"
										:value="index"
									>
										{{ outline.label }}
									</option>
								</select>
							</UiRibbonField>
						</UiRibbonGroup>
						<UiRibbonGroup :label="zh ? '缩放' : 'Zoom'">
							<UiRibbonField :label="zh ? '比例' : 'Magnification'">
								<select
									:value="controls?.zoom ?? 100"
									:disabled="!controls?.pages.length"
									@change="
										controls?.setZoom(
											Number(($event.target as HTMLSelectElement).value),
										)
									"
								>
									<option v-for="level in zoomLevels" :key="level" :value="level">
										{{ Math.round(level * 10) / 10 }}%
									</option>
								</select>
							</UiRibbonField>
						</UiRibbonGroup>
						<UiRibbonGroup :label="i18n.t('common.search')">
							<UiRibbonField
								:label="zh ? '查找文本' : 'Find text'"
								:control-width="150"
							>
								<input
									type="search"
									:value="controls?.query"
									:disabled="!controls?.pages.length"
									@input="
										controls?.setQuery(
											($event.target as HTMLInputElement).value,
										)
									"
									@keydown.enter.prevent="controls?.findNext()"
								/>
							</UiRibbonField>
							<UiRibbonCommandButton
								icon="search"
								:label="zh ? '查找下一个' : 'Find next'"
								size="lg"
								:disabled="!controls?.matchCount"
								@activate="controls?.findNext()"
							/>
						</UiRibbonGroup>
					</template>
				</template>
			</template>
		</UiRibbonSurface>
		<p v-if="opening" role="status" class="cube-ofd-message">
			{{ zh ? "正在建立文档会话…" : "Opening document session…" }}
		</p>
		<p v-if="error" role="alert" class="cube-ofd-message cube-ofd-error">{{ error }}</p>
		<p v-if="notice" role="status" class="cube-ofd-message">
			{{ notice }}
			<button type="button" @click="notice = ''">{{ zh ? "关闭" : "Dismiss" }}</button>
		</p>
		<div v-if="mediaBusy" class="cube-ofd-message" role="status">
			{{ zh ? "正在准备本地媒体…" : "Preparing local media…" }}
			<button type="button" @click="stopMedia">{{ zh ? "取消" : "Cancel" }}</button>
		</div>
		<div v-if="media" class="cube-ofd-media">
			<component
				:is="media.kind"
				ref="mediaElement"
				:src="media.url"
				:loop="media.repeat"
				controls
			/><button type="button" @click="stopMedia">
				{{ zh ? "关闭媒体" : "Close media" }}
			</button>
		</div>
		<p v-if="ready && !readAllowed" class="cube-ofd-message" role="alert">
			{{
				zh
					? "文档不在允许访问的有效期内。"
					: "This document is outside its allowed validity period."
			}}
		</p>
		<div class="cube-ofd-body">
			<OfdViewer
				v-if="source && ready && readAllowed"
				:key="`${session?.id ?? 'browser'}:${documentIndex}`"
				ref="viewer"
				:source="source"
				:editor-theme="editorTheme"
				external-toolbar
				:file-name="fileName ?? 'document.ofd'"
				:convert="convert"
				:preview="(blob, options) => readOfdDocument(blob, { ...options, documentIndex })"
				:action-host="host ? actionHost : undefined"
				class="cube-ofd-viewer"
				@preferences="preferencesChanged"
			/>
			<UiEditorDock
				active-tab="signatures"
				:tabs="[
					{
						id: 'signatures',
						label: zh ? '签名与证书' : 'Signatures and certificates',
						icon: 'lock',
					},
				]"
				:closed="!signaturesOpen"
				:width="320"
				closable
				@open="signaturesOpen = true"
				@close="signaturesOpen = false"
			>
				<SignaturePanel
					:report="report"
					:busy="verifying"
					:expired="stale"
					:error="verifyError"
					:zh="zh"
					@verify="verify"
					@cancel="verificationController?.abort()"
					@close="signaturesOpen = false"
				/>
			</UiEditorDock>
		</div>
		<dialog ref="trustDialog" class="cube-ofd-dialog">
			<header>
				<strong>{{ zh ? "OFD 信任设置" : "OFD trust settings" }}</strong
				><button type="button" @click="trustDialog?.close()">
					{{ zh ? "关闭" : "Close" }}
				</button>
			</header>
			<TrustSettings />
		</dialog>
		<dialog ref="printDialog" class="cube-ofd-dialog">
			<header>
				<strong>{{ zh ? "打印到默认打印机" : "Print to default printer" }}</strong
				><button type="button" :disabled="printing" @click="printDialog?.close()">
					{{ zh ? "关闭" : "Close" }}
				</button>
			</header>
			<p>
				{{
					zh
						? "份数在提交前由桌面服务预留；队列状态未知时不会自动返还份数。"
						: "Copies are reserved before submission. Unknown spooler status does not automatically restore the quota."
				}}
			</p>
			<label
				>{{ zh ? "份数" : "Copies" }}
				<input
					v-model.number="copies"
					type="number"
					min="1"
					:max="Math.min(99, printInfo?.remaining ?? 99)"
					:disabled="printing"
			/></label>
			<p v-if="printInfo?.remaining !== null">
				{{ zh ? "剩余份数" : "Remaining copies" }}: {{ printInfo?.remaining }}
			</p>
			<button
				type="button"
				:disabled="
					printing || copies < 1 || copies > Math.min(99, printInfo?.remaining ?? 99)
				"
				@click="print"
			>
				{{
					printing ? (zh ? "正在提交…" : "Submitting…") : zh ? "提交打印" : "Print"
				}}</button
			><button v-if="printing" type="button" @click="printController?.abort()">
				{{ zh ? "取消" : "Cancel" }}
			</button>
			<details v-if="printInfo?.jobs.length">
				<summary>{{ zh ? "最近打印任务" : "Recent print jobs" }}</summary>
				<ul>
					<li v-for="job in printInfo.jobs" :key="job.id">
						{{ job.status }} · {{ job.copies }} · {{ job.detail }}
					</li>
				</ul>
			</details>
		</dialog>
	</section>
</template>
<style scoped>
.cube-ofd-host {
	height: 100%;
	min-height: 360px;
	display: flex;
	flex-direction: column;
	color: var(--als-ofs-ui-text, #172033);
	background: var(--als-ofs-ui-surface, #edf2f3);
}
.cube-ofd-message button,
.cube-ofd-media button,
.cube-ofd-dialog button,
.cube-ofd-dialog input,
.cube-ofd-host :deep(.als-ofs-ui-ribbon-field__control > :is(select, input)) {
	font: inherit;
	font-size: 12px;
	border: 1px solid var(--als-ofs-ui-border, #d5e1e3);
	border-radius: 6px;
	padding: 6px 10px;
	background: var(--als-ofs-ui-surface, #fff);
	color: inherit;
}
.cube-ofd-host button {
	cursor: pointer;
}
.cube-ofd-host button:disabled {
	opacity: 0.5;
	cursor: default;
}
.cube-ofd-body {
	display: flex;
	flex: 1;
	min-height: 0;
	overflow: hidden;
}
.cube-ofd-viewer {
	flex: 1;
	min-width: 0;
}
.cube-ofd-body :deep(.ofd-signatures) {
	width: 100%;
	box-sizing: border-box;
	border-left: 0;
}
.cube-ofd-message {
	margin: 0;
	padding: 8px 12px;
	font-size: 13px;
	background: #fff6df;
}
.cube-ofd-error {
	color: #a32525;
	background: #fff0f0;
}
.cube-ofd-media {
	padding: 10px;
	background: var(--office-panel, #fff);
	display: flex;
	gap: 10px;
	align-items: flex-start;
}
.cube-ofd-media video {
	max-height: 280px;
	max-width: calc(100% - 120px);
}
.cube-ofd-media audio {
	width: min(500px, 80%);
}
.cube-ofd-dialog {
	width: min(680px, 85vw);
	max-height: 85vh;
	overflow: auto;
	border: 1px solid var(--office-border, #d5e1e3);
	border-radius: 12px;
	padding: 20px;
	background: var(--office-panel, #fff);
	color: var(--office-text, #172033);
}
.cube-ofd-dialog::backdrop {
	background: #182d4266;
}
.cube-ofd-dialog header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 16px;
}
.cube-ofd-dialog p {
	font-size: 13px;
	line-height: 1.6;
}
.cube-ofd-dialog input {
	width: 90px;
}
.cube-ofd-dialog > button {
	margin: 8px 8px 0 0;
}
</style>
