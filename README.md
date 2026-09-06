# AuroraPrime Office Distribution

Platform distribution shells for AuroraPrime Office:

- `apps/harmony`: HarmonyOS application and the shared mobile Web host.
- `apps/android`: Android WebView application that packages the shared mobile host.
- `als-office`: pinned upstream editor engine dependency.

The dependency direction is intentionally one-way: this repository consumes
`als-office`; the `als-office` repository does not contain or reference these
distribution applications.

## Checkout

```sh
git clone --recurse-submodules https://github.com/opgggggg/distribution.git
cd distribution
npm ci
```

The build preparation step links the pinned upstream checkout to the root npm
installation. This keeps a single dependency tree while satisfying upstream
build tools that resolve assets relative to `als-office/node_modules`.

For an existing checkout:

```sh
git submodule update --init --recursive
```

Access to the upstream `als-office` GitLab repository is required to initialize
the pinned submodule.

## App profiles

Application identity is defined once in `profiles/<profile>/app.json`. The profile contains
the display name, HarmonyOS bundle name / Android application ID, vendor, version, URL
scheme, and icon path. HarmonyOS defaults to `profiles/default/`; Android defaults to
the CubeOffice desktop identity and icon in `profiles/cubeoffice/`. An explicit
`APP_PROFILE` overrides either default.

The normal npm builds synchronize the selected profile automatically. To prepare the
HarmonyOS project before opening or building it directly in DevEco Studio, run:

```sh
npm run profile:sync
```

To build another distribution, copy `profiles/default`, edit its `app.json` and `icon.png`,
then select it with `APP_PROFILE`:

```sh
APP_PROFILE=customer npm run profile:sync
APP_PROFILE=customer npm run build:android
```

The sync step generates the HarmonyOS application metadata/resources and the Web-shell
profile. Android Gradle reads the selected profile directly and generates its icon resource.

## Build targets

Build the shared HarmonyOS/mobile Web payload:

```sh
npm run build:web
```

Build the Android debug APK after configuring the Android SDK:

```sh
npm run build:android
```

Open `apps/harmony` in DevEco Studio to build or run the HarmonyOS application.
