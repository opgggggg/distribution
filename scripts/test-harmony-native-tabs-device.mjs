// Run against a connected PC/2in1 emulator. This builds an isolated test HAP;
// it never installs over CubeOffice or uses a release signing key.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const deveco = process.env.DEVECO_HOME || "/Applications/DevEco-Studio.app/Contents";
const hdc = path.join(deveco, "sdk/default/openharmony/toolchains/hdc");
const bundle = "com.cubexp.office.nativetabstest";
const output = mkdtempSync(path.join(tmpdir(), "cubeoffice-native-tab-test-"));
const source = path.join(root, "apps/harmony");
const realEditors = process.argv.includes("--editors");
cpSync(source, output, {
	recursive: true,
	filter: (file) =>
		!/(?:^|\/)(?:node_modules|oh_modules|\.hvigor|build)(?:\/|$)/.test(file) &&
		(realEditors || !file.includes("resources/rawfile/web")),
});
for (const file of ["AppScope/app.json5", "build-profile.json5"]) {
	const target = path.join(output, file);
	writeFileSync(target, readFileSync(target, "utf8").replaceAll("com.cubexp.office", bundle));
}
const webDir = path.join(output, "entry/src/main/resources/rawfile/web");
mkdirSync(webDir, { recursive: true });
if (!realEditors)
	writeFileSync(
		path.join(webDir, "index.html"),
		`<!doctype html><meta charset="utf-8">
<textarea aria-label="Live WebView state"></textarea><script>
window.qaMarker = crypto.randomUUID(); window.qaAllowClose = false;
const host = window.auroraHarmonyHost;
host.publishNativeTab(JSON.stringify({title:host.getNativeTabSession(),dirty:true,ready:true}));
host.appReady();
setInterval(() => {
 const raw = host.takeNativeTabCommand();
 if (!raw) return;
 const command = JSON.parse(raw);
 if (command.action === 'can-close') host.respondNativeTab(command.request, window.qaAllowClose);
}, 50);
</script>`,
	);
if (realEditors) {
	const html = path.join(webDir, "index.html");
	// The isolated test app has no real user profile; preseed only its test consent.
	writeFileSync(
		html,
		readFileSync(html, "utf8").replace(
			"<head>",
			'<head><script>localStorage.setItem("cubeoffice.privacy.consent","2026-09-07");</script>',
		),
	);
}
const managerPath = path.join(output, "entry/src/main/ets/tabs/NativeTabs.ets");
let manager = readFileSync(managerPath, "utf8");
manager = manager.replace(
	"  takeIntent(session: string): string {",
	`
  async runDeviceTest(): Promise<void> {
    const waitReady = async (id: string): Promise<void> => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (this.sessions.get(id)?.info.ready) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('WebView did not become ready: ' + id);
    };
    const check = (condition: boolean, message: string): void => {
      if (!condition) throw new Error(message);
    };
    try {
      await waitReady('home-main');
      await this.open('home-main', JSON.stringify({ id: 'document-qa-one', fileName: 'A.md' } as OpenTabRequest));
      await waitReady('document-qa-one');
      const one = this.sessions.get('document-qa-one')!;
      await one.controller.runJavaScript("document.querySelector('textarea').value='keep edited contents';document.querySelector('textarea').setSelectionRange(5,11)");
      const stateScript = "JSON.stringify({marker:window.qaMarker,text:document.querySelector('textarea').value,start:document.querySelector('textarea').selectionStart,end:document.querySelector('textarea').selectionEnd})";
      const original = await one.controller.runJavaScript(stateScript);
      check(original.includes('keep edited contents'), 'Test edit did not reach the editor');
      await this.open(one.id, JSON.stringify({ id: 'document-qa-two', fileName: 'B.md' } as OpenTabRequest));
      await waitReady('document-qa-two');
      await this.select('main', one.id);
      check(await one.controller.runJavaScript(stateScript) === original, 'Switch recreated WebView state');
      await this.detach(one.id, 250, 250);
      const destination = this.model.owner(one.id)!;
      check(destination.id !== 'main', 'Detach did not create a window');
      check(this.windows.get(destination.id)?.attached === one.id, 'Detached window did not attach document');
      check(await one.controller.runJavaScript(stateScript) === original, 'Detach lost live state');
      await this.transfer(one.id, 'main', 'document-qa-two');
      check(this.model.owner(one.id)?.id === 'main', 'Merge did not restore ownership');
      check(await one.controller.runJavaScript(stateScript) === original, 'Merge lost live state');
      this.beginDrag(one.id);
      await this.endDrag(true, 0, 0);
      check(this.windows.get('main')?.attached === one.id, 'Cancel moved active document');
      await this.closeTab(one.id);
      check(this.sessions.has(one.id), 'Cancelled close disposed document');
      await one.controller.runJavaScript('window.qaAllowClose=true');
      await this.closeTab(one.id);
      check(!this.sessions.has(one.id), 'Confirmed close retained document');
      console.info('NATIVE_TABS_DEVICE_TEST_PASS: switch, detach, merge, selection, cancellation, close');
    } catch (cause) {
      console.error('NATIVE_TABS_DEVICE_TEST_FAIL: ' + String(cause));
    }
  }

  takeIntent(session: string): string {`,
);
if (realEditors) {
	manager = manager
		.replace(
			"await this.open('home-main', JSON.stringify({ id: 'document-qa-one', fileName: 'A.md' } as OpenTabRequest));",
			`this.command('main', 'new', 'markdown');
      for (let attempt = 0; attempt < 400; attempt++) {
        if (this.model.groups.get('main')!.documents.length > 0) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      const actualId = this.model.groups.get('main')!.documents[0];
      if (!actualId) throw new Error('Native open command did not create a document');`,
		)
		.replaceAll("'document-qa-one'", "actualId");
	manager = manager.replace(
		`await one.controller.runJavaScript("document.querySelector('textarea').value='keep edited contents';document.querySelector('textarea').setSelectionRange(5,11)");`,
		`for (let attempt = 0; attempt < 400; attempt++) {
        const ready = await one.controller.runJavaScript(${JSON.stringify("Boolean(document.querySelector('[contenteditable=true][role=textbox]'))")});
        if (ready === 'true') break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      await one.controller.runJavaScript(${JSON.stringify("const trigger=document.querySelector('[id$=\"-trigger-source\"]');trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,buttons:1}));trigger.click()")});
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await one.controller.runJavaScript("Boolean(document.querySelector('textarea.als-ofs-ui-markdown-editor__source-input'))") === 'true') break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      await one.controller.runJavaScript(${JSON.stringify("window.qaMarker=crypto.randomUUID(); const e=document.querySelector('textarea.als-ofs-ui-markdown-editor__source-input'); e.focus(); e.value='keep edited contents'; e.dispatchEvent(new Event('input',{bubbles:true})); e.setSelectionRange(5,11);")});
      await new Promise<void>((resolve) => setTimeout(resolve, 500));`,
	);
	manager = manager.replace(
		`const stateScript = "JSON.stringify({marker:window.qaMarker,text:document.querySelector('textarea').value,start:document.querySelector('textarea').selectionStart,end:document.querySelector('textarea').selectionEnd})";`,
		`const stateScript = ${JSON.stringify("JSON.stringify({marker:window.qaMarker,text:document.querySelector('textarea.als-ofs-ui-markdown-editor__source-input').value})")};`,
	);
	manager = manager
		.replace(
			`await this.open(one.id, JSON.stringify({ id: 'document-qa-two', fileName: 'B.md' } as OpenTabRequest));`,
			`this.command('main', 'new', 'markdown');
      for (let attempt = 0; attempt < 400; attempt++) {
        if (this.model.groups.get('main')!.documents.length > 1) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      const secondId = this.model.groups.get('main')!.documents[1];`,
		)
		.replaceAll("'document-qa-two'", "secondId");
	const closeStart = manager.indexOf(
		"      await this.closeTab(one.id);",
		manager.indexOf("async runDeviceTest"),
	);
	const closeEnd = manager.indexOf(
		"      console.info('NATIVE_TABS_DEVICE_TEST_PASS",
		closeStart,
	);
	manager =
		manager.slice(0, closeStart) +
		`      check(one.info.dirty, 'Editor changes were not published to native tabs');
      await one.controller.runJavaScript(${JSON.stringify("document.querySelector('button[aria-label=\"撤销上一步操作\"]')?.click(); 'undo'")});
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      const undone = await one.controller.runJavaScript(stateScript);
      check(undone !== original, 'Undo history did not survive migration');
` +
		manager
			.slice(closeEnd)
			.replace(
				"switch, detach, merge, selection, cancellation, close",
				"REAL EDITOR: native open bridge, editing, switch, detach, merge, dirty state, undo",
			);
}
writeFileSync(managerPath, manager);
const pagePath = path.join(output, "entry/src/main/ets/pages/NativeWorkspace.ets");
writeFileSync(
	pagePath,
	readFileSync(pagePath, "utf8").replace(
		".then(() => this.refresh())",
		".then(() => { this.refresh(); if (this.groupId === 'main') void nativeTabs.runDeviceTest(); })",
	),
);
const env = {
	...process.env,
	DEVECO_SDK_HOME: path.join(deveco, "sdk"),
	PATH: `${deveco}/tools/node/bin:${process.env.PATH}`,
};
try {
	execFileSync(
		path.join(deveco, "tools/hvigor/bin/hvigorw"),
		[
			"--mode",
			"module",
			"-p",
			"module=entry@default",
			"-p",
			"product=default",
			"-p",
			"buildMode=debug",
			"--no-daemon",
			"assembleHap",
		],
		{ cwd: output, env, stdio: ["ignore", "pipe", "pipe"] },
	);
} catch (error) {
	writeFileSync(
		path.join(output, "build.log"),
		String(error.stdout ?? "") + String(error.stderr ?? ""),
	);
	throw new Error(`Device test build failed; see ${output}/build.log`);
}
console.log(`Device test workspace: ${output}`);
const run = (args) => execFileSync(hdc, args, { encoding: "utf8" });
run(["shell", "aa", "force-stop", bundle]);
const installed = run([
	"install",
	path.join(output, "entry/build/default/outputs/default/entry-default-unsigned.hap"),
]);
if (!installed.includes("successfully")) throw new Error(installed);
console.log(run(["shell", "aa", "start", "-a", "EntryAbility", "-b", bundle]).trim());
let completed = false;
for (let attempt = 0; attempt < 50; attempt++) {
	await new Promise((resolve) => setTimeout(resolve, 1000));
	const pid = run(["shell", "pidof", bundle]).trim();
	if (!/^\d+$/.test(pid)) {
		if (attempt === 2) run(["shell", "aa", "start", "-a", "EntryAbility", "-b", bundle]);
		continue;
	}
	const log = run(["shell", "hilog", "-x", "-P", pid]);
	const result = log.split("\n").find((line) => /NATIVE_TABS_DEVICE_TEST_(PASS|FAIL)/.test(line));
	if (result) {
		completed = true;
		writeFileSync(path.join(output, "device.log"), log);
		console.log(result.trim());
		if (result.includes("_FAIL")) process.exitCode = 1;
		break;
	}
	if (attempt === 49) {
		writeFileSync(path.join(output, "device.log"), log);
		throw new Error(`Device test timed out; see ${output}/device.log`);
	}
}

if (!completed) throw new Error(`Device test did not finish: ${output}`);
