export function createFontLibrary(panel) {
	const summary = panel.querySelector("[data-font-summary]");
	const search = panel.querySelector("[data-font-search]");
	const rows = panel.querySelector("[data-font-rows]");
	const status = panel.querySelector("[data-font-status]");
	const retry = panel.querySelector("[data-font-retry]");
	const catalogLink = panel.querySelector("[data-font-catalog]");
	let fonts = [];
	let pending;

	function node(tag, text) {
		const result = document.createElement(tag);
		result.textContent = text;
		return result;
	}
	function link(label, url) {
		const result = node("a", label);
		result.href = url;
		result.target = "_blank";
		result.rel = "noopener";
		return result;
	}
	function render() {
		const query = search.value.trim().toLocaleLowerCase();
		const matches = fonts.filter((font) =>
			[font.family, font.license, font.format, font.weight, font.style]
				.join(" ")
				.toLocaleLowerCase()
				.includes(query),
		);
		rows.replaceChildren(
			...matches.map((font) => {
				const row = document.createElement("tr");
				for (const text of [
					font.family,
					`${font.weight} · ${font.style === "italic" ? "斜体" : "正体"}`,
					font.format.toUpperCase(),
					`${(font.bytes / 1048576).toFixed(2)} MB`,
				])
					row.append(node("td", text));
				const license = document.createElement("td");
				license.append(link(font.license, font.licenseUrl));
				const download = document.createElement("td");
				download.append(link("下载字体", font.url));
				row.append(license, download);
				return row;
			}),
		);
		status.textContent = matches.length
			? `显示 ${matches.length} / ${fonts.length} 个字体样式`
			: "没有匹配的字体，请尝试其他名称或许可证。";
	}
	async function jsonResponse(url) {
		const response = await fetch(url, {
			cache: "no-store",
			signal: AbortSignal.timeout(30000),
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return response;
	}
	function releaseUrl(value, base) {
		const url = new URL(value, location.origin);
		if (
			url.origin !== location.origin ||
			!url.pathname.startsWith(base) ||
			url.search ||
			url.hash
		)
			throw new Error("字体资源地址不属于本站发布目录");
		return url.href;
	}
	async function refresh() {
		search.disabled = true;
		retry.hidden = true;
		catalogLink.hidden = true;
		rows.replaceChildren();
		summary.textContent = "正在读取网站字体库…";
		status.textContent = "正在加载…";
		try {
			const config = await (await jsonResponse("/fonts/index.json")).json();
			const manifestUrl = releaseUrl(config.manifestUrl, "/fonts/releases/");
			const bytes = await (await jsonResponse(manifestUrl)).arrayBuffer();
			const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			if (hash !== config.manifestSha256) throw new Error("字体清单校验失败");
			const manifest = JSON.parse(new TextDecoder().decode(bytes));
			const base = new URL(".", manifestUrl).pathname;
			fonts = manifest.fonts
				.map((font) => ({
					...font,
					url: releaseUrl(font.url, base),
					licenseUrl: releaseUrl(font.licenseUrl, base),
				}))
				.sort(
					(a, b) =>
						a.family.localeCompare(b.family) ||
						a.weight - b.weight ||
						a.style.localeCompare(b.style),
				);
			const families = new Set(fonts.map((font) => font.family)).size;
			const unique = new Map(fonts.map((font) => [font.url, font.bytes]));
			const total = [...unique.values()].reduce((sum, size) => sum + size, 0);
			summary.textContent = `${families} 个字体家族 · ${fonts.length} 个字体样式 · ${(total / 1048576).toFixed(1)} MB · 版本 ${manifest.version}`;
			catalogLink.href = manifestUrl;
			catalogLink.hidden = false;
			search.disabled = false;
			render();
		} catch (error) {
			fonts = [];
			summary.textContent = "暂时无法读取网站字体库";
			status.textContent = `加载失败：${error.message}`;
			retry.hidden = false;
		}
	}
	function load() {
		if (!pending)
			pending = refresh().finally(() => {
				pending = undefined;
			});
		return pending;
	}
	search.addEventListener("input", render);
	retry.addEventListener("click", load);
	return { load };
}
