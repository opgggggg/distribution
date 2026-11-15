# macOS image services

This helper provides the same Apple Vision foreground segmentation and guided
edge refinement used by Compositor, plus ImageIO decoding for HEIC and other
native formats. It requires macOS 14 or later. Images are processed locally.
`SubjectRemoval.swift` and `GuidedMatte.swift` come from Compositor a19db90;
their MIT license is preserved in `COMPOSITOR-LICENSE`. Other package code keeps
its existing license.

Build on the target Mac:

```sh
npm run build:native -w @cubexp/psd
```

The result is `native/bin/psd-images`. It accepts one JSON request per stdin line
and returns one JSON response per stdout line. Request fields are `operation`
(`decode` or `foreground`), `data` (base64 encoded image), and optional
`advanced`, `refineEdges`, `shiftEdge`, `contrast`. Responses contain either
`data` (base64 PNG) or `error`. Repeated input reuses the Vision mask; slider
changes only recompute refinement. Input limits: 48 MiB and 80 megapixels.

For a local Vite host:

```js
import { psdNativeImages } from "@cubexp/psd/native/vite-plugin";
// Add to Vite plugins. Supply the absolute path to the compiled helper.
psdNativeImages({ executable: "/absolute/path/to/native/bin/psd-images" });
```

Pass `createPsdNativeImageServices()` from `@cubexp/psd/vue` as the
`imageServices` prop of `PsdEditor` or `PsdWorkspace`. The default route is
`/__psd/native`. This middleware is for development. CubeOffice packages the helper through
`scripts/prepare-ofd-host.mjs` and the macOS Tauri external-binary catalog.
`packages/psd-host/src/desktop-contribution.ts` supplies `PsdImageServices` via
trusted binary upload and chunked profile-service IPC, without an HTTP listener.
Other hosts can use `createPsdImageServicesFromTransport` with their own IPC. The shared artifact contribution reads the
host service named `psdImageServices`. Without that service, TIFF remains
available through UTIF, while HEIC depends on browser decoding and Remove
Background reports that a service is needed. Windows/Linux require another
foreground segmentation provider implementing the same interface.

Verified locally on Apple silicon: Swift release compilation, HEIC decode,
foreground detection, no-subject error, advanced refinement, and editor mask
preview/apply/undo. Public test image: scikit-image v0.22.0 `astronaut.png`
(NASA / Eileen Collins), converted to HEIC using ImageIO. The test asset is not
included in the package.
