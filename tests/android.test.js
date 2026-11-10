/**
 * Android release invariants.
 *
 * Guards the APK download surface on the landing page, the release asset
 * names the native update checker consumes, and the signing/manifest wiring
 * that keeps APK updates installable on top of existing installations.
 */

import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

const LANDING = path.join(root, "index.html");
const MANIFEST = path.join(root, "android/app/src/main/AndroidManifest.xml");
const APP_GRADLE = path.join(root, "android/app/build.gradle.kts");
const KEYSTORE = path.join(root, "android/keystore/ironlog-release.p12");
const KEYSTORE_README = path.join(root, "android/keystore/README.md");
const WORKFLOW = path.join(root, ".github/workflows/deploy.yml");
const GRADLE_WRAPPER = path.join(root, "android/gradle/wrapper/gradle-wrapper.properties");
const APK_URL = "https://github.com/shogun-support-99/fitness/releases/latest/download/ironlog.apk";
const VERSION_URL = "https://github.com/shogun-support-99/fitness/releases/latest/download/version.json";

async function read(name) {
  return readFile(name, "utf8");
}

test("landing page links the latest APK from GitHub Releases", async () => {
  const html = await read(LANDING);
  assert.ok(html.includes(APK_URL), "landing page must link the latest APK");
  assert.ok(
    html.includes('id="android"'),
    "landing page must expose an #android section",
  );
  assert.ok(
    html.includes("Download the APK"),
    "landing page must have an APK download button",
  );
});

test("Android section links releases listing and names the artifact", async () => {
  const html = await read(LANDING);
  assert.ok(
    html.includes("https://github.com/shogun-support-99/fitness/releases"),
    "landing page must link the releases page",
  );
  const css = await read(path.join(root, "assets/css/landing.css"));
  assert.ok(css.includes(".android-section"), "landing CSS must style the Android section");
});

test("Gradle stages the web app into the APK and wires the preBuild dependency", async () => {
  const gradle = await read(APP_GRADLE);
  // The Sync task copies app/, assets/ and fonts/ under those exact prefixes.
  assert.ok(gradle.includes('into("app")'), "asset staging must keep the app/ prefix");
  assert.ok(gradle.includes('into("assets")'), "asset staging must keep the assets/ prefix");
  assert.ok(gradle.includes('into("fonts")'), "asset staging must keep the fonts/ prefix");
  // Staging into the main source set's own assets directory is what makes AGP
  // read it at all: a generated source directory has to be paired with a task
  // dependency, and handing that to AGP either fails the build or is dropped.
  assert.ok(
    /into\(layout\.projectDirectory\.dir\("src\/main\/assets"\)\)/.test(gradle),
    "staging must write into the main source set's assets directory, which AGP always reads",
  );
  // Without this, a clean checkout runs the build with no src/main/assets at
  // all and ships an APK whose shell opens blank — a failure nothing reports.
  assert.ok(
    /tasks\.named\("preBuild"\)|tasks\.configureEach/.test(gradle) && /dependsOn\(syncWebAssets\)/.test(gradle),
    "preBuild must depend on syncWebAssets or the web app is never staged on a clean checkout",
  );
  assert.ok(
    /from\(rootProject\.file\("\.\.\/app"\)\)/.test(gradle)
      && /from\(rootProject\.file\("\.\.\/assets"\)\)/.test(gradle)
      && /from\(rootProject\.file\("\.\.\/fonts"\)\)/.test(gradle),
    "staging must read the three web roots that live outside the android/ module",
  );
});

test("CI fails the build when the APK does not contain the bundled web app", async () => {
  const workflow = await read(WORKFLOW);
  assert.ok(
    workflow.includes("APK is missing bundled asset"),
    "workflow must fail loudly when a bundled asset is absent from the APK",
  );
  assert.ok(
    workflow.includes("the exercise library and media did not ship"),
    "workflow must fail when the APK is far too small to contain the library",
  );
});

test("native update checker points at version.json release asset", async () => {
  const manifest = await read(MANIFEST);
  const main = await read(path.join(root, "android/app/src/main/java/com/ironlog/app/MainActivity.java"));
  assert.ok(main.includes(VERSION_URL), "MainActivity must check version.json from releases/latest/download");
  assert.ok(main.includes("releases/latest/download"), "update URL must target the latest release");
  assert.ok(
    main.includes("versionCode") && main.includes("versionName"),
    "MainActivity must parse versionCode and versionName",
  );
});

test("APK uses a stable signing config so updates install over existing installs", async () => {
  const gradle = await read(APP_GRADLE);
  assert.ok(gradle.includes("PKCS12"), "signing config must use PKCS12 store type");
  assert.ok(gradle.includes("ironlog-release.p12"), "signing config must reference the committed keystore");
  assert.ok(
    await accessExists(KEYSTORE),
    "release keystore must be present",
  );
  assert.ok(
    await accessExists(KEYSTORE_README),
    "keystore README with credentials/rotation policy must be present",
  );
});

test("Android manifest declares the launcher activity and offline-friendly permissions", async () => {
  const manifest = await read(MANIFEST);
  // AGP 8 forbids the package attribute in the source manifest; the app ID
  // lives in the Gradle namespace/applicationId instead.
  assert.ok(
    !manifest.includes("package="),
    "manifest must not set a package attribute (AGP 8 requires the namespace in build.gradle)",
  );
  const gradle = await read(APP_GRADLE);
  assert.ok(gradle.includes('applicationId = "com.ironlog.app"'), "build.gradle must set applicationId com.ironlog.app");
  assert.ok(gradle.includes('namespace = "com.ironlog.app"'), "build.gradle must set namespace com.ironlog.app");
  assert.ok(manifest.includes(".MainActivity"), "manifest must declare MainActivity");
  assert.ok(
    manifest.includes("android.permission.INTERNET"),
    "manifest must declare INTERNET (used only for the update check)",
  );
});

test("workflow builds, signs and releases the APK plus version.json", async () => {
  const workflow = await read(WORKFLOW);
  assert.ok(workflow.includes("android-build-release"), "workflow must define an Android build/release job");
  assert.ok(workflow.includes("assembleRelease"), "workflow must assemble a release APK");
  assert.ok(workflow.includes("ironlog.apk"), "workflow must stage ironlog.apk");
  assert.ok(workflow.includes("version.json"), "workflow must stage version.json");
  assert.ok(
    workflow.includes("ncipollo/release-action"),
    "workflow must publish a GitHub Release",
  );
  assert.ok(
    workflow.includes("rm -rf android"),
    "Pages deploy must exclude android/ so the keystore is never staged",
  );
  // setup-android (v3 and v4) crashes on the current ubuntu-latest runner
  // image; the job must drive the preinstalled SDK in $ANDROID_HOME directly.
  assert.ok(
    !workflow.includes("android-actions/setup-android"),
    "workflow must not use android-actions/setup-android; it fails on the current runner image",
  );
  assert.ok(
    !workflow.includes("gradle/actions/setup-gradle"),
    "workflow must not use gradle/actions/setup-gradle@v3; it is a Node 20 action that crashes on the current runner",
  );
  assert.ok(
    workflow.includes("sdkmanager") && workflow.includes("--licenses"),
    "workflow must accept SDK licenses from the preinstalled $ANDROID_HOME",
  );
  assert.ok(
    workflow.includes("platforms;android-34"),
    "workflow must install the android-34 platform the build compiles against",
  );
  assert.ok(
    /java-version: 17/.test(workflow),
    "workflow must build on JDK 17",
  );
});

test("workflow and wrapper agree on a Gradle version services.gradle.org still serves", async () => {
  const workflow = await read(WORKFLOW);
  const wrapper = await read(GRADLE_WRAPPER);
  const workflowVersion = /GRADLE_VERSION=([0-9.]+)/.exec(workflow)?.[1];
  const wrapperVersion = /gradle-([0-9.]+)-bin\.zip/.exec(wrapper)?.[1];
  assert.ok(workflowVersion, "workflow must pin a Gradle version");
  assert.ok(wrapperVersion, "wrapper must declare a Gradle distribution");
  assert.equal(
    workflowVersion,
    wrapperVersion,
    "workflow and wrapper must use the same Gradle version, or the two build paths diverge",
  );
  // Gradle withdrew 8.7.3 from services.gradle.org, which 404'd the CI download.
  assert.notEqual(
    wrapperVersion,
    "8.7.3",
    "Gradle 8.7.3 is no longer published; its distribution URL returns 404",
  );
});

test("workflow versions the APK from the CI run number", async () => {
  const gradle = await read(APP_GRADLE);
  const workflow = await read(WORKFLOW);
  assert.ok(gradle.includes("ironlogVersionCode"), "build.gradle must read versionCode from a property");
  assert.ok(gradle.includes("ironlogVersionName"), "build.gradle must read versionName from a property");
  assert.ok(
    workflow.includes("${{ github.run_number }}"),
    "workflow must pass the run number as versionCode/versionName",
  );
});

async function accessExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
