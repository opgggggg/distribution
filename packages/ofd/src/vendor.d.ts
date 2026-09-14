declare module "utif" {
	interface IFD {
		width: number;
		height: number;
		t256?: number[];
		t257?: number[];
		t274?: number[];
		[name: string]: unknown;
	}
	const UTIF: {
		decode(data: ArrayBuffer): IFD[];
		decodeImage(data: ArrayBuffer, image: IFD): void;
		toRGBA8(image: IFD): Uint8Array;
		encodeImage(data: ArrayBuffer, width: number, height: number): ArrayBuffer;
	};
	export default UTIF;
}
