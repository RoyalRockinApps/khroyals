// app.json holds the settings every school's app shares; this adjusts them at build time.
//
// 0. The school (SCHOOL, see schools/index.js; Kingdom Heights when unset): its
//    schools/<id>/app.json goes on top (name, app IDs, link scheme, icons, web
//    address, its own Supabase project), and the permission prompts name its app.
//
// 1. Developers can sign iPhone builds with their own Apple team under a
//    separate app ID, so the real ID (com.khroyals.app) stays free for whoever
//    publishes the app:
//      APPLE_TEAM_ID=XXXXXXXXXX IOS_BUNDLE_ID=com.khroyals.app.dev npx expo prebuild --platform ios --clean
//    With neither variable set (CI, the web build, everyone else) nothing changes.
//    IOS_BUILD_NUMBER sets the iPhone build number; every TestFlight upload needs
//    a new one (scripts/testflight.sh uses the date and time).
//    Critical alerts break through Focus modes as Time Sensitive notifications. Once
//    Apple grants the Critical Alerts entitlement, build with
//    CRITICAL_ALERTS_ENTITLEMENT=1 so they ring on silent too (signing fails without it).
//
// 3. The version is 1.<build>, where <build> is the pipeline's build number (APP_BUILD_NUMBER, the
//    Android APK workflow's run number; the web app's workflow gives its own). Android's versionCode
//    and the iPhone build number are the same number, so every build is newer than the last. Builds
//    outside the pipeline are 1.0. The iPhone app stays version 1.0 (ios.version): Apple reviews every
//    new version before TestFlight's outside testers get it, but passes new builds of a version it has
//    reviewed at once. Its build number still counts up (scripts/testflight.sh: the date and time).
//
// 2. The web app is served from /khroyals (experiments.baseUrl), but iPhone
//    release builds must not use that prefix: Xcode's bundling step
//    (`expo export:embed --platform ios`) would copy images into
//    KHRoyals.app/khroyals/…, which collides with the KHRoyals program file on
//    the Mac's case-insensitive disk. Expo doesn't support baseUrl in native
//    release bundles anyway.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { schoolDir, schoolId } = require('./schools');

const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
/** `over` on top of `base`, object by object (arrays and values replace). */
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObject(v) && isObject(base?.[k]) ? merge(base[k], v) : v;
  return out;
}
/** Every string in the plugins' settings (permission prompts) with {appName} as this school's app name. */
const renamePlugins = (plugins, name) => JSON.parse(JSON.stringify(plugins).split('{appName}').join(name));

/** The shared settings with the school's on top. */
function forSchool(config, env = process.env) {
  const school = JSON.parse(readFileSync(join(schoolDir(schoolId(env)), 'app.json'), 'utf8')).expo;
  const out = merge(config, school);
  out.plugins = renamePlugins(config.plugins ?? [], school.name);
  return out;
}

/** The platform being bundled into a native release build, or null. */
function embeddingPlatform(argv = process.argv) {
  if (!argv.includes('export:embed')) return null;
  const i = argv.indexOf('--platform');
  if (i >= 0) return argv[i + 1] ?? null;
  return argv.find((a) => a.startsWith('--platform='))?.split('=')[1] ?? null;
}

/** The pipeline's build number (APP_BUILD_NUMBER), or null outside it. */
function buildNumber(env = process.env) {
  const n = Number(env.APP_BUILD_NUMBER);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = ({ config: shared }) => {
  const config = forSchool(shared);
  const build = buildNumber();
  const { baseUrl, ...experiments } = config.experiments ?? {};
  return {
    ...config,
    version: `1.${build ?? 0}`,
    android: { ...config.android, versionCode: build ?? 1 },
    extra: { ...config.extra, buildNumber: build },
    experiments: embeddingPlatform() === 'ios' ? experiments : config.experiments,
    ios: {
      ...config.ios,
      version: '1.0',
      ...(process.env.IOS_BUNDLE_ID ? { bundleIdentifier: process.env.IOS_BUNDLE_ID } : {}),
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
      ...(process.env.IOS_BUILD_NUMBER ? { buildNumber: process.env.IOS_BUILD_NUMBER } : build ? { buildNumber: String(build) } : {}),
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.developer.usernotifications.time-sensitive': true,
        // Critical alert answers send the Wi-Fi access point the phone is on (the room, on the Alert map).
        'com.apple.developer.networking.wifi-info': true,
        ...(process.env.CRITICAL_ALERTS_ENTITLEMENT === '1' ? { 'com.apple.developer.usernotifications.critical-alerts': true } : {}),
      },
    },
  };
};
