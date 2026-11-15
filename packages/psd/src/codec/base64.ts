export function psdBytesToBase64(bytes: Uint8Array): string {
	let s = "";
	for (let i = 0; i < bytes.length; i += 32768)
		s += String.fromCharCode(...bytes.subarray(i, i + 32768));
	return btoa(s);
}
export function psdBase64ToBytes(value: string): Uint8Array {
	if (
		value.length > 64 * 1024 * 1024 ||
		value.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]*={0,2}$/.test(value)
	)
		throw new Error("Invalid or oversized PSD base64");
	const s = atob(value);
	return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
