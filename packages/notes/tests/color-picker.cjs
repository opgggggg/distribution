const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	const errors = [];
	try {
		for (const width of [390, 744, 1133]) {
			const p = await browser.newPage({
				viewport: { width, height: width === 1133 ? 744 : 1133 },
				hasTouch: true,
			});
			p.on("pageerror", (e) => errors.push(e.message));
			await p.goto("http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1");
			await p.locator(".cube-notes__tool-tray").waitFor();
			await p.locator('[data-pen-style="crayon"]').tap();
			await p.evaluate(() => (window.EyeDropper = undefined));
			const input = await p.context().newCDPSession(p);
			const ink = () =>
				p.evaluate(() => window.notebook.value.getNotebook().pages[0].layers[0].elements);
			async function touch(a, b) {
				await input.send("Input.dispatchTouchEvent", {
					type: "touchStart",
					touchPoints: [{ ...a, id: 1 }],
				});
				for (let i = 1; i <= 8; i++)
					await input.send("Input.dispatchTouchEvent", {
						type: "touchMove",
						touchPoints: [
							{
								x: a.x + ((b.x - a.x) * i) / 8,
								y: a.y + ((b.y - a.y) * i) / 8,
								id: 1,
							},
						],
					});
				await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			}
			const draw = () => touch({ x: width / 2 - 70, y: 200 }, { x: width / 2 + 70, y: 225 });
			await draw();
			assert.equal((await ink()).length, 1);
			for (const mode of ["grid", "hex", "sliders", "field"]) {
				await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
				assert.equal(
					await p.locator("input[type=color]").count(),
					0,
					"mobile custom color must not create a native popup",
				);
				const before = (await ink()).length;
				await p.getByRole("tab", { name: "网格", exact: true }).tap();
				assert.equal(await p.locator(".cube-notes__color-grid > button").count(), 120);
				if (mode === "grid")
					await p.getByRole("button", { name: "颜色 #ff4015", exact: true }).tap();
				if (mode === "hex") {
					await p.getByRole("tab", { name: "滑块", exact: true }).tap();
					await p.getByRole("textbox", { name: "颜色十六进制值" }).fill("#742abc");
				}
				if (mode === "sliders") {
					await p.getByRole("tab", { name: "滑块", exact: true }).tap();
					await p.getByRole("slider", { name: "红色", exact: true }).fill("47");
					await p.getByRole("slider", { name: "绿色", exact: true }).fill("170");
					await p.getByRole("slider", { name: "蓝色", exact: true }).fill("114");
				}
				if (mode === "field") {
					await p.getByRole("tab", { name: "光谱", exact: true }).tap();
					const field = await p.locator(".cube-notes__color-field").boundingBox();
					await touch(
						{ x: field.x + field.width * 0.3, y: field.y + field.height * 0.6 },
						{ x: field.x + field.width * 0.8, y: field.y + field.height * 0.3 },
					);
				}
				const color = await p
					.locator(".cube-notes__color-sample")
					.evaluate((e) => e.style.getPropertyValue("--sample-color"));
				assert.match(color, /^#[\da-f]{6}$/i);
				assert.equal((await ink()).length, before, "the picker itself must not draw");
				if (mode === "field")
					await p.screenshot({ path: `.cache/notes-qa/color-picker-${width}.png` });
				await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();
				await draw();
				const strokes = await ink();
				assert.equal(strokes.length, before + 1);
				assert.equal(strokes.at(-1).color, color.toLowerCase());
				assert.equal(strokes.at(-1).penStyle, "crayon");
			}
			await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
			await p.getByRole("slider", { name: "不透明度", exact: true }).fill("40");
			await p.getByRole("button", { name: "添加色样", exact: true }).tap();
			const saved = await p
				.locator(".cube-notes__color-sample")
				.evaluate((e) => e.style.getPropertyValue("--sample-color"));
			await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();
			await draw();
			assert.equal((await ink()).at(-1).opacity, 0.4);
			await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
			await p.getByRole("slider", { name: "不透明度", exact: true }).fill("100");
			await p.getByRole("button", { name: `色样 ${saved} 40%`, exact: true }).tap();
			assert.equal(
				await p.getByRole("slider", { name: "不透明度", exact: true }).inputValue(),
				"40",
			);
			await p.getByRole("tab", { name: "滑块", exact: true }).tap();
			await p.getByRole("spinbutton", { name: "红色数值", exact: true }).fill("230");
			await p.getByRole("spinbutton", { name: "红色数值", exact: true }).press("Tab");
			assert.equal(
				await p.getByRole("slider", { name: "红色", exact: true }).inputValue(),
				"230",
			);
			await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();
			const beforeSample = (await ink()).length;
			await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
			await p.getByRole("button", { name: "吸管取色", exact: true }).tap();
			await p.locator(".cube-notes__color-sampling").waitFor();
			await touch({ x: width / 2, y: 200 }, { x: width / 2 + 30, y: 210 });
			assert.equal((await ink()).length, beforeSample, "Eyedropper must not draw");
			await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();
			await draw();
			assert.equal((await ink()).length, beforeSample + 1, "Drawing resumes after sampling");
			await p.locator('[data-tool="highlighter"]').tap();
			await draw();
			assert.equal(
				(await ink()).at(-1).opacity,
				0.5,
				"Highlighter has an independent default opacity",
			);
			await p.getByRole("button", { name: "更多颜色", exact: true }).tap();
			await p.getByRole("slider", { name: "不透明度", exact: true }).fill("25");
			await p.getByRole("button", { name: "关闭选色板", exact: true }).tap();
			await draw();
			assert.equal((await ink()).at(-1).tool, "highlighter");
			assert.equal((await ink()).at(-1).opacity, 0.25, "Highlighter uses palette opacity");
			// Native presentation/backgrounding can interrupt a contact without an up.
			const before = (await ink()).length;
			await input.send("Input.dispatchTouchEvent", {
				type: "touchStart",
				touchPoints: [{ x: width / 2, y: 250, id: 1 }],
			});
			await p.evaluate(() => window.dispatchEvent(new Event("blur")));
			await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			assert.equal((await ink()).length, before, "interrupted input is discarded");
			await draw();
			assert.equal((await ink()).length, before + 1, "the next finger stroke must work");
			const document = await p.evaluate(() => window.notebook.value.getNotebook());
			await p.evaluate(() => (window.noteReadonly.value = true));
			assert.equal(await p.locator(".cube-notes__mobile-navigation").count(), 0);
			assert.equal(await p.locator(".cube-notes__tool-tray").count(), 0);
			await p.getByRole("button", { name: "视图选项", exact: true }).tap();
			assert.equal(
				await p.getByRole("checkbox", { name: "手指书写", exact: true }).count(),
				0,
			);
			await p.getByRole("combobox", { name: "缩放", exact: true }).selectOption("75");
			await p.getByRole("button", { name: "完成", exact: true }).tap();
			await draw();
			assert.deepEqual(await p.evaluate(() => window.notebook.value.getNotebook()), document);
			await p.screenshot({ path: `.cache/notes-qa/notes-readonly-${width}.png` });
			await p.close();
		}
		const native = await browser.newPage();
		await native.goto(
			"http://127.0.0.1:5178/packages/notes/tests/viewer.html?compact=1&native-colors=1",
		);
		await native.getByRole("button", { name: "更多颜色", exact: true }).click();
		assert.equal(await native.locator("input[type=color]").count(), 1);
		assert.equal(await native.locator(".cube-notes__color-picker").count(), 0);
		await native.close();
		assert.deepEqual(errors, []);
		console.log(
			"PASS: tablet grid/hex/RGB sliders/spectrum touch colors immediately allow finger drawing; interrupted contacts recover; readonly removes bottom icons and preserves navigation",
		);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
