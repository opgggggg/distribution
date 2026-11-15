import { createPsdBitmap, clonePsdBitmap, type PsdBitmap } from "../codec/document";
/** Bilinear premultiplied sample, transparent beyond the image. */
function sample(b: PsdBitmap, x: number, y: number, out: number[]) {
	out.fill(0);
	const ix = Math.floor(x),
		iy = Math.floor(y),
		tx = x - ix,
		ty = y - iy;
	for (let dy = 0; dy < 2; dy++)
		for (let dx = 0; dx < 2; dx++) {
			const sx = ix + dx,
				sy = iy + dy;
			if (sx < 0 || sy < 0 || sx >= b.width || sy >= b.height) continue;
			const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty),
				p = (sy * b.width + sx) * 4,
				a = b.data[p + 3] / 255;
			for (let c = 0; c < 3; c++) out[c] += b.data[p + c] * a * w;
			out[3] += b.data[p + 3] * w;
		}
}
export function motionBlur(bitmap: PsdBitmap, distance: number, angle: number): PsdBitmap {
	if (distance === 0) return clonePsdBitmap(bitmap);
	const out = createPsdBitmap(bitmap.width, bitmap.height);
	// Compositor maps streak length to Core Image's Gaussian line sigma.
	const sigma = distance / Math.sqrt(12), radius = Math.max(1, Math.ceil(3 * sigma));
	const angleRadians = -(angle * Math.PI) / 180, dx = Math.cos(angleRadians), dy = Math.sin(angleRadians);
	const weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*sigma*sigma)));
	const total=weights.reduce((a,b)=>a+b,0),tmp=[0,0,0,0];
	for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){
		let red=0,green=0,blue=0,alpha=0;
		for(let i=-radius;i<=radius;i++){
			sample(bitmap,x+dx*i,y+dy*i,tmp);const weight=weights[i+radius]/total;
			red+=tmp[0]*weight;green+=tmp[1]*weight;blue+=tmp[2]*weight;alpha+=tmp[3]*weight;
		}
		const p=(y*out.width+x)*4;out.data[p+3]=alpha;
		if(alpha>0){out.data[p]=red*255/alpha;out.data[p+1]=green*255/alpha;out.data[p+2]=blue*255/alpha;}
	}
	return out;
}
export function lensCorrection(bitmap: PsdBitmap, distortion: number): PsdBitmap {
	if (distortion === 0) return clonePsdBitmap(bitmap);
	const out = createPsdBitmap(bitmap.width, bitmap.height),
		cx = (bitmap.width - 1) / 2,
		cy = (bitmap.height - 1) / 2,
		norm = Math.max(1, (bitmap.width ** 2 + bitmap.height ** 2) / 4),
		k = (distortion / 100) * 0.35,
		tmp = [0, 0, 0, 0];
	for (let y = 0; y < out.height; y++)
		for (let x = 0; x < out.width; x++) {
			const dx = x - cx,
				dy = y - cy,
				scale = 1 - (k * (dx * dx + dy * dy)) / norm;
			sample(bitmap, cx + dx * scale, cy + dy * scale, tmp);
			const p = (y * out.width + x) * 4;
			out.data[p + 3] = tmp[3];
			if (tmp[3] > 0) for (let c = 0; c < 3; c++) out.data[p + c] = (tmp[c] * 255) / tmp[3];
		}
	return out;
}
