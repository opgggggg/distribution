declare module "utif" {
	interface IFD {
		width: number;
		height: number;
		t274?: number[];
		[name: string]: unknown;
	}
	const UTIF: {
		decode(data: ArrayBuffer): IFD[];
		decodeImage(data: ArrayBuffer, image: IFD): void;
		toRGBA8(image: IFD): Uint8Array;
	};
	export default UTIF;
}
