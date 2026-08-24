plugins {
	id("com.android.application")
}

android {
	namespace = "com.yaochn.auroraprimeoffice"
	compileSdk = 35

	defaultConfig {
		applicationId = "com.yaochn.auroraprimeoffice"
		minSdk = 26
		targetSdk = 35
		versionCode = 10000
		versionName = "0.1.0"
	}

	buildTypes {
		release {
			isMinifyEnabled = false
			proguardFiles(
				getDefaultProguardFile("proguard-android-optimize.txt"),
				"proguard-rules.pro",
			)
		}
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}
}

val syncMobileWeb by tasks.registering(Exec::class) {
	workingDir(rootProject.projectDir)
	commandLine("node", "scripts/sync-web.mjs")
}

tasks.named("preBuild").configure {
	dependsOn(syncMobileWeb)
}
