// Keep placement only for byte-identical PNG data produced by this workspace.
// A clipboard changed by another application must use normal centered placement.
let copied: { bytes: Uint8Array; x: number; y: number } | null = null;
export async function rememberPsdClipboard(blob: Blob, origin: { x: number; y: number }): Promise<Blob> {
 copied = { bytes: new Uint8Array(await blob.arrayBuffer()), x: origin.x, y: origin.y };
 return blob;
}
export function psdClipboardOrigin(bytes: Uint8Array): { x: number; y: number } | null {
 if (!copied || copied.bytes.length !== bytes.length) return null;
 for (let i = 0; i < bytes.length; i++) if (copied.bytes[i] !== bytes[i]) return null;
 return { x: copied.x, y: copied.y };
}
