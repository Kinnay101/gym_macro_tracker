import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// Signier-Schlüssel für Release-Builds: liegt NICHT im Repo/OneDrive, sondern unter %USERPROFILE%\.gym-macro-signing\
// (keystore.properties mit storeFile, storePassword, keyAlias, keyPassword). Ohne die Datei: Release unsigniert.
val signingProps = file("${System.getProperty("user.home")}/.gym-macro-signing/keystore.properties")
    .takeIf { it.exists() }
    ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }

android {
    namespace = "io.github.kinnay101.gymmacro"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "io.github.kinnay101.gymmacro"
        minSdk = 28 // Health Connect gibt es ab Android 9
        targetSdk = 37
        versionCode = 7
        versionName = "1.6"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (signingProps != null) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            if (signingProps != null) signingConfig = signingConfigs.getByName("release")
            // Keine R8-Optimierung: Die Vorlage (nur androidx/kotlin optimieren) liess die App beim Start abstürzen
            // (IllegalAccessError in kotlin.collections). Die App ist klein, die Grösse spielt keine Rolle.
            optimization {
                enable = false
            }
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.health.connect)
    implementation(libs.androidx.webkit)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}