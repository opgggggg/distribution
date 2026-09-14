<script setup lang="ts">
import { computed } from "vue";
import type { VerificationReport, SignatureResult } from "./types";
const props = defineProps<{
	report?: VerificationReport;
	busy: boolean;
	error?: string;
	zh: boolean;
	expired?: boolean;
}>();
const emit = defineEmits<{ verify: []; cancel: []; close: [] }>();
const stale = computed(() => props.expired === true);
const status = (value: string) =>
	({
		valid: props.zh ? "通过" : "Valid",
		invalid: props.zh ? "失败" : "Invalid",
		unknown: props.zh ? "未知" : "Unknown",
		untrusted: props.zh ? "不受信任" : "Untrusted",
		trusted: props.zh ? "受信任" : "Trusted",
		unsupported: props.zh ? "无法验证" : "Unsupported",
		good: props.zh ? "未吊销" : "Not revoked",
		revoked: props.zh ? "已吊销" : "Revoked",
		verified: props.zh ? "已验证" : "Verified",
		notPresent: props.zh ? "无" : "None",
	})[value] ?? value;
const limited = (signature: SignatureResult) =>
	signature.signers.some((s) => s.revocation.some((r) => r.status === "unknown"));
const date = (value: number | null | undefined) =>
	value ? new Date(value * 1000).toLocaleString() : "—";
</script>
<template>
	<aside class="ofd-signatures" aria-label="OFD signatures">
		<header>
			<strong>{{ zh ? "签名与证书" : "Signatures and certificates" }}</strong
			><button type="button" @click="emit('close')">{{ zh ? "关闭" : "Close" }}</button>
		</header>
		<p>
			{{
				zh
					? "分别检查文件完整性、数字签名及证书信任。显示印章图像并不代表签名有效。"
					: "Document integrity, signature validity and certificate trust are checked separately."
			}}
		</p>
		<div class="ofd-signatures-actions">
			<button type="button" :disabled="busy" @click="emit('verify')">
				{{ zh ? "重新验证" : "Verify again" }}</button
			><button v-if="busy" type="button" @click="emit('cancel')">
				{{ zh ? "取消验证" : "Cancel" }}
			</button>
		</div>
		<p v-if="busy" role="status">
			{{
				zh
					? "正在验证，联网吊销查询可能需要几秒钟…"
					: "Verifying; online revocation checks can take a few seconds…"
			}}
		</p>
		<p v-if="error" role="alert" class="ofd-error">{{ error }}</p>
		<template v-if="report">
			<p class="ofd-muted">
				{{ zh ? "上次验证" : "Last checked" }}: {{ date(report.checkedAt) }} ·
				{{ zh ? "信任策略版本" : "Trust policy revision" }} {{ report.trustRevision }}
			</p>
			<p v-if="stale" role="status">
				{{ zh ? "此验证结果需要刷新。" : "This verification result needs refreshing." }}
			</p>
			<p v-if="!report.signatures.length">
				{{ zh ? "文档没有数字签名。" : "This document has no digital signatures." }}
			</p>
			<article
				v-for="signature in report.signatures"
				:key="`${signature.documentIndex}:${signature.id}`"
			>
				<h4>
					{{ signature.id }} · {{ signature.format }}
					<span
						:class="[
							'ofd-signature-status',
							signature.trust === 'trusted' && !limited(signature) && !stale
								? 'good'
								: signature.trust === 'invalid'
									? 'bad'
									: 'uncertain',
						]"
						>{{
							stale
								? zh
									? "待刷新"
									: "Refresh required"
								: limited(signature) && signature.trust === "trusted"
									? zh
										? "部分检查未完成"
										: "Some checks incomplete"
									: status(signature.trust)
						}}</span
					>
				</h4>
				<dl>
					<dt>{{ zh ? "文件摘要" : "File digests" }}</dt>
					<dd>{{ status(signature.integrity) }}</dd>
					<dt>{{ zh ? "数字签名" : "Signature" }}</dt>
					<dd>{{ status(signature.cryptographicValidity) }}</dd>
					<dt>{{ zh ? "签章组件" : "Provider" }}</dt>
					<dd>{{ signature.provider || "—" }}</dd>
					<dt>{{ zh ? "声明签署时间" : "Claimed signing time" }}</dt>
					<dd>{{ signature.claimedTime || "—" }}</dd>
				</dl>
				<p v-if="signature.sealValid !== null">
					{{ zh ? "印章完整性及授权" : "Seal integrity and authorization" }}:
					{{ signature.sealValid ? (zh ? "通过" : "Valid") : zh ? "未通过" : "Invalid" }}
				</p>
				<details
					v-for="signer in signature.signers"
					:key="signer.certificate.fingerprint"
					open
				>
					<summary>{{ signer.certificate.subject }}</summary>
					<p>
						{{ zh ? "证书链" : "Certificate chain" }}:
						{{
							signer.chainValid ? (zh ? "通过" : "Valid") : zh ? "未通过" : "Invalid"
						}}
						· {{ zh ? "用途" : "Usage" }}:
						{{
							signer.usageValid
								? zh
									? "符合"
									: "Allowed"
								: zh
									? "不符合"
									: "Not allowed"
						}}
					</p>
					<p v-if="signer.detail" class="ofd-error">{{ signer.detail }}</p>
					<p>
						{{ date(signer.certificate.validFrom) }} —
						{{ date(signer.certificate.validUntil) }}
					</p>
					<p class="ofd-fingerprint">SHA-256: {{ signer.certificate.fingerprint }}</p>
					<ul>
						<li v-for="(item, index) in signer.revocation" :key="index">
							{{ zh ? "吊销检查" : "Revocation" }}: {{ status(item.status) }} —
							{{ item.detail }}
						</li>
					</ul>
					<details>
						<summary>{{ zh ? "查看证书链" : "Show certificate chain" }}</summary>
						<ol>
							<li v-for="certificate in signer.chain" :key="certificate.fingerprint">
								{{ certificate.subject }}<br /><code>{{
									certificate.fingerprint
								}}</code>
							</li>
						</ol>
					</details>
				</details>
				<details v-if="signature.timestamp">
					<summary>
						{{ zh ? "时间戳" : "Timestamp" }}: {{ status(signature.timestamp.status) }}
					</summary>
					<p>{{ signature.timestamp.detail }}</p>
					<p v-if="signature.timestamp.time">{{ date(signature.timestamp.time) }}</p>
				</details>
				<ul v-if="signature.issues.length" class="ofd-error">
					<li v-for="issue in signature.issues" :key="issue">{{ issue }}</li>
				</ul>
				<details>
					<summary>
						{{ zh ? "受保护文件" : "Protected files" }} ({{
							signature.references.length
						}})
					</summary>
					<ul>
						<li v-for="file in signature.references" :key="file.path">
							{{ file.valid ? "✓" : "✕" }} {{ file.path }}
							<span v-if="file.error">{{ file.error }}</span>
						</li>
					</ul>
				</details>
			</article>
		</template>
	</aside>
</template>
<style scoped>
.ofd-signatures {
	width: min(440px, 45vw);
	overflow: auto;
	background: var(--office-panel, #fff);
	border-left: 1px solid var(--office-border, #d5e1e3);
	padding: 16px;
	color: var(--office-text, #172033);
	font-size: 13px;
	line-height: 1.6;
}
.ofd-signatures header {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	align-items: center;
}
.ofd-signatures h4 {
	margin: 16px 0 10px;
}
.ofd-signatures article {
	border-top: 1px solid var(--office-border, #d5e1e3);
	margin-top: 16px;
}
.ofd-signatures-actions {
	display: flex;
	gap: 8px;
}
.ofd-signatures button {
	border: 1px solid var(--office-border, #d5e1e3);
	background: var(--office-panel, #fff);
	border-radius: 6px;
	padding: 6px 10px;
	color: inherit;
}
.ofd-signatures dl {
	display: grid;
	grid-template-columns: 110px 1fr;
	gap: 4px 12px;
}
.ofd-signatures dt {
	color: var(--office-text-muted, #617076);
}
.ofd-signatures dd {
	margin: 0;
	overflow-wrap: anywhere;
}
.ofd-signatures details {
	margin: 8px 0;
}
.ofd-signatures summary {
	cursor: pointer;
	overflow-wrap: anywhere;
}
.ofd-signatures code,
.ofd-fingerprint {
	overflow-wrap: anywhere;
	font-size: 11px;
}
.ofd-signature-status {
	font-size: 11px;
	border-radius: 4px;
	padding: 3px 6px;
}
.good {
	background: #e0f5e6;
	color: #186531;
}
.bad,
.ofd-error {
	color: #a32525;
}
.bad {
	background: #fde9e9;
}
.uncertain {
	background: #fff3d6;
	color: #805a08;
}
.ofd-muted {
	color: var(--office-text-muted, #617076);
}
</style>
