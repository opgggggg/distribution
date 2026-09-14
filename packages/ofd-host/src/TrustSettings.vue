<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useUiEditorI18n } from "@yaochn/als-office-editor-ui/vue/i18n";
import * as bridge from "./bridge";
import type { TrustConfig, Certificate, NativeCapabilities } from "./types";
const props = defineProps<{ language?: string }>();
const i18n = useUiEditorI18n();
const zh = computed(() => (props.language ?? i18n.value.locale).startsWith("zh"));
const config = ref<TrustConfig>(),
	engines = ref<NativeCapabilities>(),
	busy = ref(false),
	error = ref(""),
	pending = ref<{ certificate: string; info: Certificate; isCa: boolean }>();
async function load() {
	if (!bridge.nativeAvailable()) return;
	try {
		[config.value, engines.value] = await Promise.all([
			bridge.listTrust(),
			bridge.capabilities(),
		]);
	} catch (cause) {
		error.value = bridge.message(cause);
	}
}
onMounted(load);
async function choose() {
	busy.value = true;
	error.value = "";
	try {
		const path = await open({
			multiple: false,
			filters: [
				{
					name: zh.value ? "CA 证书" : "CA certificate",
					extensions: ["pem", "cer", "crt", "der"],
				},
			],
		});
		if (typeof path !== "string") return;
		const bytes = await readFile(path);
		if (bytes.length > 256 * 1024)
			throw new Error(zh.value ? "证书文件过大" : "Certificate is too large");
		let text = "";
		for (let i = 0; i < bytes.length; i += 8192)
			text += String.fromCharCode(...bytes.subarray(i, i + 8192));
		const certificate = btoa(text);
		const result = await invoke<{ certificate: Certificate; isCa: boolean }>(
			"profile_service_call",
			{ method: "trust.inspect", params: { certificate } },
		);
		pending.value = { certificate, info: result.certificate, isCa: result.isCa };
	} catch (cause) {
		error.value = bridge.message(cause);
	} finally {
		busy.value = false;
	}
}
async function add() {
	if (!pending.value?.isCa) return;
	busy.value = true;
	try {
		config.value = await bridge.importTrust(pending.value.certificate);
		pending.value = undefined;
		bridge.signalTrustChanged();
	} catch (cause) {
		error.value = bridge.message(cause);
	} finally {
		busy.value = false;
	}
}
async function remove(id: string) {
	busy.value = true;
	try {
		config.value = await bridge.removeTrust(id);
		bridge.signalTrustChanged();
	} catch (cause) {
		error.value = bridge.message(cause);
	} finally {
		busy.value = false;
	}
}
async function configure(
	key: "systemRoots" | "onlineRevocation" | "requireRevocation",
	event: Event,
) {
	if (!config.value) return;
	busy.value = true;
	try {
		config.value = await bridge.configureTrust({
			...config.value,
			[key]: (event.target as HTMLInputElement).checked,
		});
		bridge.signalTrustChanged();
	} catch (cause) {
		error.value = bridge.message(cause);
		await load();
	} finally {
		busy.value = false;
	}
}
</script>
<template>
	<section class="cube-ofd-trust">
		<h3>{{ zh ? "OFD 文档信任与媒体" : "OFD trust and media" }}</h3>
		<p>
			{{
				zh
					? "应用信任库只用于文档签章验证，不会修改操作系统的根证书库。"
					: "Application trust anchors apply to document verification and do not modify the operating system trust store."
			}}
		</p>
		<p v-if="!bridge.nativeAvailable()">
			{{
				zh
					? "此功能在 CubeOffice 桌面版中可用。"
					: "Available in the CubeOffice desktop application."
			}}
		</p>
		<p v-if="error" role="alert" class="error">{{ error }}</p>
		<template v-if="config">
			<label
				><input
					type="checkbox"
					:checked="config.systemRoots"
					:disabled="busy"
					@change="configure('systemRoots', $event)"
				/>{{ zh ? "同时使用系统信任根" : "Also use system trust anchors" }}</label
			>
			<label
				><input
					type="checkbox"
					:checked="config.onlineRevocation"
					:disabled="busy"
					@change="configure('onlineRevocation', $event)"
				/>{{ zh ? "联网查询 OCSP / CRL 吊销状态" : "Check OCSP / CRL online" }}</label
			>
			<label
				><input
					type="checkbox"
					:checked="config.requireRevocation"
					:disabled="busy"
					@change="configure('requireRevocation', $event)"
				/>{{
					zh
						? "吊销状态未知时不显示为受信任"
						: "Require known revocation status for trust"
				}}</label
			>
			<button type="button" :disabled="busy" @click="choose">
				{{ zh ? "导入 CA 证书…" : "Import CA certificate…" }}
			</button>
			<div v-if="pending" class="pending">
				<h4>{{ zh ? "确认信任根" : "Review trust anchor" }}</h4>
				<p>{{ pending.info.subject }}</p>
				<p>{{ zh ? "颁发者" : "Issuer" }}: {{ pending.info.issuer }}</p>
				<code>SHA-256: {{ pending.info.fingerprint }}</code>
				<p>
					{{ new Date(pending.info.validFrom * 1000).toLocaleDateString() }} —
					{{ new Date(pending.info.validUntil * 1000).toLocaleDateString() }}
				</p>
				<p v-if="!pending.isCa" class="error">
					{{
						zh
							? "这不是 CA 证书，不能添加为信任根。"
							: "This is not a CA certificate and cannot be a trust anchor."
					}}
				</p>
				<button type="button" :disabled="busy || !pending.isCa" @click="add">
					{{ zh ? "添加到应用信任库" : "Trust this CA in CubeOffice" }}
				</button>
				<button type="button" :disabled="busy" @click="pending = undefined">
					{{ zh ? "取消" : "Cancel" }}
				</button>
			</div>
			<ul class="anchors">
				<li v-for="anchor in config.anchors" :key="anchor.fingerprint">
					<strong>{{ anchor.subject }}</strong
					><code>{{ anchor.fingerprint }}</code
					><button type="button" :disabled="busy" @click="remove(anchor.fingerprint)">
						{{ zh ? "移除" : "Remove" }}
					</button>
				</li>
			</ul>
			<p v-if="!config.anchors.length">
				{{ zh ? "尚未添加应用信任根。" : "No application trust anchors have been added." }}
			</p>
		</template>
		<template v-if="engines"
			><h4>{{ zh ? "可选媒体转码组件" : "Optional media transcoder" }}</h4>
			<p>
				{{
					engines.media.available
						? engines.media.version
						: zh
							? "未启用；常见音视频直接由系统 WebView 播放。"
							: "Not enabled. Common media plays directly in the system WebView."
				}}
			</p>
			<p v-if="engines.media.available">
				AVS: {{ engines.media.avs ? "✓" : "—" }} · AVS2:
				{{ engines.media.avs2 ? "✓" : "—" }} · AVS3: {{ engines.media.avs3 ? "✓" : "—" }}
			</p>
			<p v-for="note in engines.media.profileNotes" :key="note">{{ note }}</p>
			<p>
				{{ zh ? "系统打印" : "System printing" }}:
				{{
					engines.printing.available
						? engines.printing.backend
						: zh
							? "不可用"
							: "Unavailable"
				}}
			</p></template
		>
	</section>
</template>
<style scoped>
.cube-ofd-trust {
	padding: 16px 0;
	color: var(--office-text, #172033);
	font-size: 13px;
	line-height: 1.6;
	border-top: 1px solid var(--office-border, #d5e1e3);
}
.cube-ofd-trust label {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 10px 0;
}
.cube-ofd-trust button {
	border: 1px solid var(--office-border, #d5e1e3);
	border-radius: 6px;
	background: var(--office-panel, #fff);
	color: inherit;
	padding: 7px 12px;
	cursor: pointer;
}
.cube-ofd-trust button:disabled {
	opacity: 0.55;
	cursor: default;
}
.cube-ofd-trust code {
	display: block;
	overflow-wrap: anywhere;
	font-size: 11px;
}
.cube-ofd-trust .anchors {
	padding: 0;
	list-style: none;
}
.anchors li,
.pending {
	padding: 12px;
	margin: 10px 0;
	background: var(--office-surface, #f3f6f7);
	border: 1px solid var(--office-border, #d5e1e3);
	border-radius: 8px;
}
.anchors li {
	display: grid;
	gap: 6px;
	justify-items: start;
}
.error {
	color: #a32525;
}
</style>
