package com.mrconnect.field

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.*
import org.json.*

class FieldApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val constraints =
            Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork(
                "field-sync",
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(constraints)
                    .build(),
            )
        channels(this)
    }
}

fun channels(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
        NotificationChannel("tracking", "Work shift location", NotificationManager.IMPORTANCE_LOW)
    )
    manager.createNotificationChannel(
        NotificationChannel(
            "resume",
            "Tracking requires attention",
            NotificationManager.IMPORTANCE_DEFAULT,
        )
    )
}

fun trackingNotification(context: Context, text: String): Notification {
    val pending =
        PendingIntent.getActivity(
            context,
            1,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    return NotificationCompat.Builder(context, "tracking")
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("MR Connect · Work shift active")
        .setContentText(text)
        .setContentIntent(pending)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .build()
}

class TrackingService : Service(), LocationListener {
    private lateinit var repo: Repository
    private lateinit var locations: LocationManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeat: Job? = null
    private var lastStored = 0L
    private var interval = 60000L

    override fun onCreate() {
        super.onCreate()
        repo = Repository(this)
        locations = getSystemService(LocationManager::class.java)
        channels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (repo.vault.shift.isEmpty() || repo.vault.token.isEmpty()) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            attention("Location permission is required to resume tracking")
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            startForeground(
                41,
                trackingNotification(
                    this,
                    "Location is recorded during this shift. Tap to view or end shift.",
                ),
            )
            interval =
                (repo.cached()?.optJSONObject("policies")?.optLong("trackingIntervalSeconds", 60)
                    ?: 60) * 1000L
            locations.removeUpdates(this)
            if (locations.allProviders.contains(LocationManager.GPS_PROVIDER))
                locations.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    interval,
                    0f,
                    this,
                    Looper.getMainLooper(),
                )
            if (locations.allProviders.contains(LocationManager.NETWORK_PROVIDER))
                locations.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    interval,
                    0f,
                    this,
                    Looper.getMainLooper(),
                )
            event("service_started")
            heartbeat?.cancel()
            heartbeat = scope.launch {
                while (isActive) {
                    if (repo.vault.shift.isEmpty()) {
                        stopSelf()
                        break
                    }
                    if (
                        repo.vault.shiftStarted.isNotEmpty() &&
                            Instant.now().toEpochMilli() -
                                Instant.parse(repo.vault.shiftStarted).toEpochMilli() >
                                16 * 3600000L
                    ) {
                        val shift = repo.vault.shift
                        repo.db.enqueue(
                            repo.owner,
                            "POST",
                            "/shifts/$shift/end",
                            JSONObject().put("endedAt", Instant.now().toString()),
                        )
                        repo.vault.shift = ""
                        repo.schedule()
                        stopSelf()
                        break
                    }
                    repo.sync()
                    delay(60000)
                }
            }
        } catch (_: SecurityException) {
            attention("Location access changed. Open MR Connect to resume.")
            stopSelf()
        }
        return START_STICKY
    }

    override fun onLocationChanged(location: Location) {
        if (repo.vault.shift.isEmpty() || location.accuracy <= 0) return
        val elapsed = android.os.SystemClock.elapsedRealtime()
        if (elapsed - lastStored < interval / 2) return
        lastStored = elapsed
        val battery =
            getSystemService(BatteryManager::class.java)
                .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val mocked =
            if (Build.VERSION.SDK_INT >= 31) location.isMock
            else @Suppress("DEPRECATION") location.isFromMockProvider
        val point =
            JSONObject()
                .put("id", UUID.randomUUID().toString())
                .put("observedAt", Instant.ofEpochMilli(location.time).toString())
                .put("latitude", location.latitude)
                .put("longitude", location.longitude)
                .put("accuracy", location.accuracy.toDouble())
                .put("battery", battery.coerceIn(0, 100))
                .put("mocked", mocked)
        repo.db.cache(repo.owner, "location", point)
        repo.db.enqueue(
            repo.owner,
            "POST",
            "/shifts/${repo.vault.shift}/points",
            JSONObject().put("points", JSONArray().put(point)),
        )
        repo.schedule()
        scope.launch { repo.sync() }
    }

    override fun onProviderDisabled(provider: String) {
        event("location_disabled")
        attention("Device location is disabled. Open MR Connect to check tracking.")
    }

    private fun event(type: String) {
        if (repo.vault.shift.isNotEmpty()) {
            repo.db.enqueue(
                repo.owner,
                "POST",
                "/shifts/${repo.vault.shift}/events",
                JSONObject().put("event", type).put("observedAt", Instant.now().toString()),
            )
            repo.schedule()
        }
    }

    private fun attention(text: String) {
        val p =
            PendingIntent.getActivity(
                this,
                2,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
        getSystemService(NotificationManager::class.java)
            .notify(
                42,
                NotificationCompat.Builder(this, "resume")
                    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                    .setContentTitle("MR Connect · Tracking needs attention")
                    .setContentText(text)
                    .setContentIntent(p)
                    .setAutoCancel(true)
                    .build(),
            )
    }

    override fun onDestroy() {
        if (::locations.isInitialized) locations.removeUpdates(this)
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val repo = Repository(context)
        if (repo.vault.shift.isEmpty()) return
        channels(context)
        repo.schedule()
        if (
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            try {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, TrackingService::class.java),
                )
                return
            } catch (_: Exception) {}
        }
        val p =
            PendingIntent.getActivity(
                context,
                3,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
        context
            .getSystemService(NotificationManager::class.java)
            .notify(
                43,
                NotificationCompat.Builder(context, "resume")
                    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                    .setContentTitle("Resume your work shift")
                    .setContentText("Open MR Connect after reboot to resume location tracking.")
                    .setContentIntent(p)
                    .setAutoCancel(true)
                    .build(),
            )
    }
}
