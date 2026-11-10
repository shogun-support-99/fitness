plugins {
    id("com.android.application")
}

/*
 * IronLog Android shell.
 *
 * The web app is not fetched at runtime. The same `app/` tree the browser uses
 * is bundled into the APK as assets, and MainActivity serves it from a stable
 * HTTPS origin backed by WebViewClient interception. That gives the app
 * working ES modules, fetch() and localStorage with no server at all.
 */

val appVersionCode = (providers.gradleProperty("ironlogVersionCode").orNull ?: "1").toInt()
val appVersionName = providers.gradleProperty("ironlogVersionName").orNull ?: "1.0.0"

/*
 * Stage the web app into the APK assets.
 *
 * MainActivity serves the shell from https://appassets.androidplatform.net/app/
 * and resolves the site's own relative references from there, so `./js/main.js`
 * becomes `/app/js/main.js`, `../assets/css/tailwind.css` becomes
 * `/assets/css/tailwind.css` and `../fonts/Geist-Variable.woff2` becomes
 * `/fonts/...`. The three source trees therefore have to be staged under those
 * exact prefix directories; pointing sourceSets straight at them would strip the
 * prefixes and every CSS, font and image request would 404 inside the APK.
 *
 * The wiring has to satisfy two masters at once. AGP must treat the staged
 * directory as an asset root, *and* the task that fills it has to run first.
 * Handing AGP a task, a directory provider or a file collection does not do
 * that: it flattens each one to a bare location, so a clean checkout packages a
 * directory that does not exist yet and the build succeeds with an empty web
 * app. Declaring the relationship by hand is no better either — Gradle rejects
 * the build when an unowned output turns up, or drops the declaration on the
 * floor.
 *
 * The way out is to stage into `src/main/assets`, the main source set's own
 * assets directory, which AGP always reads and never has to be told about, and
 * to hang the staging off `preBuild`, the one task every variant task depends
 * on. Nothing here is inferred from the repository: the staged tree is
 * generated at build time from ../app, ../assets and ../fonts, and it is
 * gitignored, so a fresh clone has no `src/main/assets` at all.
 *
 * Declared before the `android` block because Kotlin DSL scripts initialise
 * top-level properties in declaration order.
 */
val syncWebAssets = tasks.register<Sync>("syncWebAssets") {
    description = "Stages the offline web app into the APK assets."
    group = "build"
    from(rootProject.file("../app")) {
        into("app")
    }
    from(rootProject.file("../assets")) {
        into("assets")
    }
    from(rootProject.file("../fonts")) {
        into("fonts")
    }
    into(layout.projectDirectory.dir("src/main/assets"))
}

// preBuild is the ancestor of every task in every variant's chain, so the
// staged tree is complete before anything merges, lints or packages assets.
tasks.configureEach {
    if (name == "preBuild") {
        dependsOn(syncWebAssets)
    }
}

android {
    namespace = "com.ironlog.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ironlog.app"
        minSdk = 26
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersionName
        resourceConfigurations += listOf("en")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            val envPath = System.getenv("IRONLOG_KEYSTORE")
            storeFile = if (!envPath.isNullOrBlank()) file(envPath) else rootProject.file("keystore/ironlog-release.p12")
            storePassword = System.getenv("IRONLOG_STORE_PASSWORD") ?: "IronLog-2026-Release-7f3c9a2e6b1d4c58"
            keyAlias = System.getenv("IRONLOG_KEY_ALIAS") ?: "ironlog"
            keyPassword = System.getenv("IRONLOG_KEY_PASSWORD")
                ?: System.getenv("IRONLOG_STORE_PASSWORD")
                ?: "IronLog-2026-Release-7f3c9a2e6b1d4c58"
            storeType = "PKCS12"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    /*
     * The web app is already minified where it matters, and bundling 130 MB of
     * licensed GIF demonstrations means an APK in the 130-140 MB range. Keeping
     * asset compression on preserves a smaller download; the files are read
     * straight from the APK by AssetManager.
     */
    androidResources {
        noCompress += listOf("woff2")
    }
}
