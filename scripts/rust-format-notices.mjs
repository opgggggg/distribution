import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
/** Ship the notices alongside the compiled Rust payload, without network reads. */
export function writeFormatNotices(root, env) {
	const result = spawnSync(
		"cargo",
		[
			"metadata",
			"--locked",
			"--offline",
			"--format-version",
			"1",
			"--filter-platform",
			"wasm32-unknown-unknown",
		],
		{ cwd: root, encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024 },
	);
	if (result.status !== 0)
		throw Error(result.stderr || "Cannot inspect pinned Rust dependencies.");
	const metadata = JSON.parse(result.stdout),
		seen = new Set(),
		nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
	const visit = (id) => {
		if (seen.has(id)) return;
		seen.add(id);
		for (const dependency of nodes.get(id)?.dependencies ?? []) visit(dependency);
	};
	metadata.packages
		.filter((p) => ["cubeoffice-formats-core", "cubeoffice-ofd-writer"].includes(p.name))
		.forEach((p) => visit(p.id));
	const packages = metadata.packages
		.filter(
			(p) =>
				seen.has(p.id) &&
				(p.source || p.manifest_path.replaceAll("\\", "/").includes("/vendor/")),
		)
		.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
	const sections = [
		"CubeOffice portable-format Rust dependency notices\nGenerated from Cargo.lock. This includes transitive build dependencies.\nSource archives are available at the versioned URLs below.\n",
	];
	for (const pkg of packages) {
		const directory = path.dirname(pkg.manifest_path);
		const files = readdirSync(directory, { withFileTypes: true })
			.filter(
				(f) =>
					f.isFile() &&
					/^(license|licence|copying|copyright|notice)([._-]|$)/i.test(f.name),
			)
			.map((f) => f.name)
			.sort();
		if (
			pkg.license_file &&
			existsSync(path.join(directory, pkg.license_file)) &&
			!files.includes(pkg.license_file)
		)
			files.push(pkg.license_file);
		const location = pkg.source
			? `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`
			: `Vendored source: ${path.relative(root, directory).split(path.sep).join("/")} (pinned in release source)`;
		let text = `${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? "See included license"}\nSource: ${location}\n`;
		if (files.length === 0) {
			// These published archives omit standalone license files. Retain
			// their source headers/authors and include the declared license.
			if (!["fxhash", "mac", "match_token", "selectors"].includes(pkg.name))
				throw Error(`Missing license text for ${pkg.name} ${pkg.version}`);
			const source = readFileSync(
				pkg.targets.find((t) => t.kind.includes("lib"))?.src_path ??
					pkg.targets[0].src_path,
				"utf8",
			);
			text += `Authors (package metadata): ${pkg.authors.join(", ")}\n`;
			text +=
				source
					.split("\n")
					.slice(0, 16)
					.filter((line) =>
						/copyright|licensed|license|mozilla|rust-lang|file at the top-level|option\.|except according/i.test(
							line,
						),
					)
					.join("\n") + "\n";
			const standard =
				pkg.name === "selectors"
					? path.join(
							path.dirname(
								packages.find((p) => p.name === "cssparser").manifest_path,
							),
							"LICENSE",
						)
					: path.join(root, "packages/kernels/LICENSE");
			text += "\n" + readFileSync(standard, "utf8").trim() + "\n";
		}
		for (const file of files)
			text += `\n--- ${file} ---\n${readFileSync(path.join(directory, file), "utf8").trim()}\n`;
		sections.push(text);
	}
	// The pinned upstream parser also carries source/data notices outside Cargo
	// registry packages. Keep those together with its Apache-2.0 project license.
	const pdf = path.join(root, "als-office/crates/pdf-core");
	for (const name of readdirSync(pdf)
		.filter((name) => name.endsWith("-LICENSE"))
		.sort())
		sections.push(
			`Pinned upstream pdf-core: ${name}\n${readFileSync(path.join(pdf, name), "utf8").trim()}\n`,
		);
	sections.push(
		`Pinned upstream project license\n${readFileSync(path.join(root, "als-office/LICENSE"), "utf8").trim()}\n`,
	);
	// Historical Group-3 compatibility behavior retains the original provider's
	// semantics; keep its attribution with the independent Rust implementation.
	sections.push(
		"UTIF 3.1.0 compatibility behavior\nSource: https://registry.npmjs.org/utif/-/utif-3.1.0.tgz\n" +
			readFileSync(path.join(root, "node_modules/utif/LICENSE"), "utf8").trim() +
			"\n",
	);
	writeFileSync(
		path.join(root, "packages/kernels/THIRD_PARTY_LICENSES.txt"),
		sections.join("\n" + "=".repeat(72) + "\n\n"),
	);
}
