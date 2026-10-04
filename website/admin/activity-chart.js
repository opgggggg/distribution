export function activitySeries(rows, today = new Date(), started) {
	const end = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
	const counts = new Map(rows.map((row) => [row.day, Math.max(0, Number(row.active) || 0)]));
	return Array.from({ length: 30 }, (_, index) => {
		const day = new Date(end.getTime() - (29 - index) * 86400000).toISOString().slice(0, 10);
		return { day, active: started && day < started ? null : counts.get(day) || 0 };
	});
}

export function renderActivityChart(container, rows, today, started, label = "活跃安装数") {
	const daily = activitySeries(
		rows,
		today ? new Date(`${today}T12:00:00Z`) : new Date(),
		started,
	);
	const max = Math.max(1, ...daily.map((item) => item.active));
	const step = Math.max(1, Math.ceil(max / 4));
	const ceiling = step * 4;
	const left = 54,
		top = 28,
		width = 696,
		height = 192;
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 780 270");
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", `最近 30 天${label}，UTC 日期`);
	function add(tag, attributes, text) {
		const node = document.createElementNS(svg.namespaceURI, tag);
		for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
		if (text !== undefined) node.textContent = text;
		svg.append(node);
		return node;
	}
	add("text", { x: left, y: 16 }, label);
	for (let index = 0; index <= 4; index++) {
		const y = top + height - (index * height) / 4;
		add("line", { x1: left, x2: left + width, y1: y, y2: y, class: "chart-grid" });
		add("text", { x: left - 9, y: y + 4, "text-anchor": "end" }, String(index * step));
	}
	add("path", {
		d: `M${left} ${top}V${top + height}H${left + width}`,
		fill: "none",
		class: "chart-axis",
	});
	daily.forEach((item, index) => {
		const slot = width / daily.length;
		const x = left + slot * index + slot / 2;
		if (item.active === null)
			add("rect", { x: x - slot / 2, y: top, width: slot, height, fill: "#f1f5f9" });
		const barHeight = ((item.active || 0) / ceiling) * height;
		const bar = add("rect", {
			x: x - slot * 0.35,
			y: top + height - barHeight,
			width: slot * 0.7,
			height: barHeight,
			rx: 2,
			class: "chart-bar",
			tabindex: 0,
			"aria-label": `${item.day}：${item.active === null ? "未采集" : `${item.active} 个安装`}`,
		});
		const title = document.createElementNS(svg.namespaceURI, "title");
		title.textContent = `${item.day}：${item.active === null ? "未采集" : `${item.active} 个安装`}`;
		bar.append(title);
		if ([0, 5, 10, 15, 20, 25, 29].includes(index)) {
			add(
				"text",
				{ x, y: top + height + 20, "text-anchor": "middle" },
				item.day.slice(5).replace("-", "/"),
			);
		}
	});
	if (started && !daily.some((item) => item.active > 0)) {
		add(
			"text",
			{ x: left + width / 2, y: top + height / 2, "text-anchor": "middle" },
			"尚未收到新版客户端的前台活跃上报",
		);
	}
	add("text", { x: left + width, y: 264, "text-anchor": "end" }, "日期（UTC）");
	container.replaceChildren(svg);
}
