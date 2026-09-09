import type { NativeServices } from "../../../apps/harmony/web/src/services/client-services";

/** Distribution-owned transport; never handles installer URLs or updates. */
export function createDesktopClientServices(version: string, locale: string): NativeServices {
	const key = "cubeoffice.client-id";
	let clientId = localStorage.getItem(key);
	if (!clientId || !/^[a-zA-Z0-9_-]{20,80}$/.test(clientId)) {
		clientId = crypto.randomUUID();
		localStorage.setItem(key, clientId);
	}
	const agent = navigator.userAgent;
	const platform = /Windows/i.test(agent) ? "windows" : /Mac/i.test(agent) ? "macos" : /Linux/i.test(agent) ? "linux" : "unknown";
	const identity = { client_id: clientId, version, locale, platform, arch: "unknown" };
	const results = new Map<string, string>();
	let pending = false;
	return {
		getInfo: () => JSON.stringify({ ...identity, versionCode: 0, sdk: 0, automatic: false, lastCheck: 0 }),
		// The desktop shell remains the single owner of update preferences.
		setAutomatic: () => { throw new Error("更新选项由桌面设置管理"); },
		copyClientId: () => { void navigator.clipboard.writeText(clientId!).catch(() => {}); },
		request(operation, input) {
			if (operation !== "feedback" || pending || input.length > 12000) return "";
			const payload = JSON.parse(input);
			if (typeof payload.message !== "string" || payload.message.trim().length < 10 || payload.message.length > 8000)
				throw new Error("请填写 10 至 8000 字的问题描述");
			const id = crypto.randomUUID();
			pending = true;
			const abort = new AbortController();
			const timeout = setTimeout(() => abort.abort(), 30000);
			void fetch("https://cubexp.com/api/v1/feedback", {
				method: "POST", credentials: "omit", redirect: "error", signal: abort.signal,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...identity, category: payload.category,
					message: payload.message.trim(), contact: String(payload.contact ?? "").slice(0, 200) }),
			}).then(async (response) => {
				if (!response.ok) throw new Error("反馈提交未确认，请检查网络或稍后重试，内容已保留");
				const data = await response.json();
				if (typeof data.feedback_id !== "string") throw new Error("服务器返回异常，请保留内容并稍后确认");
				results.set(id, JSON.stringify({ ok: true, data }));
			}).catch(() => {
				results.set(id, JSON.stringify({ ok: false, error: "反馈提交未确认，请保留内容并检查网络后重试" }));
			}).finally(() => {
				clearTimeout(timeout);
				pending = false;
				setTimeout(() => results.delete(id), 70000);
			});
			return id;
		},
		takeResult(id) {
			const result = results.get(id) ?? "";
			results.delete(id);
			return result;
		},
	};
}
