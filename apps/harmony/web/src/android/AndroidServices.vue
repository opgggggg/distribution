<script setup lang="ts">
import { UiCheckbox, UiSelect } from "@yaochn/als-office-editor-ui/vue";
import { onMounted, ref } from "vue";
import {
	clientInfo,
	nativeServices,
	requestService,
	validateRelease,
	type AndroidRelease,
} from "./services";
const info = ref(clientInfo());
const checking = ref(false);
const updateStatus = ref("");
const release = ref<AndroidRelease | null>(null);
const copied = ref(false);
const category = ref("bug");
const message = ref("");
const contact = ref("");
const includeSystem = ref(false);
const submitting = ref(false);
const feedbackStatus = ref("");
const feedbackError = ref(false);
const feedbackOpen = ref(false);
async function check() {
	if (checking.value) return;
	checking.value = true;
	updateStatus.value = "正在检查更新…";
	release.value = null;
	try {
		const latest = validateRelease(await requestService("updates"));
		info.value = clientInfo();
		if (latest.versionCode > (info.value?.versionCode || 0)) {
			if (latest.minSdk > (info.value?.sdk || 0))
				updateStatus.value = `新版本需要 Android API ${latest.minSdk} 或更高版本`;
			else {
				release.value = latest;
				updateStatus.value = `发现新版本 ${latest.versionName}（构建 ${latest.versionCode}）`;
			}
		} else updateStatus.value = "当前已是最新版本";
	} catch (error) {
		updateStatus.value = error instanceof Error ? error.message : "检查更新失败";
	} finally {
		checking.value = false;
	}
}
function automatic(enabled: boolean) {
	nativeServices()?.setAutomatic(enabled);
	if (info.value) info.value.automatic = enabled;
	if (enabled) void check();
}
function copy() {
	nativeServices()?.copyClientId();
	copied.value = true;
}
async function submit() {
	if (submitting.value) return;
	feedbackStatus.value = "";
	feedbackError.value = false;
	if (message.value.trim().length < 10) {
		feedbackError.value = true;
		feedbackStatus.value = "请至少填写 10 个字，帮助我们理解问题";
		return;
	}
	submitting.value = true;
	try {
		const result = await requestService<{ feedback_id: string }>("feedback", {
			category: category.value,
			message: message.value.trim(),
			contact: contact.value.trim(),
			includeSystem: includeSystem.value,
		});
		feedbackStatus.value = `反馈已提交，编号：${result.feedback_id}`;
		message.value = "";
		contact.value = "";
	} catch (error) {
		feedbackError.value = true;
		feedbackStatus.value = error instanceof Error ? error.message : "提交失败，内容已保留";
	} finally {
		submitting.value = false;
	}
}
defineExpose({
	handleBack() {
		if (!feedbackOpen.value) return false;
		feedbackOpen.value = false;
		return true;
	},
});
onMounted(() => {
	if (info.value?.automatic && Date.now() - info.value.lastCheck >= 24 * 60 * 60 * 1000)
		void check();
});
</script>
<template>
	<section class="android-settings-card android-services">
		<h2>客户端与更新</h2>
		<template v-if="info">
			<p>版本 {{ info.version }} · 构建 {{ info.versionCode }}</p>
			<label
				>clientId <code class="android-client-id">{{ info.client_id }}</code></label
			>
			<button type="button" @click="copy">
				{{ copied ? "已复制 clientId" : "复制 clientId" }}
			</button>
			<p class="android-service-help">
				此随机编号用于版本检查和反馈定位，不包含硬件标识。清除应用数据后会重新生成。
			</p>
			<label class="android-setting"
				><span><strong>自动检查更新</strong><small>每天首次打开应用时检查</small></span
				><UiCheckbox label="" :model-value="info.automatic" @change="automatic"
			/></label>
			<p class="android-service-help">
				检查更新会向 cubexp.com 发送 clientId、应用版本、Android
				平台、处理器架构和语言，不发送文档内容。
			</p>
			<button type="button" :disabled="checking" @click="check">
				{{ checking ? "正在检查…" : "检查更新" }}
			</button>
			<p v-if="info.lastCheck">上次检查：{{ new Date(info.lastCheck).toLocaleString() }}</p>
			<p v-if="updateStatus" role="status">{{ updateStatus }}</p>
			<template v-if="release">
				<p v-if="release.notes">{{ release.notes }}</p>
				<a class="android-service-download" :href="release.url"
					>下载 {{ release.versionName }} APK</a
				>
				<p class="android-service-help">
					在浏览器中下载后，按系统提示安装，保留现有应用以延续草稿。
				</p>
			</template>
		</template>
		<p v-else>请安装新版 Android APK 后使用客户端服务。</p>
	</section>
	<section class="android-settings-card android-services">
		<h2>帮助与反馈</h2>
		<button type="button" :aria-expanded="feedbackOpen" @click="feedbackOpen = !feedbackOpen">
			{{ feedbackOpen ? "收起反馈表单" : "意见反馈" }}
		</button>
		<form v-if="feedbackOpen" @submit.prevent="submit">
			<label
				>反馈类型<UiSelect
					v-model="category"
					aria-label="反馈类型"
					:disabled="submitting"
					:options="[
						{ value: 'bug', label: '问题报告' },
						{ value: 'suggestion', label: '功能建议' },
						{ value: 'question', label: '使用咨询' },
						{ value: 'other', label: '其他' },
					]"
			/></label>
			<label
				>问题描述<textarea
					v-model="message"
					rows="5"
					minlength="10"
					maxlength="8000"
					required
					:disabled="submitting"
					placeholder="请描述操作步骤、预期结果和实际情况（至少 10 字）"
				/>
			</label>
			<label
				>联系方式（可选）<input
					v-model="contact"
					maxlength="200"
					:disabled="submitting"
					placeholder="邮箱或其他联系方式"
			/></label>
			<label class="android-setting"
				><span>附带 Android 系统版本</span
				><UiCheckbox label="" v-model="includeSystem" :disabled="submitting"
			/></label>
			<p class="android-service-help">
				提交内容及 clientId、应用版本、平台、架构和语言将发送至
				CubeXP。不会自动上传文档或截图。
			</p>
			<button type="submit" :disabled="submitting || !info">
				{{ submitting ? "正在提交…" : "提交反馈" }}
			</button>
			<p v-if="feedbackStatus" :role="feedbackError ? 'alert' : 'status'">
				{{ feedbackStatus }}
			</p>
		</form>
		<a href="https://cubexp.com/privacy">隐私政策</a>
	</section>
</template>
