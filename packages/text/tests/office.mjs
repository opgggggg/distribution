import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ArtifactRegistry } from '@yaochn/als-office-editor-core';
import { TEXT_ARTIFACT_PLUGIN } from '../dist/office.js';
import { readTextDocument, TEXT_EXTENSIONS } from '../dist/index.js';

test('common text extensions register and Java opens as an editable session', async () => {
  const registry = new ArtifactRegistry([TEXT_ARTIFACT_PLUGIN]);
  for (const extension of TEXT_EXTENSIONS) {
    assert.equal((await registry.resolve({ fileName: `example.${extension}` })).manifest.id, 'text');
  }
  const bytes = await readFile(new URL('./HelloCubeOffice.java', import.meta.url));
  const input = { source: bytes, fileName: 'HelloCubeOffice.java' };
  const session = await TEXT_ARTIFACT_PLUGIN.open(input);
  assert.deepEqual(session.getState(), { revision: 0, dirty: false, readonly: false });
  assert.equal(await (await session.export()).text(), bytes.toString());
  const document = await readTextDocument(bytes, { fileName: input.fileName });
  assert.equal(document.language, 'java');
  assert.match(document.html, /hljs-keyword/);
  assert.match(document.html, /hljs-string/);
  assert.match(document.html, /hljs-comment/);
  session.setText('class Changed {}');
  assert.equal(session.getState().dirty, true);
  assert.equal(await (await session.export()).text(), 'class Changed {}');
  session.undo();
  assert.equal(session.getState().dirty, false);
  assert.equal(session.getText(), bytes.toString());
  const readonlySession = await TEXT_ARTIFACT_PLUGIN.open({ ...input, access: 'read' });
  assert.throws(() => readonlySession.setText('no'), /read-only/);
  readonlySession.close();
  await assert.rejects(session.export({ format: 'pdf' }), /not supported/);
  session.close();
  await assert.rejects(session.export(), /closed/);
});

test('CubeOffice profile selects the text contribution and associates Java', async () => {
  const { profiles } = await import('../../../profiles/cubeoffice/desktop/catalog.mjs');
  const { readContributionExtensions, selectFormatContributions, desktopFormatContributionModule } =
    await import('../../../als-office/apps/desktop/scripts/format-contribution-catalog.mjs');
  const profile = profiles.cubeoffice;
  const entries = selectFormatContributions(profile, await readContributionExtensions());
  const { cubeOfficeTextContributionPlugin } = await import('../../../profiles/cubeoffice/desktop/text-contribution-plugin.mjs');
  const transformed = cubeOfficeTextContributionPlugin().transform(desktopFormatContributionModule(entries), '\0virtual:desktop-format-contributions');
  assert.match(transformed.code, /PROFILE_FORMAT_CONTRIBUTIONS.push\(TEXT_VUE_FORMAT_CONTRIBUTION\)/);
  assert.equal(cubeOfficeTextContributionPlugin().transform('unrelated', '/unrelated.ts'), undefined);
  for (const extension of TEXT_EXTENSIONS) {
    assert.ok(profile.supportedExtensions.includes(extension));
    assert.ok(profile.openDocumentExtensions.includes(extension));
    assert.ok(profile.tauriConfig.bundle.fileAssociations.some(entry => entry.ext.includes(extension)));
  }
  for (const extension of ['md', 'csv', 'docx']) assert.ok(!TEXT_EXTENSIONS.includes(extension));
});
