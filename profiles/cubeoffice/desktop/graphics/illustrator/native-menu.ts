import { CheckMenuItem, MenuItem, Submenu, type Menu } from "@tauri-apps/api/menu";
import {
	illustratorCommands,
	type IllustratorCommand,
	type IllustratorMenuState,
} from "./menu-commands";

type Entry = { item: MenuItem | CheckMenuItem; command: IllustratorCommand };
type Panel = keyof IllustratorMenuState["checked"];

/** Own the Illustrator submenus for one desktop window. */
export async function createIllustratorNativeMenu(
	menu: Menu,
	itemId: (id: string) => string,
	run: (command: IllustratorCommand) => void,
	chinese: boolean,
) {
	const entries: Entry[] = [];
	const captions: { item: Submenu; labels: readonly [string, string] }[] = [];
	async function command(id: IllustratorCommand, check = false) {
		const opts = {
			id: itemId("illustrator-" + id),
			text: illustratorCommands[id][Number(chinese)],
			enabled: false,
			action: () => run(id),
		};
		const item = check
			? await CheckMenuItem.new({ ...opts, checked: false })
			: await MenuItem.new(opts);
		entries.push({ item, command: id });
		return item;
	}
	async function submenu(labels: readonly [string, string], items: (Entry["item"] | Submenu)[]) {
		const item = await Submenu.new({ text: labels[Number(chinese)], items });
		captions.push({ item, labels });
		return item;
	}
	const arrange = await submenu(
		["Arrange", "排列"],
		await Promise.all(
			(["bringToFront", "bringForward", "sendBackward", "sendToBack"] as const).map((id) =>
				command(id),
			),
		),
	);
	const object = await submenu(
		["Object", "对象"],
		[await command("group"), await command("ungroup"), arrange],
	);
	const select = await submenu(
		["Select", "选择"],
		await Promise.all((["selectAll", "deselect", "inverse"] as const).map((id) => command(id))),
	);
	const view = await submenu(
		["View", "视图"],
		await Promise.all(
			(["zoomIn", "zoomOut", "actualSize", "fitArtboard"] as const).map((id) => command(id)),
		),
	);
	const windowMenu = await submenu(
		["Window", "窗口"],
		await Promise.all(
			(["layers", "properties", "artboards"] as const).map((id) => command(id, true)),
		),
	);
	const roots = [object, select, view, windowMenu];
	const attached = new Set<Submenu>();
	type Snapshot = { state: IllustratorMenuState; interactive: boolean };
	let latest: Snapshot | null = null;
	let applied: Snapshot | null = null;
	let applying = false;
	let disposed = false;

	async function refresh() {
		applying = true;
		try {
			while (!disposed && latest !== applied) {
				const next = latest;
				if (next) {
					await Promise.all(
						entries.map(async ({ item, command }) => {
							const check =
								item instanceof CheckMenuItem
									? next.state.checked[command as Panel]
									: undefined;
							await item.setEnabled(next.interactive && next.state.enabled[command]);
							if (check !== undefined && item instanceof CheckMenuItem)
								await item.setChecked(check);
						}),
					);
					for (const root of roots) {
						if (disposed) return;
						if (!attached.has(root)) {
							await menu.append(root);
							attached.add(root);
						}
					}
				} else {
					for (const root of attached) {
						await menu.remove(root);
						attached.delete(root);
					}
				}
				applied = next;
			}
		} catch (error) {
			if (!disposed) console.warn("Could not update Illustrator menus", error);
		} finally {
			applying = false;
		}
	}
	return {
		setState(state: IllustratorMenuState | null, interactive: boolean) {
			latest = state ? { state, interactive } : null;
			if (!applying && !disposed) void refresh();
		},
		setLanguage(isChinese: boolean) {
			const language = Number(isChinese);
			void Promise.all([
				...captions.map(({ item, labels }) => item.setText(labels[language])),
				...entries.map(({ item, command }) =>
					item.setText(illustratorCommands[command][language]),
				),
			]).catch((error) => console.warn("Could not translate Illustrator menus", error));
		},
		dispose() {
			disposed = true;
			void Promise.allSettled([
				...entries.map(({ item }) => item.close()),
				...captions.map(({ item }) => item.close()),
			]);
		},
	};
}
