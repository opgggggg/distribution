import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const privateRoot = path.join(os.homedir(), "cubexp.com");
const signing = path.join(privateRoot, "harmony");
const profile = JSON.parse(fs.readFileSync(path.join(root, "profiles/cubeoffice/app.json"), "utf8"));
const sdk = "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains";
const java = "/Applications/DevEco-Studio.app/Contents/jbr/Contents/Home/bin/java";
const jar = path.join(sdk, "lib/hap-sign-tool.jar");
const input = path.join(root, "apps/harmony/build/outputs/default/harmony-default-unsigned.app");
const destination = path.join(privateRoot, "releases", profile.versionName);
fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
const work = fs.mkdtempSync(path.join(destination, "sign-"));
const output = path.join(destination, `CubeOffice-${profile.versionName}-release.app`);
if (fs.existsSync(output)) throw new Error("Candidate already exists; archive it before signing again");
execFileSync("unzip", ["-q", input, "-d", work]);
const pack = JSON.parse(fs.readFileSync(path.join(work, "pack.info"), "utf8"));
if (pack.summary.app.bundleName !== profile.packageName || pack.summary.app.version.code !== profile.versionCode)
	throw new Error("Build identity does not match the release profile");
const password = fs.readFileSync(path.join(signing, "store-password"), "utf8").trim();
const hap = path.join(work, "entry-default.hap");
const signed = path.join(work, "entry-signed.hap");
function run(args, logName) {
	try {
		const result = execFileSync(java, ["-jar", jar, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		fs.writeFileSync(path.join(work, logName), result.replaceAll(password, "[REDACTED]"), { mode: 0o600 });
	} catch {
		// execFileSync errors can include command arguments. Never print them.
		throw new Error(`Harmony signing step failed: ${logName}`);
	}
}
const signingArgs = ["sign-app", "-mode", "localSign", "-keyAlias", "cubeoffice-release",
	"-keyPwd", password, "-keystorePwd", password,
	"-keystoreFile", path.join(signing, "cubeoffice-release.p12"),
	"-appCertFile", path.join(signing, "cubeoffice-release.cer"),
	"-profileFile", path.join(signing, "cubeoffice-release-profile.p7b"),
	"-signAlg", "SHA256withECDSA", "-compatibleVersion", "17"];
run([...signingArgs, "-inFile", hap, "-outFile", signed], "sign.log");
run(["verify-app", "-inFile", signed, "-outCertChain", path.join(work, "verified.cer"),
	"-outProfile", path.join(work, "verified.p7b")], "verify.log");
if (!fs.readFileSync(path.join(work, "verified.p7b")).equals(fs.readFileSync(path.join(signing, "cubeoffice-release-profile.p7b"))))
	throw new Error("Signed package Profile mismatch");
fs.renameSync(hap, path.join(work, "entry-unsigned.hap"));
fs.renameSync(signed, hap);
// AppGallery validates the outer APP signature as well as the contained HAP.
const unsignedApp = path.join(work, "unsigned.app");
execFileSync("zip", ["-q", "-0", unsignedApp, "entry-default.hap", "pack.info", "pac.json"], { cwd: work });
run([...signingArgs, "-inFile", unsignedApp, "-outFile", output, "-signCode", "0"], "sign-app.log");
run(["verify-app", "-inFile", output, "-outCertChain", path.join(work, "app-verified.cer"),
	"-outProfile", path.join(work, "app-verified.p7b")], "verify-app.log");
if (!fs.readFileSync(path.join(work, "app-verified.p7b")).equals(fs.readFileSync(path.join(signing, "cubeoffice-release-profile.p7b"))))
	throw new Error("Outer APP Profile mismatch");
fs.chmodSync(output, 0o600);
console.log(JSON.stringify({ output, version: profile.versionName, versionCode: profile.versionCode,
	sha256: createHash("sha256").update(fs.readFileSync(output)).digest("hex"), status: "signed-candidate-not-published" }));
