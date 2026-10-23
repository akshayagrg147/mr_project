package com.mrconnect.field

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FieldJourneyTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun representativeCanNavigateAndRecordARealVisit() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repo = Repository(context, false)
        runBlocking {
            repo.vault.baseUrl = "http://10.0.2.2:4000"
            repo.login("VIDYA", "aman@mrconnect.test", "Demo-only-2026!")
        }
        val before = runBlocking {
            repo.request("GET", "/records/visit").getJSONArray("items").length()
        }
        val vm = FieldViewModel(context.applicationContext as Application)
        runBlocking { vm.refresh() }
        vm.screen = "home"
        vm.locked = false
        rule.setContent { FieldTheme { FieldApp(vm) } }
        rule.waitUntil(15000) { !vm.busy && vm.boot != null }
        rule.onNodeWithText("Good day, Aman").assertIsDisplayed()
        rule
            .onRoot()
            .captureToImage()
            .asAndroidBitmap()
            .compress(
                android.graphics.Bitmap.CompressFormat.PNG,
                100,
                File(context.filesDir, "qa-home.png").outputStream(),
            )
        rule.onNodeWithText("Calls", useUnmergedTree = true).performClick()
        rule.onAllNodesWithText("View customer")[0].performScrollTo().performClick()
        rule.onNodeWithText("Record doctor call").performScrollTo().performClick()
        rule.onAllNodes(hasSetTextAction())[0].performTextInput("Emulator UI test customer visit")
        rule
            .onAllNodes(hasSetTextAction())[1]
            .performTextInput("Emulator acceptance test; no physical GPS evidence")
        rule.onNodeWithText("Next: products").performScrollTo().performClick()
        rule.onNodeWithText("Next: samples & business").performScrollTo().performClick()
        rule.onNodeWithText("Save visit").performScrollTo().performClick()
        rule.waitUntil(15000) { !vm.busy && vm.screen == "calls" }
        Assert.assertTrue(vm.error, vm.error.isEmpty())
        val after = runBlocking {
            repo.request("GET", "/records/visit").getJSONArray("items").length()
        }
        Assert.assertEquals(before + 1, after)
        rule.onNodeWithText("Today’s visits").assertIsDisplayed()
    }

    @Test
    fun foregroundLocationServiceContinuesAfterActivityMovesToBackground() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        for (permission in
            listOf(
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.POST_NOTIFICATIONS",
            )) instrumentation.uiAutomation
            .executeShellCommand("pm grant ${context.packageName} $permission")
            .close()
        instrumentation.uiAutomation
            .executeShellCommand("appops set ${context.packageName} android:mock_location allow")
            .close()
        instrumentation.uiAutomation
            .executeShellCommand("cmd location set-location-enabled true")
            .close()
        val repo = Repository(context, false)
        runBlocking {
            repo.vault.baseUrl = "http://10.0.2.2:4000"
            repo.login("VIDYA", "aman@mrconnect.test", "Demo-only-2026!")
            val active = repo.request("GET", "/shifts/active").optJSONObject("shift")
            if (active != null)
                repo.request("POST", "/shifts/${active.getString("id")}/end", org.json.JSONObject())
            repo.vault.shift = ""
        }
        val admin = Repository(context, false)
        val priorToken = repo.vault.token
        runBlocking {
            val login =
                admin.request(
                    "POST",
                    "/auth/login",
                    org.json
                        .JSONObject()
                        .put("companyCode", "VIDYA")
                        .put("email", "admin@mrconnect.test")
                        .put("password", "Demo-only-2026!")
                        .put("client", "android"),
                )
            val policies =
                admin
                    .request("GET", "/policies", sessionToken = login.getString("token"))
                    .getJSONObject("policies")
            policies.put("trackingIntervalSeconds", 15)
            admin.request("PUT", "/policies", policies, sessionToken = login.getString("token"))
        }
        val vm = FieldViewModel(context.applicationContext as Application)
        runBlocking { vm.refresh() }
        vm.screen = "home"
        vm.locked = false
        rule.setContent { FieldTheme { FieldApp(vm) } }
        rule.waitUntil(15000) { !vm.busy }
        rule.onNodeWithText("Start work shift").performScrollTo().performClick()
        rule.waitUntil(15000) { !vm.busy && repo.vault.shift.isNotEmpty() }
        Assert.assertTrue(vm.error, vm.error.isEmpty())
        val shiftId = repo.vault.shift
        val manager = context.getSystemService(android.location.LocationManager::class.java)
        @Suppress("DEPRECATION")
        fun inject(latitude: Double) {
            manager.setTestProviderLocation(
                android.location.LocationManager.GPS_PROVIDER,
                android.location.Location(android.location.LocationManager.GPS_PROVIDER).apply {
                    this.latitude = latitude
                    longitude = 77.24
                    accuracy = 5f
                    time = System.currentTimeMillis()
                    elapsedRealtimeNanos = android.os.SystemClock.elapsedRealtimeNanos()
                },
            )
        }
        @Suppress("DEPRECATION")
        manager.addTestProvider(
            android.location.LocationManager.GPS_PROVIDER,
            false,
            false,
            false,
            false,
            true,
            true,
            true,
            android.location.Criteria.POWER_LOW,
            android.location.Criteria.ACCURACY_FINE,
        )
        manager.setTestProviderEnabled(android.location.LocationManager.GPS_PROVIDER, true)
        try {
            Thread.sleep(700)
            inject(28.65)
            rule.waitUntil(20000) {
                Thread.sleep(400)
                runBlocking {
                    repo
                        .request("GET", "/tracking/aman?date=" + localDate())
                        .array("points")
                        .count { it.text("shift_id") == shiftId } >= 1
                }
            }
            rule.runOnUiThread { rule.activity.moveTaskToBack(true) }
            Thread.sleep(16000)
            inject(28.651)
            rule.waitUntil(20000) {
                Thread.sleep(400)
                runBlocking {
                    repo
                        .request("GET", "/tracking/aman?date=" + localDate())
                        .array("points")
                        .count { it.text("shift_id") == shiftId } >= 2
                }
            }
            val evidence = runBlocking { repo.request("GET", "/tracking/aman?date=" + localDate()) }
            Assert.assertTrue(
                evidence
                    .getJSONArray("points")
                    .getJSONObject(evidence.getJSONArray("points").length() - 1)
                    .optInt("mocked") == 1
            )
            rule.runOnUiThread { vm.endShift() }
            rule.waitUntil(15000) { !vm.busy && repo.vault.shift.isEmpty() }
            Assert.assertEquals(
                "ended",
                runBlocking { repo.request("GET", "/tracking/aman?date=" + localDate()) }
                    .getString("state"),
            )
        } finally {
            manager.removeTestProvider(android.location.LocationManager.GPS_PROVIDER)
            context.stopService(android.content.Intent(context, TrackingService::class.java))
            repo.vault.shift = ""
            runBlocking {
                try {
                    val active = repo.request("GET", "/shifts/active").optJSONObject("shift")
                    if (active != null)
                        repo.request(
                            "POST",
                            "/shifts/${active.getString("id")}/end",
                            org.json.JSONObject(),
                        )
                } catch (_: Exception) {}
            }
        }
    }
}
