import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArtifactRegistry } from '@yaochn/als-office-editor-core';
import { buildEpub, installDom } from './fixture.mjs';
import { EPUB_ARTIFACT_PLUGIN } from '../dist/office.js';

installDom();

test('EPUB registers by extension and opens as a read-only session', async () => {
	const registry = new ArtifactRegistry([EPUB_ARTIFACT_PLUGIN]);
	assert.equal((await registry.resolve({ fileName: 'novel.epub' })).manifest.id, 'epub');
	const bytes = buildEpub();
	const session = await EPUB_ARTIFACT_PLUGIN.open({ source: bytes, fileName: 'novel.epub' });
	assert.deepEqual(session.getState(), { revision: 0, dirty: false, readonly: true });
	assert.equal(session.capabilities.edit, undefined);
	assert.equal(session.getBook().metadata.title, '测试之书');
	const exported = await session.export();
	assert.equal(exported.type, 'application/epub+zip');
	assert.deepEqual(new Uint8Array(await exported.arrayBuffer()), bytes);
	await assert.rejects(session.export({ format: 'pdf' }), /not supported/);
	session.close();
	await assert.rejects(session.export(), /closed/);
});

test('CubeOffice desktop profile opens and associates EPUB', async () => {
	const { profiles } = await import('../../../profiles/cubeoffice/desktop/catalog.mjs');
	for (const profile of [profiles.cubeoffice, profiles['cubeoffice-huawei']]) {
		assert.ok(profile.supportedExtensions.includes('epub'));
		assert.ok(profile.openDocumentExtensions.includes('epub'));
		assert.ok(profile.supportedFormatLabels.includes('EPUB'));
		const association = profile.tauriConfig.bundle.fileAssociations.find(entry => entry.ext.includes('epub'));
		assert.equal(association.mimeType, 'application/epub+zip');
		assert.equal(association.role, 'Viewer');
		const contribution = profile.formatContributions.find(entry => entry.format === 'EPUB');
		assert.deepEqual(contribution.extensions, ['epub']);
		assert.equal(contribution.binding, 'EPUB_VUE_FORMAT_CONTRIBUTION');
	}
	const { readContributionExtensions, selectFormatContributions, desktopFormatContributionModule } =
		await import('../../../als-office/apps/desktop/scripts/format-contribution-catalog.mjs');
	const entries = selectFormatContributions(profiles.cubeoffice, await readContributionExtensions());
	const module = desktopFormatContributionModule(entries);
	assert.match(module, /import \{ EPUB_VUE_FORMAT_CONTRIBUTION \} from ".*epub-contribution\.ts"/);
	assert.match(module, /\tEPUB_VUE_FORMAT_CONTRIBUTION,/);
	// Text and OFD associations must survive alongside the new entry.
	const associations = profiles.cubeoffice.tauriConfig.bundle.fileAssociations;
	assert.ok(associations.some(entry => entry.ext.includes('ofd')));
	assert.ok(associations.some(entry => entry.ext.includes('java')));
});
