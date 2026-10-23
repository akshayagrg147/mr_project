package com.mrconnect.field

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.*
import org.json.*

@Composable
fun SyncCenter(vm: FieldViewModel) {
    val entries = remember(vm.localVersion) { vm.repo.db.pending(vm.repo.owner) }
    var discard by remember { mutableStateOf<JSONObject?>(null) }
    Message(
        "${entries.size} operations saved on this phone. Uploads run in order and are deduplicated by the server."
    )
    Primary("Sync now", !vm.busy) { vm.sync() }
    if (entries.isEmpty())
        FieldCard {
            Text("Everything is up to date", style = MaterialTheme.typography.titleLarge)
            Text("Your saved work has reached the company server.", color = Muted)
        }
    entries.forEach { op ->
        FieldCard {
            Text(
                when {
                    op.text("path").contains("points") -> "Location evidence"
                    op.text("path").contains("shift") -> "Work shift update"
                    op.text("path") == "/visits" -> "Customer visit"
                    op.text("method") == "UPLOAD" -> "Receipt / presentation upload"
                    else -> "Saved record"
                },
                style = MaterialTheme.typography.titleMedium,
            )
            Text(op.text("status").replace('_', ' '), color = Brand)
            if (op.text("error").isNotEmpty()) Message(op.text("error"), true)
            val body = JSONObject(op.text("body", "{}"))
            (body.optJSONObject("data") ?: body).let { data ->
                listOf("date", "remarks", "notes", "amount").forEach { key ->
                    if (data.has(key))
                        Text(
                            "$key: " + data.text(key),
                            color = Muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                }
            }
            if (op.text("status") != "pending") {
                Secondary("Retry saved operation") {
                    vm.repo.db.mark(op.text("id"), "pending", "")
                    vm.sync()
                }
                if (op.text("path").startsWith("/record/") && !op.text("path").endsWith("/submit"))
                    Secondary("Review latest record & correct") {
                        vm.work {
                            val record =
                                vm.repo.request("GET", op.text("path")).getJSONObject("item")
                            vm.conflictServer = JSONObject(record.toString())
                            val local = body.optJSONObject("data") ?: JSONObject()
                            local.keys().forEach { record.put(it, local.opt(it)) }
                            vm.edit(record, op.text("id"))
                        }
                    }
                Secondary("Discard saved operation") { discard = op }
            }
        }
    }
    if (discard != null)
        AlertDialog(
            onDismissRequest = { discard = null },
            title = { Text("Discard unsynced work?") },
            text = {
                Text(
                    "This saved operation will be removed from this phone. Dependent records may need to be corrected before they can sync."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.repo.db.remove(discard!!.text("id"))
                        discard = null
                        vm.localVersion++
                        vm.sync()
                    }
                ) {
                    Text("Discard")
                }
            },
            dismissButton = { TextButton(onClick = { discard = null }) { Text("Keep") } },
        )
}

@Composable
fun AccountScreen(vm: FieldViewModel) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    FieldCard {
        Text(vm.user.text("name"), style = MaterialTheme.typography.titleLarge)
        Text(vm.user.text("email"), color = Muted)
        Text(vm.user.text("role"), color = Brand)
    }
    var hindi by remember { mutableStateOf(vm.repo.vault.hindi) }
    Row {
        Switch(
            checked = hindi,
            onCheckedChange = {
                hindi = it
                vm.repo.vault.hindi = it
                vm.localVersion++
            },
        )
        Text("Hindi home example / हिंदी होम", Modifier.padding(12.dp))
    }
    Message(
        "The Hindi home is a localization example. The remaining field workflows currently use English."
    )
    Text("Local app PIN", style = MaterialTheme.typography.titleMedium)
    Entry("New six-digit PIN", pin, { pin = it }, password = true, number = true)
    Secondary("Set app PIN") {
        if (!Regex("\\d{6}").matches(pin)) vm.error = "Use exactly six digits"
        else {
            vm.repo.vault.pinHash = vm.repo.vault.digest(pin)
            pin = ""
            vm.message = "App PIN enabled"
        }
    }
    if (vm.repo.vault.pinHash.isNotEmpty()) Secondary("Lock app now") { vm.locked = true }
    Text("Change company password", style = MaterialTheme.typography.titleMedium)
    Entry("Current password", current, { current = it }, password = true)
    Entry("New password (12+ characters)", next, { next = it }, password = true)
    Primary("Change password & sign out", !vm.busy) { vm.password(current, next) }
    Secondary("Permissions & location status") { vm.navigate("permissions") }
    Secondary("Sign out") { vm.logout() }
}

@Composable
fun Unlock(vm: FieldViewModel) {
    var pin by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Unlock your workspace", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(24.dp))
        Entry("App PIN", pin, { pin = it }, password = true, number = true)
        Spacer(Modifier.height(16.dp))
        if (vm.repo.vault.pinAttempts >= 5) {
            Message("PIN attempts exceeded. Sign in again with your company password.", true)
            Primary("Use company sign-in") {
                vm.locked = false
                vm.repo.vault.token = ""
                vm.screen = "login"
            }
        } else
            Primary("Unlock") {
                if (vm.repo.vault.digest(pin) == vm.repo.vault.pinHash) {
                    vm.repo.vault.pinAttempts = 0
                    vm.locked = false
                } else {
                    vm.repo.vault.pinAttempts++
                    pin = ""
                    vm.error = "Incorrect PIN"
                }
            }
        if (vm.error.isNotEmpty()) Message(vm.error, true)
    }
}

@Composable
fun ReportsScreen(vm: FieldViewModel) {
    val visits = vm.records("visit").filter { it.text("ownerId") == vm.user.text("id") }
    val customers = vm.records("customer").filter { it.text("assignedTo") == vm.user.text("id") }
    FieldCard {
        Text("My performance", style = MaterialTheme.typography.titleLarge)
        Text("Recorded calls: ${visits.size}")
        Text(
            "Unique customers: ${visits.map{it.text("customerId")}.toSet().size} / ${customers.size}"
        )
        Text("POB: " + rupees(visits.sumOf { it.optDouble("orderTotal", 0.0) }))
        Text("GPS verified: ${visits.count{it.optBoolean("verified")}}", color = Brand)
    }
    listOf(
            "dcr" to "Daily reports",
            "expense" to "Expense statement",
            "sale" to "Secondary & doctor-wise sales",
            "rcpa" to "RCPA observations",
            "reminder" to "Pending reminders",
            "tourplan" to "Tour plan status",
        )
        .forEach { (key, title) -> Secondary(title) { vm.navigate("module/$key") } }
    Text(
        "These totals use the records currently synced to this phone.",
        style = MaterialTheme.typography.bodyMedium,
        color = Muted,
    )
}

@Composable
fun PermissionsScreen(vm: FieldViewModel, capture: () -> Unit) {
    val context = LocalContext.current
    val precise =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    val always =
        Build.VERSION.SDK_INT < 29 ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED
    val manager = context.getSystemService(LocationManager::class.java)
    FieldCard {
        Text("Location status", style = MaterialTheme.typography.titleLarge)
        Text("Precise permission: " + if (precise) "Granted" else "Required")
        Text("Background permission: " + if (always) "Granted" else "Not granted")
        Text(
            "Device location: " +
                if (
                    (if (Build.VERSION.SDK_INT >= 28) manager.isLocationEnabled
                    else
                        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                )
                    "Enabled"
                else "Disabled"
        )
        Text("Shift: " + if (vm.repo.vault.shift.isEmpty()) "Off" else "Active", color = Brand)
    }
    Message(
        "Location is shared with your company during the work shift, including when the app is minimized or the screen is locked. A visible notification indicates tracking. You can end the shift in Today. Background permission helps recovery after reboot; Android Force Stop can still stop an ordinary app."
    )
    Secondary("Capture current location", !vm.busy, capture)
    Secondary("Open app permission settings") {
        context.startActivity(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:" + context.packageName),
            )
        )
    }
    Secondary("Open device location settings") {
        context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
    }
    Text(
        "For a managed company phone, your administrator configures the approved battery and device policies.",
        color = Muted,
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Suppress("MissingPermission")
suspend fun currentFix(context: Context): JSONObject =
    withTimeout(25000) {
        val manager = context.getSystemService(LocationManager::class.java)
        require(
            (if (Build.VERSION.SDK_INT >= 28) manager.isLocationEnabled
            else
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
        ) {
            "Device location is disabled"
        }
        require(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        ) {
            "Precise location permission is required"
        }
        val provider =
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER))
                LocationManager.GPS_PROVIDER
            else LocationManager.NETWORK_PROVIDER
        val location =
            suspendCancellableCoroutine<Location> { cont ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val signal = CancellationSignal()
                    cont.invokeOnCancellation { signal.cancel() }
                    manager.getCurrentLocation(provider, signal, context.mainExecutor) { loc ->
                        if (cont.isActive) {
                            if (loc != null) cont.resume(loc)
                            else
                                cont.resumeWithException(
                                    IllegalStateException(
                                        "No location fix. Move outdoors and try again."
                                    )
                                )
                        }
                    }
                } else {
                    val listener =
                        object : LocationListener {
                            override fun onLocationChanged(loc: Location) {
                                manager.removeUpdates(this)
                                if (cont.isActive) cont.resume(loc)
                            }
                        }
                    manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                    cont.invokeOnCancellation { manager.removeUpdates(listener) }
                }
            }
        JSONObject()
            .put("latitude", location.latitude)
            .put("longitude", location.longitude)
            .put("accuracy", location.accuracy.toDouble())
            .put("observedAt", Instant.ofEpochMilli(location.time).toString())
            .put(
                "mocked",
                if (Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider,
            )
    }
