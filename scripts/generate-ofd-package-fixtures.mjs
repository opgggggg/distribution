import { originalOfdModule, OFD_ORACLE_COMMIT } from "./ofd-render-oracle.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const fixtureFile = path.join(root, "packages/ofd/tests/fixtures/rust-package-projection.json");
const revision = JSON.parse(await readFile(fixtureFile, "utf8")).sourceCommit;
if (revision !== OFD_ORACLE_COMMIT) throw Error("Unexpected metadata oracle commit");
const { describePackage } = await originalOfdModule("package");
const { Archive } = await originalOfdModule("archive");
const ns = 'xmlns:o="urn:ofd"';
const cases = [
	{
		name: "metadata-policy-actions-extensions",
		parts: {
			"OFD.xml": `<o:OFD ${ns}><o:DocBody><o:DocInfo><o:Title>中文 &amp; metadata</o:Title></o:DocInfo><o:DocRoot>Doc/Document.xml</o:DocRoot><o:Signatures>Signatures.xml</o:Signatures></o:DocBody></o:OFD>`,
			"Doc/Document.xml": `<o:Document ${ns} xmlns:x="urn:extension"><o:Pages><o:Page ID="1" BaseLoc="Pages/a.xml"/></o:Pages><o:Outlines><o:OutlineElem Title="目录" Expanded="0"><o:Actions><o:Action Event="CLICK"><o:Goto><o:Dest PageID="1"/></o:Goto></o:Action></o:Actions><o:OutlineElem Title="Nested"/></o:OutlineElem></o:Outlines><o:Bookmarks><o:Bookmark Name="Start"/></o:Bookmarks><o:Permissions><o:Edit>0</o:Edit><o:Annot>1</o:Annot><o:Export>false</o:Export><o:Print Printable="true" Copies="0"/><o:ValidPeriod StartDate="2026-01-01" EndDate="2026-12-31"/></o:Permissions><o:VPreferences><o:PageLayout>TwoPage</o:PageLayout><o:Zoom>1.5</o:Zoom><o:HideToolbar>1</o:HideToolbar></o:VPreferences><o:Actions><o:Action Event="DO"><o:URI URI="https://example.invalid/a?a=1&amp;b=2"/><o:Region><o:Area Start="0 0"><o:QuadraticBezier Point1="6 2" Point2="5 5"/><o:Close/></o:Area></o:Region></o:Action></o:Actions><o:Attachments>Attachments.xml</o:Attachments><o:CustomTags>Custom.xml</o:CustomTags><o:Extensions>Extensions.xml</o:Extensions><o:Annotations>Annotations.xml</o:Annotations><x:Opaque x:flag="a&#10;b">one&amp;two<![CDATA[<raw>]]>after<!--keep-->tail</x:Opaque></o:Document>`,
			"Doc/Attachments.xml": `<o:Attachments ${ns}><o:Attachment ID="a" Name="附件.txt" Format="txt"><o:FileLoc>files/a.txt</o:FileLoc></o:Attachment></o:Attachments>`,
			"Doc/Custom.xml": '<x:Custom xmlns:x="urn:custom">keep</x:Custom>',
			"Doc/Extensions.xml": `<o:Extensions ${ns}><o:Extension/></o:Extensions>`,
			"Doc/Annotations.xml": `<o:Annotations ${ns}/>`,
			"Signatures.xml": `<o:Signatures ${ns}/>`,
			"Doc/files/a.txt": "attachment",
		},
	},
	{
		name: "current-version",
		parts: {
			"OFD.xml": `<o:OFD ${ns}><o:DocBody><o:DocRoot>Doc/old.xml</o:DocRoot><o:Versions><o:Version ID="old" BaseLoc="Versions/old.xml"/><o:Version ID="current" Current="1" BaseLoc="Versions/current.xml"/></o:Versions></o:DocBody></o:OFD>`,
			"Versions/old.xml": `<o:Version ${ns}><o:DocRoot>../Doc/old.xml</o:DocRoot></o:Version>`,
			"Versions/current.xml": `<o:Version ${ns}><o:DocRoot>../Doc/current.xml</o:DocRoot></o:Version>`,
			"Doc/old.xml": `<o:Document ${ns}><o:Pages><o:Page ID="old" BaseLoc="old/page.xml"/></o:Pages></o:Document>`,
			"Doc/current.xml": `<o:Document ${ns}><o:Pages><o:Page ID="now" BaseLoc="now/page.xml"/></o:Pages></o:Document>`,
		},
	},
];
cases.push({ ...cases[1], name: "explicit-version", options: { version: "old" } });
for (const item of cases) {
	const files = Object.fromEntries(
		Object.entries(item.parts).map(([p, s]) => [p, new TextEncoder().encode(s)]),
	);
	item.expected = JSON.parse(JSON.stringify(describePackage(new Archive(files), item.options)));
}
const destination = path.join(root, "packages/ofd/tests/fixtures");
await mkdir(destination, { recursive: true });
await writeFile(
	path.join(destination, "rust-package-projection.json"),
	JSON.stringify(
		{ oracle: "original TypeScript describePackage", sourceCommit: revision, cases },
		null,
		2,
	) + "\n",
);
console.log(`Generated ${cases.length} OFD package projections from ${revision}`);
