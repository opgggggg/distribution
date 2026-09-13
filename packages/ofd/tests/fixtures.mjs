import { zipSync, strToU8 } from "fflate";
export function archive(parts) {
	return new Blob([
		zipSync(
			Object.fromEntries(
				Object.entries(parts).map(([path, value]) => [
					path,
					typeof value === "string" ? strToU8(value) : value,
				]),
			),
			{ level: 0 },
		),
	]);
}
export function ofd(text = "你好 OFD", extra = {}) {
	return archive({
		"OFD.xml":
			'<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"><ofd:DocBody><ofd:DocRoot>Doc/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>',
		"Doc/Document.xml":
			'<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016"><ofd:CommonData><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/1.xml"/><ofd:Page ID="2" BaseLoc="Pages/2.xml"/></ofd:Pages></ofd:Document>',
		...Object.fromEntries(
			[1, 2].map((i) => [
				`Doc/Pages/${i}.xml`,
				`<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer ID="${i * 10}"><ofd:TextObject ID="${i * 10 + 1}" Boundary="10 20 100 20" Size="4"><ofd:TextCode X="0" Y="4" DeltaX="g 5 4">${text} ${i}</ofd:TextCode></ofd:TextObject><ofd:PathObject ID="${i * 10 + 2}" Boundary="10 40 20 20"><ofd:AbbreviatedData>M 0 0 L 20 20 B 20 0 0 20 0 0 C</ofd:AbbreviatedData></ofd:PathObject></ofd:Layer></ofd:Content></ofd:Page>`,
			]),
		),
		...extra,
	});
}
