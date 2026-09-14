<script setup lang="ts">
import { onMounted, ref } from "vue";
import { APP_PROFILE } from "./app-profile.generated";
import { acceptPrivacyPolicy } from "./privacy-consent";

const emit = defineEmits<{ agree: [] }>();
const dialog = ref<HTMLDialogElement>();
const full = ref(false);
const declined = ref(false);

onMounted(() => dialog.value?.showModal());

function agree(): void {
	acceptPrivacyPolicy();
	emit("agree");
}

// Declining must leave the app: the policy has to be accepted before any
// feature runs. Containers that cannot close themselves keep the notice up.
function decline(): void {
	if (window.auroraHarmonyHost?.exitApp?.()) return;
	declined.value = true;
}
</script>
<template>
	<dialog ref="dialog" class="privacy-gate" aria-label="隐私政策" @cancel.prevent>
		<template v-if="declined">
			<h1>已退出使用</h1>
			<p>
				您未同意隐私政策，{{ APP_PROFILE.name }}不会继续运行。请手动关闭应用；如果改变主意，
				重新打开应用即可再次查看本政策。
			</p>
			<div class="privacy-gate-actions">
				<button type="button" class="privacy-gate-primary" @click="declined = false">
					返回查看政策
				</button>
			</div>
		</template>
		<template v-else>
			<h1>隐私政策</h1>
			<div class="privacy-gate-body">
			<p class="privacy-gate-lead">
				{{ APP_PROFILE.name }}重视您的隐私。开始使用前，请阅读并同意以下隐私政策。
			</p>
			<ul class="privacy-gate-points">
				<li><strong>文档只在本机处理。</strong>打开、编辑和保存都在您的设备上完成，我们不会上传文档内容。</li>
				<li><strong>无需注册或登录。</strong>不收集姓名、手机号、邮箱等身份信息。</li>
				<li><strong>不申请敏感权限。</strong>不读取通讯录、位置、相机、麦克风，也不扫描您未主动选择的文件。</li>
				<li>
					<strong>检查更新会联网。</strong>会向 cubexp.com 发送一个随机生成的匿名安装编号、
					应用版本与平台信息，用于版本比对和去重统计。该编号不含硬件标识，清除应用数据后重新生成。
				</li>
				<li><strong>反馈由您主动发起。</strong>仅在您提交反馈时发送填写的内容，是否附带联系方式由您决定。</li>
			</ul>
			<p class="privacy-gate-toggle">
				<button type="button" class="privacy-gate-link" :aria-expanded="full" @click="full = !full">
					{{ full ? "收起完整条款" : "阅读完整条款" }}
				</button>
			</p>
			<section v-if="full" class="privacy-gate-full" tabindex="0" aria-label="隐私政策全文">
				<p class="privacy-gate-meta">生效日期：2026 年 9 月 7 日 · 运营者：cubexp.com</p>
				<p>
					我们重视您的隐私。本政策适用于 {{ APP_PROFILE.name }} 的 HarmonyOS、Android、macOS、
					Windows 与 Linux 版本，并说明应用如何处理数据。应用当前无需注册或登录，文档主要在您的
					设备本地处理。
				</p>
				<h2>1. 我们处理的信息</h2>
				<p>
					当您主动选择打开、导入、创建或编辑文档时，应用会在您的设备上处理相应文件及其内容，
					以提供文档查看、编辑、保存、撤销和多标签工作区等功能。这些文档可能包含您自行写入的文字、
					表格、图片或其他内容。我们不会将文档内容上传至我们运营的服务器。
				</p>
				<h2>2. 设备权限</h2>
				<p>
					应用仅在您主动选择文件、打开文件或保存文件时，通过操作系统提供的文件选择与存储能力访问
					相应内容，不会在未经您操作的情况下扫描其他文件。HarmonyOS 与 Android 版本仅声明网络权限，
					用于您主动检查更新、启用自动更新检查或提交反馈；文档访问通过系统文件选择器授予，
					应用不会请求读取设备全部照片、媒体或文件的权限。
				</p>
				<h2>3. 本地保存与删除</h2>
				<p>
					文档、编辑状态和自动恢复数据保存在您的设备本地，保存期限由您对文件和应用数据的管理决定。
					您可以删除文档、清除应用数据或卸载应用来移除本地数据。设置、匿名安装编号、编辑草稿和
					必要的临时文件保存在应用私有存储中；保存到外部位置时，由您通过系统保存界面选择目标。
				</p>
				<h2>4. 匿名使用数据、诊断与反馈</h2>
				<p>
					应用会随机生成一个匿名安装编号，不读取硬件序列号。每次检查更新会发送该编号、应用版本、
					平台、架构和语言，用于更新兼容性判断和按日去重统计活跃设备；我们不保存原始 IP 地址。
					您可以在设置中随时关闭自动检查更新。您也可主动提交问题、建议或咨询，并自行选择是否提供
					联系方式和系统信息；反馈内容绝不附带文档或文档内容，反馈记录会保留至完成处理或按您的
					请求删除。
				</p>
				<h2>5. AI 应用连接与平台能力</h2>
				<p>
					应用可以连接兼容的 AI 应用。当您主动发起 AI 操作时，相关指令及您选择提供的文档上下文
					可能由所连接的 AI 应用处理，以生成或执行您请求的结果。该 AI 应用对数据的处理受其自身
					隐私政策约束。不同平台版本也可能调用操作系统提供的标准文件、自动化、桌面或移动端能力。
				</p>
				<h2>6. 第三方共享与商业用途</h2>
				<p>
					除您主动连接并调用的 AI 应用外，我们不会主动向第三方共享您的文档内容。我们不会出售您的
					个人信息，也不会将文档内容用于广告或个性化推荐。法律法规另有要求的除外。
				</p>
				<h2>7. 未成年人保护</h2>
				<p>
					应用面向一般用户，不专门面向儿童。监护人应指导未成年人合理使用应用并妥善管理文档内容。
				</p>
				<h2>8. 政策更新</h2>
				<p>
					应用功能或法律要求发生变化时，我们可能更新本政策。重要变更会通过应用市场页面、
					应用内提示或政策页面进行说明。
				</p>
				<h2>9. 联系我们</h2>
				<p>如对本政策或数据处理有疑问，请通过 cubexp.com 联系我们。</p>
			</section>
			<p class="privacy-gate-online">完整条款也可访问 https://cubexp.com/privacy 查看。</p>
			</div>
			<div class="privacy-gate-actions">
				<button type="button" @click="decline">不同意并退出</button>
				<button type="button" class="privacy-gate-primary" autofocus @click="agree">同意并继续</button>
			</div>
		</template>
	</dialog>
</template>
<style scoped>
/* The actions stay out of the scroller: the notice is long enough to push
   "同意并继续" off a phone screen, and a consent button must never be hidden. */
.privacy-gate { display: flex; flex-direction: column; width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); box-sizing: border-box; overflow: hidden; padding: 24px; border: 1px solid var(--office-border, #d9dce8); border-radius: 16px; color: var(--office-text, #202335); background: var(--office-surface, #fff); line-height: 1.7; }
.privacy-gate-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.privacy-gate::backdrop { background: rgb(0 0 0 / 55%); }
h1 { margin: 0 0 12px; font-size: 20px; }
h2 { margin: 20px 0 6px; font-size: 15px; }
p { margin: 0 0 12px; }
.privacy-gate-lead { color: var(--office-text-muted, #545873); }
.privacy-gate-points { margin: 0 0 16px; padding-left: 20px; }
.privacy-gate-points li { margin-bottom: 10px; }
.privacy-gate-toggle { margin: 0 0 12px; }
.privacy-gate-link { padding: 0; border: 0; font: inherit; color: #4f46e5; background: none; cursor: pointer; text-decoration: underline; }
.privacy-gate-full { max-height: 40dvh; overflow: auto; margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--office-border, #d9dce8); border-radius: 12px; font-size: 13px; }
.privacy-gate-meta { color: var(--office-text-muted, #545873); font-size: 12px; }
.privacy-gate-online { margin: 0 0 4px; color: var(--office-text-muted, #545873); font-size: 12px; overflow-wrap: anywhere; }
.privacy-gate-actions { flex: none; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--office-border, #d9dce8); }
.privacy-gate-actions button { min-height: 44px; padding: 8px 20px; border: 1px solid var(--office-border, #d9dce8); border-radius: 10px; font: inherit; color: inherit; background: none; cursor: pointer; }
.privacy-gate-primary { border-color: #4f46e5 !important; color: #fff !important; background: #4f46e5 !important; }
.privacy-gate button:focus-visible, .privacy-gate a:focus-visible { outline: 2px solid #4f46e5; outline-offset: 3px; }
.privacy-gate-body:focus { outline: none; }
</style>
