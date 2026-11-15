<script setup lang="ts">
import { computed } from "vue";
import { usePsdEditorContext } from "./psd-editor-context";

const editor = usePsdEditorContext();

const entries = computed(() => {
	void editor.revision.value;
	const session = editor.session.value;
	if (!session) return [];
	const history = session.historyEntries();
	return [...history.past, history.current, ...history.future].map((entry) => ({
		...entry,
		current: entry.stateId === history.current.stateId,
	}));
});

function jump(stateId: number): void {
	editor.session.value?.goToState(stateId);
}
</script>

<template>
	<div class="als-ofs-psd-history">
		<ol class="als-ofs-psd-history__list" aria-label="History states">
			<li v-for="entry in entries" :key="entry.stateId">
				<button
					type="button"
					class="als-ofs-psd-history__entry"
					:data-current="entry.current || undefined"
					@click="jump(entry.stateId)"
				>
					{{ entry.label }}
				</button>
			</li>
		</ol>
		<p v-if="entries.length <= 1" class="als-ofs-psd-history__empty">No edits yet.</p>
	</div>
</template>
