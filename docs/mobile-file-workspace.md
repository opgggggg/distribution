# Mobile file workspace

Scope: complete the existing-format mobile workflow. New attachment formats
(archives, audio/video, RTF/ODF/WPS) are excluded from this change.

## Acceptance boundary

- M01: export waits for native success/cancellation/failure; retry preserves edits.
- M02: retain a user-selected original reference; save back only for compatible,
  writable sources; concurrent edits stay dirty and source conflicts are reported.
- M03: share original/current/PDF through the system share sheet; printing is available.
- M04: PDF forms, annotation/signature, rotation and page organization are reachable
  on phones; image crop/rotate/markup/resize/export are reachable on phones.
- M05: GIF animation, SVG vector viewing and every TIFF page remain available in
  reading mode; lossy editing requires an explicit conversion decision.
- M06: distinguish files/drafts, expose source/size, favorites, selection, sorting,
  batch share/export and removal of local records without deleting originals.
- M07: format-specific phone actions and conversion/export entry point.
- M08: restore after reload/interruption; native lifecycle, IME, accessibility,
  safe-area and large-file checks; document device evidence and remaining limits.
- M09: app/home/website copy reflects general file viewing and light editing.

## Implementation

M01–M07 and M09 are implemented across the shared phone workspace and Android,
iOS and HarmonyOS hosts. M08 has implemented lifecycle flushing, bounded image
processing/history, ordered draft writes, ready/busy guards, modal focus handling,
touch targets, safe-area/keyboard-sized layouts and recovery. The device evidence
below describes the validation boundary; it does not imply physical-device certification.

- Save receipts settle on actual native completion or cancellation. Android share
  and print receipts explicitly mean the system panel opened; they do not claim a
  message was sent or a page was printed.
- Original references retain provider grants/bookmarks and a content fingerprint.
  External changes reject writeback; converted formats and lossy image conversion
  save a copy. Exporting a copy keeps the existing original association.
- PDF supports form filling, Chinese FreeText, comments/highlights, drawn signature,
  page rotation/reordering/deletion and undo. Signatures are drawn images, not
  cryptographic digital signatures.
- Image reading preserves the original GIF/SVG and all TIFF pages. Raster editing
  offers crop, rotation, resizing, pen/text markup and PNG/JPEG/WebP/PDF output;
  converting a vector, animation or selected TIFF page requires confirmation.
- The library exposes files/drafts/favorites, location/size, sorting, multi-select,
  system batch sharing, sequential export and local-record removal. Removing a local
  record never deletes its original in the device/provider.
- Existing-format conversions use the engine's supported targets. Spreadsheet PDF
  export is not advertised because the existing engine does not supply it.

## Evidence — 2026-10-14

The file home was subsequently redesigned around a compact header, an inline
New action, a system Open row and text tabs. Type/sort controls use one sheet;
per-file favorite/rename controls use a row menu. There is no floating button
over the empty state. The library shares one purple light/dark palette, and its
text responds to the user's font size. Empty/populated layouts, 200% text,
small phones, landscape, tablet, filtering, sorting, favorite and rename were
verified with `apps/android/tests/library-layout.cjs`.

| Layer            | Verified                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript/Web   | Shared `vue-tsc --noEmit`; production mobile Vite build                                                                                                                                                                                                                                                                                                                             |
| Browser workflow | Save snapshot versus continued typing; native cancellation/provider failure; reload recovery; SVG preservation and explicit conversion; image rotate/undo/crop/resize/text/PDF export; two-page TIFF; oversized TIFF rejected before pixel allocation; Chinese PDF form/FreeText, annotation and drawn signature exported and reopened; favorite persistence and batch share/export |
| Layout           | 375/390 px phones, 812×375 landscape, 1024×768 tablet and 390×430 keyboard-sized viewport; no horizontal overflow                                                                                                                                                                                                                                                                   |
| Existing engines | New DOCX, XLSX, PPTX and TXT exported through the mobile save-as flow; Office results contain ZIP package bytes                                                                                                                                                                                                                                                                     |
| Unit/bridge      | Ordered draft writes and failure retry; PDF page organization retains form values/widget references; signatures embedded at four page rotations; iOS final receipts, failure, source metadata, chunk integrity and batch sharing; existing iOS service shim                                                                                                                         |
| Android          | Debug APK compiled; API 35 emulator selected a real DocumentsUI file, wrote the original, rejected an external modification, retained the draft after real picker cancellation, and opened the real share sheet without choosing a recipient                                                                                                                                        |
| iOS              | Simulator debug app compiled; a separate iPhone 17 / iOS 26.5 QA simulator opened a real Files-picker document, accepted typed edits, wrote the original, retained edits after save-as/share cancellation, and rejected an external modification                                                                                                                                    |
| HarmonyOS        | ArkTS/native bridge compiled into an unsigned HAP; no HarmonyOS device was connected                                                                                                                                                                                                                                                                                                |

Reproducible tests:

```sh
node --test scripts/tests/draft-write-queue.test.cjs scripts/tests/mobile-pdf.test.cjs
node apps/ios/tests/files.cjs
node apps/ios/tests/services.cjs
ANDROID_PREVIEW_URL='http://127.0.0.1:5198/?platform=android' node apps/android/tests/file-workspace.cjs
ANDROID_PREVIEW_URL='http://127.0.0.1:5198/?platform=android' node apps/android/tests/format-exports.cjs
ANDROID_PREVIEW_URL='http://127.0.0.1:5198/?platform=android' node apps/android/tests/library-layout.cjs
npx playwright install android
node apps/android/tests/native-files.cjs
```

Native Android tests require an installed debug build and an emulator (default
`emulator-5554`); they create uniquely named synthetic Markdown files in Downloads.
Builds use the repository's prepared, pinned offline font assets. The new Chinese
PDF fallback packages the existing Noto Sans SC font and its OFL license locally.

## Remaining validation limits

Physical-device Chinese IME composition, clipboard integration, VoiceOver/TalkBack,
large system font settings, low-memory devices and third-party/cloud providers
need a hardware pass. No physical printer job was sent. HarmonyOS sharing, printing
and provider writeback are compile-checked only. The iPhone simulator test used
actual typed input; it is not evidence for physical-device paste or IME behavior.

No new attachment formats, version bump, signed release or publication is included.
