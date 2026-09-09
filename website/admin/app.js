import "./controls.js?v=022a6ee0e230";
const login = document.querySelector("[data-login]");
const loginForm = document.querySelector("[data-login-form]");
const loginError = document.querySelector("[data-login-error]");
const dashboard = document.querySelector("[data-dashboard]");
const authActions = document.querySelector("[data-auth-actions]");
const metrics = document.querySelector("[data-metrics]");
const chart = document.querySelector("[data-chart]");
const versions = document.querySelector("[data-versions]");
const records = document.querySelector("[data-records]");
const empty = document.querySelector("[data-empty]");
const filter = document.querySelector("[data-filter]");
const updated = document.querySelector("[data-updated]");
const detail = document.querySelector("[data-detail]");
const detailKicker = document.querySelector("[data-detail-kicker]");
const detailTitle = document.querySelector("[data-detail-title]");
const detailContent = document.querySelector("[data-detail-content]");

const platforms = document.querySelector("[data-platforms]");
const platformPeriod = document.querySelector("[data-platform-period]");
const platformSummary = document.querySelector("[data-platform-summary]");
let platformItems = [];
platformPeriod.addEventListener("change", renderPlatforms);

function renderPlatforms() {
	const field = platformPeriod.value;
	const total = platformItems.reduce((sum, row) => sum + Number(row[field] || 0), 0);
	const labels = {
		macos: "macOS",
		windows: "Windows",
		linux: "Linux",
		android: "Android",
		other: "其他",
		unknown: "未知",
	};
	platformSummary.textContent = total
		? `${field === "clients" ? "累计" : "近 30 天活跃"} ${total.toLocaleString("zh-CN")} 个客户端`
		: "暂无平台数据，等待客户端上报";
	const list = element("div", "platform-list");
	for (const item of platformItems) {
		const count = Number(item[field] || 0);
		const share = total ? (count / total) * 100 : 0;
		const name = labels[item.platform] || "其他";
		const row = element("div", "platform-row");
		const bar = element("progress", "platform-bar");
		bar.max = 100;
		bar.value = share;
		bar.setAttribute("aria-label", `${name} 占比 ${share.toFixed(1)}%`);
		row.append(
			element("strong", "", name),
			bar,
			element("span", "platform-count", count.toLocaleString("zh-CN")),
			element("span", "platform-share", `${share.toFixed(1)}%`),
		);
		list.append(row);
	}
	platforms.replaceChildren(list);
}

let activeTab = "feedback";
let currentItems = [];
const statusLabels = { new: "待处理", reviewing: "处理中", resolved: "已解决" };
const replyDrafts = new Map();
const versionDrafts = new Map();

async function request(path, options = {}) {
	const response = await fetch(path, {
		credentials: "same-origin",
		headers: { "Content-Type": "application/json", ...(options.headers || {}) },
		...options,
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(payload.error?.message || `Request failed (${response.status})`);
		error.status = response.status;
		throw error;
	}
	return payload;
}

function setAuthenticated(value) {
	login.hidden = value;
	dashboard.hidden = !value;
	authActions.hidden = !value;
}

function element(tag, className, content) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (content !== undefined) node.textContent = String(content);
	return node;
}

function formatTime(value) {
	if (!value) return "—";
	return new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function metricCard(label, value) {
	const card = element("article", "metric");
	card.append(element("span", "", label), element("strong", "", value));
	return card;
}

function renderOverview(payload) {
	platformItems = payload.platforms || [];
	renderPlatforms();
	const total = payload.totals || {};
	metrics.replaceChildren(
		metricCard("今日活跃 DAU", total.dau_today || 0),
		metricCard("近 7 天活跃", total.active_7d || 0),
		metricCard("近 30 天活跃", total.active_30d || 0),
		metricCard("累计匿名客户端", total.clients || 0),
		metricCard("待处理反馈", total.feedback_new || 0),
		metricCard("24h 错误", total.errors_24h || 0),
	);

	const daily = payload.daily || [];
	const max = Math.max(1, ...daily.map((item) => Number(item.active) || 0));
	chart.replaceChildren(
		...daily.map((item) => {
			const day = element("span", "chart-day");
			day.title = `${item.day}: ${item.active}`;
			const level = Math.max(1, Math.ceil(((Number(item.active) || 0) / max) * 20));
			const bar = element("i", `level-${level}`);
			day.append(bar);
			return day;
		}),
	);

	const versionList = element("div", "version-list");
	for (const item of payload.versions || []) {
		const row = element("div", "version-row");
		row.append(
			element("span", "", item.version || "未知"),
			element("strong", "", item.clients),
		);
		versionList.append(row);
	}
	versions.replaceChildren(versionList);
	updated.textContent = `更新于 ${new Date().toLocaleTimeString("zh-CN")}`;
}

function configureFilter() {
	const choices =
		activeTab === "feedback"
			? [
					["", "全部状态"],
					["new", "待处理"],
					["reviewing", "处理中"],
					["resolved", "已解决"],
				]
			: [
					["", "全部级别"],
					["error", "错误"],
					["warning", "警告"],
					["info", "信息"],
				];
	filter.options = choices.map(([value, label]) => ({ value, label }));
	filter.value = choices[0][0];
}

function recordButton(item) {
	const button = element("button", "record");
	button.type = "button";
	button.dataset.id = item.id;
	const badge = element(
		"span",
		"badge",
		activeTab === "feedback" ? statusLabels[item.status] || item.status : item.level,
	);
	const summary = element("span", "summary", item.message);
	if (activeTab === "feedback") {
		badge.dataset.status = item.status;
		summary.append(
			element("small", "reply-summary", item.reply ? `回复：${item.reply}` : "暂无回复"),
		);
	}
	const version = element("small", "", item.app_version || "—");
	if (activeTab === "feedback" && item.fixed_version) {
		summary.append(element("span", "reply-summary", `修复版本：${item.fixed_version}`));
	}
	const time = element("small", "", formatTime(item.created_at));
	button.append(badge, summary, version, time);
	button.addEventListener("click", () => showDetail(item));
	return button;
}

async function loadRecords() {
	const query = new URLSearchParams({ limit: "100" });
	if (filter.value) query.set(activeTab === "feedback" ? "status" : "level", filter.value);
	const payload = await request(`/api/v1/admin/${activeTab}?${query}`);
	currentItems = payload.items || [];
	records.replaceChildren(...currentItems.map(recordButton));
	empty.hidden = currentItems.length > 0;
}

function detailBlock(label, value, preformatted = false) {
	const block = element("section", "detail-block");
	block.append(element("label", "", label));
	block.append(element(preformatted ? "pre" : "p", "", value || "—"));
	return block;
}

function showDetail(item) {
	detailKicker.textContent = activeTab === "feedback" ? "USER FEEDBACK" : "CLIENT LOG";
	detailTitle.textContent = activeTab === "feedback" ? item.id : `Log #${item.id}`;
	const blocks = [
		detailBlock("时间", new Date(item.created_at).toLocaleString("zh-CN")),
		detailBlock("匿名客户端 ID", item.client_id),
		detailBlock(
			"版本 / 平台",
			`${item.app_version || "—"} · ${item.platform || "—"} · ${item.arch || "—"}`,
		),
		detailBlock("内容", item.message, true),
	];
	if (activeTab === "feedback") {
		blocks.push(
			detailBlock(
				"分类 / 状态",
				`${item.category} · ${statusLabels[item.status] || item.status}`,
			),
		);
		if (item.updated_at)
			blocks.push(
				detailBlock("处理更新时间", new Date(item.updated_at).toLocaleString("zh-CN")),
			);
		if (item.contact) blocks.push(detailBlock("联系方式", item.contact));
		if (item.screenshot_path) {
			const imageBlock = element("section", "detail-block");
			imageBlock.append(element("label", "", "截图"));
			const image = element("img", "detail-screenshot");
			image.src = `/api/v1/admin/feedback/${encodeURIComponent(item.id)}/screenshot`;
			image.alt = `${item.id} 截图`;
			imageBlock.append(image);
			blocks.push(imageBlock);
		}
		const form = element("form", "feedback-form");
		const statusLabel = element("label", "", "处理状态");
		statusLabel.htmlFor = "feedback-status";
		const status = element("cube-select");
		status.id = "feedback-status";
		status.setAttribute("aria-label", "处理状态");
		status.options = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
		status.value = item.status;
		const versionLabel = element("label", "", "修复版本（可选）");
		versionLabel.htmlFor = "feedback-fixed-version";
		const fixedVersion = element("input");
		fixedVersion.id = "feedback-fixed-version";
		fixedVersion.type = "text";
		fixedVersion.maxLength = 100;
		fixedVersion.placeholder = "例如：CubeOffice 1.4.1 / als-office 0.57.4";
		fixedVersion.value = versionDrafts.get(item.id) ?? item.fixed_version ?? "";
		fixedVersion.addEventListener("input", () =>
			versionDrafts.set(item.id, fixedVersion.value),
		);
		const replyLabel = element("label", "", "处理回复");
		replyLabel.htmlFor = "feedback-reply";
		const reply = element("textarea");
		reply.id = "feedback-reply";
		reply.rows = 5;
		reply.maxLength = 12000;
		reply.value = replyDrafts.get(item.id) ?? item.reply ?? "";
		reply.addEventListener("input", () => replyDrafts.set(item.id, reply.value));
		reply.setAttribute("aria-describedby", "feedback-reply-help");
		const help = element(
			"p",
			"feedback-help",
			"保存在管理后台，不会自动发送邮件或通知客户端。最多 12,000 字。",
		);
		help.id = "feedback-reply-help";
		const notice = element("p", "feedback-notice");
		notice.setAttribute("role", "status");
		const save = element("button", "button primary", "保存处理信息");
		save.type = "submit";
		form.append(
			statusLabel,
			status,
			versionLabel,
			fixedVersion,
			replyLabel,
			reply,
			help,
			notice,
			save,
		);
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (save.disabled) return;
			save.disabled = true;
			reply.disabled = true;
			fixedVersion.disabled = true;
			save.textContent = "正在保存…";
			notice.textContent = "";
			try {
				const result = await request("/api/v1/admin/feedback/status", {
					method: "POST",
					body: JSON.stringify({
						id: item.id,
						status: status.value,
						reply: reply.value,
						fixed_version: fixedVersion.value,
						revision: item.revision ?? 0,
					}),
				});
				Object.assign(item, result.item);
				replyDrafts.delete(item.id);
				versionDrafts.delete(item.id);
				notice.textContent = "状态、修复版本和回复已保存。";
				await Promise.all([loadOverview(), loadRecords()]).catch(() => {
					notice.textContent = "已保存，但列表刷新失败，请点击刷新。";
				});
			} catch (error) {
				notice.textContent =
					error.status === 409
						? "其他管理员已修改此反馈。回复草稿已保留，请刷新列表并重新打开后保存。"
						: `保存失败：${error.message}。回复草稿已保留，可重试。`;
			} finally {
				save.disabled = false;
				reply.disabled = false;
				fixedVersion.disabled = false;
				save.textContent = "保存处理信息";
			}
		});
		blocks.push(form);
	}
	if (item.stack) blocks.push(detailBlock("Stack", item.stack, true));
	if (item.context)
		blocks.push(detailBlock("Context", JSON.stringify(item.context, null, 2), true));
	if (item.system_info)
		blocks.push(detailBlock("System info", JSON.stringify(item.system_info, null, 2), true));
	detailContent.replaceChildren(...blocks);
	detail.showModal();
}

async function loadOverview() {
	renderOverview(await request("/api/v1/admin/overview"));
}

async function loadDashboard() {
	await Promise.all([loadOverview(), loadRecords()]);
}

loginForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	loginError.hidden = true;
	const submit = loginForm.querySelector("button[type='submit']");
	submit.disabled = true;
	try {
		await request("/api/v1/admin/login", {
			method: "POST",
			body: JSON.stringify({ password: loginForm.querySelector("#password").value }),
		});
		loginForm.reset();
		setAuthenticated(true);
		await loadDashboard();
	} catch (error) {
		loginError.textContent = error.message;
		loginError.hidden = false;
	} finally {
		submit.disabled = false;
	}
});

// Enable submission only after the handler that prevents native navigation exists.
loginForm.querySelector("button[type='submit']").disabled = false;

document.querySelector("[data-logout]").addEventListener("click", async () => {
	await request("/api/v1/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
	setAuthenticated(false);
});

document.querySelector("[data-refresh]").addEventListener("click", loadDashboard);
document.querySelector("[data-detail-close]").addEventListener("click", () => detail.close());
filter.addEventListener("change", loadRecords);

for (const tab of document.querySelectorAll("[data-tab]")) {
	tab.addEventListener("click", async () => {
		activeTab = tab.dataset.tab;
		for (const item of document.querySelectorAll("[data-tab]")) {
			item.setAttribute("aria-selected", String(item === tab));
		}
		configureFilter();
		await loadRecords();
	});
}

configureFilter();
request("/api/v1/admin/session")
	.then(async () => {
		setAuthenticated(true);
		await loadDashboard();
	})
	.catch(() => setAuthenticated(false));
