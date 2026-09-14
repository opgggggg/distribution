import { defineComponent, h, ref, shallowRef, watch, onBeforeUnmount, type VNode, type PropType } from 'vue';
import { readTextPage, readTextPrefix, TEXT_PAGE_BYTES, type TextPage } from '../large-file.js';
import { TextEditor } from './editor.js';
import { registerTextPreview } from '../thumbnail.js';

export const PagedTextViewer = defineComponent({
	name: 'PagedTextViewer',
	props: { source: { type: Blob as PropType<Blob>, required: true }, fileName: { type: String, default: 'document.txt' }, encoding: { type: String, default: 'utf-8' } },
	emits: ['loaded', 'error'],
	setup(props, { emit, expose }) {
		const page = shallowRef<TextPage>(), error = ref(''), busy = ref(false), root = ref<HTMLElement>();
		let generation = 0, controller: AbortController | undefined;
		const history: number[] = [];
		async function go(offset: number) {
			const id = ++generation;
			controller?.abort(); controller = new AbortController();
			busy.value = true; error.value = '';
			try {
				const result = await readTextPage(props.source, offset, { signal: controller.signal, encoding: props.encoding });
				if (id !== generation) return;
				page.value = result; emit('loaded', result);
			} catch (reason) {
				if (id !== generation) return;
				error.value = String(reason); emit('error', reason);
			} finally { if (id === generation) busy.value = false; }
		}
		watch(() => [props.source, props.encoding], () => { history.length = 0; page.value = undefined; void go(0); }, { immediate: true });
		let unregister: (() => void) | undefined;
		watch(root, el => {
			unregister?.();
			if (el) unregister = registerTextPreview(el, async () => ({ text: await readTextPrefix(props.source, { encoding: props.encoding }), fileName: props.fileName }));
		});
		onBeforeUnmount(() => { generation++; controller?.abort(); unregister?.(); });
		expose({ isDirty: () => false, getRevision: () => 0,
			exportFile: async () => { throw new Error('This file is open in read-only range mode. Copy the original file using the file manager.'); },
		});
		const sizeLabel = () => `${(props.source.size / 1024 / 1024).toFixed(1)} MiB`;
		return (): VNode => h('section', { ref: root, class: 'cubexp-text-large', 'aria-label': props.fileName }, [
			h('div', { class: 'cubexp-text-large__toolbar', role: 'toolbar', 'aria-label': 'Large file navigation' }, [
				h('strong', `Large file · ${sizeLabel()} · Read only`),
				h('button', { disabled: busy.value || !page.value?.start, onClick: () => go(history.pop() ?? Math.max(0, (page.value?.start ?? 0) - TEXT_PAGE_BYTES)) }, 'Previous'),
				h('button', { disabled: busy.value || !page.value || page.value.end >= props.source.size, onClick: () => { history.push(page.value!.start); void go(page.value!.end); } }, 'Next'),
				h('label', ['File position (%) ', h('input', { type: 'number', min: 0, max: 100, step: 0.1, value: ((page.value?.start ?? 0) / Math.max(1, props.source.size) * 100).toFixed(1), disabled: busy.value,
					onChange: (event: Event) => { const value = Number((event.target as HTMLInputElement).value); if (Number.isFinite(value) && value >= 0 && value <= 100) { history.length = 0; void go(Math.floor((Math.max(0, props.source.size - TEXT_PAGE_BYTES)) * value / 100)); } } })]),
			]),
			h('p', { class: 'cubexp-text-large__note', role: 'status' }, busy.value ? 'Reading a file segment…' : `Bytes ${page.value?.start ?? 0}–${page.value?.end ?? 0}. Line numbers and search apply to this segment; saving is disabled.`),
			error.value ? h('p', { role: 'alert' }, error.value) : null,
			page.value ? h(TextEditor, { source: page.value.text, fileName: props.fileName, readonly: true }) : null,
		]);
	},
});
