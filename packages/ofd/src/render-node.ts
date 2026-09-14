import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { abort } from "./types.js";
function workerArguments(): string[] {
	const args: string[] = [];
	for (let i = 0; i < process.execArgv.length; i++) {
		const arg = process.execArgv[i];
		if (["-e", "--eval", "-p", "--print", "--input-type"].includes(arg)) {
			i++;
			continue;
		}
		if (/^--(?:eval|print|input-type)=/.test(arg) || arg.startsWith("--inspect")) continue;
		args.push(arg);
	}
	return args;
}
export function renderNativeSvg(
	svg: string,
	width: number,
	font: string,
	signal?: AbortSignal,
): Promise<Uint8Array> {
	abort(signal);
	return new Promise((resolve, reject) => {
		const child = fork(fileURLToPath(new URL("./render-worker.js", import.meta.url)), [], {
			stdio: ["ignore", "ignore", "ignore", "ipc"],
			serialization: "advanced",
			execArgv: workerArguments(),
		});
		let settled = false;
		const finish = (error?: Error, bytes?: Uint8Array) => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", cancel);
			if (error) {
				child.kill();
				reject(error);
			} else resolve(bytes!);
		};
		const cancel = () => finish(new DOMException("OFD rendering cancelled.", "AbortError"));
		signal?.addEventListener("abort", cancel, { once: true });
		if (signal?.aborted) {
			cancel();
			return;
		}
		child.once("error", (error) => finish(error));
		child.once("exit", (code, reason) => {
			if (!settled)
				finish(
					new Error(`OFD renderer exited before returning an image (${reason ?? code}).`),
				);
		});
		child.once("message", (message: { bytes?: Uint8Array; error?: string }) => {
			if (message.error) finish(new Error(message.error));
			else if (message.bytes instanceof Uint8Array) finish(undefined, message.bytes);
			else finish(new Error("Invalid OFD renderer response."));
		});
		child.send({ svg, width, font }, (error) => {
			if (error) finish(error);
		});
	});
}
