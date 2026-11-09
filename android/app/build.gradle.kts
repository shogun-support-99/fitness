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

android {
    namespace = "com.ironlog.app"
    compileSdk = 35

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

    sourceSets {
        getByName("main") {
            assets {
                srcDir(rootProject.file("../app"))
                srcDir(rootProject.file("../assets/css"))
                srcDir(rootProject.file("../assets/img"))
                srcDir(rootProject.file("../fonts"))
            }
        }
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
