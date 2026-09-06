export interface ClientInfo {
	client_id: string;
	version: string;
	versionCode: number;
	sdk: number;
	automatic: boolean;
	lastCheck: number;
}
interface NativeServices {
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
export function clientInfo(): ClientInfo | null {
	const service = nativeServices();
	if (!service) return null;
	const info = JSON.parse(service.getInfo()) as ClientInfo;
	return info.client_id ? info : null;
}
export async function requestService<T>(
	operation: "updates" | "feedback",
	payload = {},
): Promise<T> {
	const service = nativeServices();
	if (!service) throw new Error("请在新版 Android 应用中使用此功能");
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
