export interface ClientInfo {
	client_id: string;
	version: string;
	versionCode: number;
	sdk: number;
	automatic: boolean;
	lastCheck: number;
	platform?: string;
	updateChannel?: "appgallery" | "website";
}
// Unknown channels fail closed. Platform identity also guards older Harmony
// hosts from accidentally taking the website-download branch.
export function updateChannel(info: ClientInfo | null): "appgallery" | "website" | "unavailable" {
	if (info?.platform === "harmonyos") return "appgallery";
	if (info?.updateChannel === "appgallery") return "appgallery";
	if (info?.updateChannel === "website") return "website";
	if (info?.platform === "android" && !info.updateChannel) return "website";
	return "unavailable";
}
export interface NativeServices {
	getInfo(): string;
	setAutomatic(enabled: boolean): void;
	copyClientId(): void;
	request(operation: string, input: string): string;
	takeResult(id: string): string;
}
export interface AndroidRelease {
	versionCode: number;
	versionName: string;
	url: string;
	sha256: string;
	minSdk: number;
	notes?: string;
}
export function validateRelease(raw: unknown): AndroidRelease {
	const value = raw as AndroidRelease;
	if (
		!value ||
		!Number.isSafeInteger(value.versionCode) ||
		value.versionCode <= 0 ||
		typeof value.versionName !== "string" ||
		!/^\d+\.\d+\.\d+$/.test(value.versionName) ||
		typeof value.url !== "string" ||
		!/^https:\/\/cubexp\.com\/downloads\/[A-Za-z0-9._-]+\.apk$/.test(value.url) ||
		typeof value.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/.test(value.sha256) ||
		!Number.isInteger(value.minSdk) ||
		value.minSdk < 26
	)
		throw new Error("更新信息无效，请稍后重试");
	return value;
}
export function nativeServices(): NativeServices | undefined {
	return (window as unknown as { cubeofficeServices?: NativeServices }).cubeofficeServices;
}
/** Run only after the user has enabled automatic checks. Never install silently. */
export async function checkAutomaticStoreUpdate(): Promise<boolean> {
	const info = clientInfo();
	if (!info?.automatic || updateChannel(info) !== "appgallery" ||
		Date.now() - info.lastCheck < 24 * 60 * 60 * 1000) return false;
	const result = await requestService<{ channel: string; available: boolean }>("updates");
	return result.channel === "appgallery" && result.available === true;
}
export function clientInfo(service = nativeServices()): ClientInfo | null {
	if (!service) return null;
	const info = JSON.parse(service.getInfo()) as ClientInfo;
	return info.client_id ? info : null;
}
export async function requestService<T>(
	operation: "updates" | "install-update" | "feedback",
	payload = {},
	service = nativeServices(),
): Promise<T> {
	if (!service) throw new Error("当前客户端未提供此服务，请安装新版应用");
	const id = service.request(operation, JSON.stringify(payload));
	if (!id) throw new Error("请求正在进行，请稍后重试");
	const deadline = Date.now() + 65000;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 150));
		const result = service.takeResult(id);
		if (!result) continue;
		const response = JSON.parse(result);
		if (!response.ok) throw new Error(response.error || "请求失败，请稍后重试");
		return response.data as T;
	}
	throw new Error(
		operation === "feedback"
			? "提交结果暂未确认，请保留内容并稍后确认，避免重复提交"
			: "请求超时，请检查网络后重试",
	);
}
