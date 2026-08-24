import groovy.json.JsonSlurper

plugins {
	id("com.android.application")
}

val appProfileName = providers.environmentVariable("APP_PROFILE").orElse("default").get()
require(appProfileName.matches(Regex("[A-Za-z0-9._-]+"))) {
	"Invalid APP_PROFILE: $appProfileName"
}
val repositoryRoot = rootProject.projectDir.parentFile.parentFile
val appProfileDirectory = repositoryRoot.resolve("profiles/$appProfileName")
val appProfileFile = appProfileDirectory.resolve("app.json")
@Suppress("UNCHECKED_CAST")
val appProfile = JsonSlurper().parse(appProfileFile) as Map<String, Any>
val appName = appProfile.getValue("name") as String
val appPackageName = appProfile.getValue("packageName") as String
val appVersionCode = (appProfile.getValue("versionCode") as Number).toInt()
val appVersionName = appProfile.getValue("versionName") as String
val appUrlScheme = appProfile.getValue("urlScheme") as String
val appIcon = appProfileDirectory.resolve(appProfile.getValue("icon") as String)

android {
	namespace = "com.yaochn.auroraprimeoffice"
	compileSdk = 35

	defaultConfig {
		applicationId = appPackageName
		minSdk = 26
		targetSdk = 35
		versionCode = appVersionCode
		versionName = appVersionName
		manifestPlaceholders["appUrlScheme"] = appUrlScheme
		resValue("string", "app_name", appName)
		resValue("string", "app_package", appPackageName)
		resValue("string", "app_url_scheme", appUrlScheme)
		resValue("string", "assistant_action", "$appPackageName.action.ASSISTANT")
		resValue("string", "assistant_category", "$appPackageName.category.ASSISTANT")
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

	sourceSets.named("main") {
		res.srcDir(layout.buildDirectory.dir("generated/app-profile/res"))
	}
}

val syncAppProfileResources by tasks.registering(Sync::class) {
	from(appIcon)
	into(layout.buildDirectory.dir("generated/app-profile/res/drawable-nodpi"))
	rename { "app_icon.png" }
	inputs.file(appProfileFile)
}

val syncMobileWeb by tasks.registering(Exec::class) {
	workingDir(rootProject.projectDir)
	commandLine("node", "scripts/sync-web.mjs")
}

tasks.named("preBuild").configure {
	dependsOn(syncAppProfileResources, syncMobileWeb)
}
