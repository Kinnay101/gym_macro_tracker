// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
}

// Build-Ausgabe nicht in OneDrive (sonst werden Hunderte MB synchronisiert), sondern lokal unter AppData
val localBuildRoot = System.getenv("LOCALAPPDATA")?.let { file("$it/gmt-android-build") }
if (localBuildRoot != null) {
    allprojects {
        layout.buildDirectory.set(File(localBuildRoot, project.name))
    }
}
