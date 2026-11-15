import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
/** Development/local-host bridge. A packaged desktop host can expose the same image services over IPC. */
export function psdNativeImages({ executable, route = "/__psd/native" }) {
	let process,
		lines,
		queue = Promise.resolve(),
		pending;
	function start() {
		if (process) return;
		process = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
		lines = createInterface({ input: process.stdout });
		lines.on("line", (line) => {
			pending?.resolve(line);
			pending = null;
		});
		process.on("error", (e) => {
			pending?.reject(e);
			pending = null;
			process = null;
		});
		process.on("exit", () => {
			pending?.reject(new Error("Native image helper exited"));
			pending = null;
			process = null;
		});
		process.stderr.on("data", () => {});
	}
	function request(data) {
		const result = queue.then(
			() =>
				new Promise((resolve, reject) => {
					start();
					const timer = setTimeout(() => {
						process?.kill();
					}, 60_000);
					pending = {
						resolve: (v) => {
							clearTimeout(timer);
							resolve(v);
						},
						reject: (e) => {
							clearTimeout(timer);
							reject(e);
						},
					};
					process.stdin.write(JSON.stringify(data) + "\n");
				}),
		);
		queue = result.catch(() => {});
		return result;
	}
	return {
		name: "psd-native-images",
		configureServer(server) {
			server.httpServer?.once("close", () => process?.kill());
			server.middlewares.use(route, async (req, res) => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.end();
					return;
				}
				// Same-origin only; do not expose local image processing to arbitrary sites.
				const origin = req.headers.origin;
				if (
					origin &&
					origin !== `http://${req.headers.host}` &&
					origin !== `https://${req.headers.host}`
				) {
					res.statusCode = 403;
					res.end();
					return;
				}
				try {
					let size = 0;
					const chunks = [];
					for await (const chunk of req) {
						size += chunk.length;
						if (size > 70_000_000) throw Error("Image request is too large");
						chunks.push(chunk);
					}
					const body = JSON.parse(Buffer.concat(chunks).toString());
					if (!["decode", "foreground"].includes(body.operation))
						throw Error("Unknown operation");
					const result = await request(body);
					res.setHeader("Content-Type", "application/json");
					res.end(result);
				} catch (e) {
					res.statusCode = 400;
					res.setHeader("Content-Type", "application/json");
					res.end(JSON.stringify({ error: String(e) }));
				}
			});
		},
	};
}
