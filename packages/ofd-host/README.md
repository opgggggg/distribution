# CubeOffice OFD host

Distribution-owned Vue integration and an isolated Rust document service for the
CubeOffice desktop profile. The upstream desktop supplies the generic sidecar
bridge; the OFD package remains usable independently.

The service reads immutable document snapshots, verifies reference digests and
CMS/SES signatures, checks system or explicitly imported application CA anchors,
and reports revocation and timestamp results separately. Importing a CA does not
modify the OS trust store. An embedded certificate is not automatically trusted.
Offline or inconclusive revocation is reported as unknown; historical/LTV trust
is not guaranteed.

Export authorization and print quotas are checked by the native service. Printing
uses the default system printer. A job with uncertain submission status retains
its reserved quota to avoid duplicate printing. Capture protection depends on
platform support and cannot guarantee prevention of screenshots.

## Media

Default builds play recognized common media directly in the WebView and do not
bundle FFmpeg. Playback support depends on the OS/WebView codecs. Optional
transcoding can be included at build time with `CUBEOFFICE_BUNDLE_MEDIA=1`.
`node scripts/prepare-ofd-host.mjs --debug --with-media` prepares the service and
optional engines. The pinned source recipe lives in `media/build-media.mjs`.
Cross builds require `CUBEOFFICE_MEDIA_DIR` and `CUBEOFFICE_MEDIA_SOURCE_DIR` for
the target. Optional codec builds include corresponding sources and licenses;
AVS2 support is the upstream davs2 8-bit profile, AVS3 uses a portable 8/10-bit build.

## Validation

From the distribution root:

```sh
npm run check:types -w @cubexp/ofd-host
npm test -w @cubexp/ofd-host
npm run test:native -w @cubexp/ofd-host
```

Native tests generate certificates and documents locally, and never modify system
trust or submit physical print jobs. Windows/Linux runtime behavior and physical
printing require validation on those platforms before a binary release.
