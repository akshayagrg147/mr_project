package com.mrconnect.field

import android.app.Application
import android.content.Intent
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.time.*
import kotlinx.coroutines.*
import org.json.*

fun localDate(): String = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()

fun rupees(value: Double): String =
    java.text.NumberFormat.getCurrencyInstance(java.util.Locale("en", "IN")).format(value)

class FieldViewModel(application: Application) : AndroidViewModel(application) {
    val repo = Repository(application)
    var boot by mutableStateOf<JSONObject?>(repo.cached())
        private set

    var screen by mutableStateOf(if (repo.vault.token.isEmpty()) "welcome" else "home")
    var busy by mutableStateOf(false)
    var error by mutableStateOf("")
    var message by mutableStateOf("")
    var offline by mutableStateOf(false)
    var replacingOperation: String? = null
    var conflictServer by mutableStateOf<JSONObject?>(null)
    var selected by mutableStateOf<JSONObject?>(null)
    var formKind by mutableStateOf("")
    var formInitial by mutableStateOf<JSONObject?>(null)
    var locked by mutableStateOf(repo.vault.pinHash.isNotEmpty() && repo.vault.token.isNotEmpty())
    var localVersion by mutableIntStateOf(0)
    val user
        get() = boot?.optJSONObject("user") ?: JSONObject()

    val policies
        get() = boot?.optJSONObject("policies") ?: JSONObject()

    val modules
        get() = boot?.array("modules") ?: emptyList()

    fun records(kind: String) = boot?.optJSONObject("records")?.array(kind) ?: emptyList()

    fun names(id: String): String {
        if (id.isEmpty() || id == "null") return "—"
        return boot?.array("users")?.find { it.text("id") == id }?.text("name")
            ?: boot?.optJSONObject("records")?.let { all ->
                all.keys()
                    .asSequence()
                    .flatMap { all.optJSONArray(it)?.objects()?.asSequence() ?: emptySequence() }
                    .find { it.text("id") == id }
                    ?.let { it.text("name", it.text("title", id)) }
            }
            ?: id
    }

    fun work(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = ""
        viewModelScope.launch {
            try {
                block()
            } catch (e: Exception) {
                error = e.message ?: "Something went wrong"
                if (e is ApiException && e.status == 401) {
                    message = "Your session expired. Sign in again; your saved work is retained."
                    screen = "login"
                }
            } finally {
                busy = false
                localVersion++
            }
        }
    }

    init {
        if (repo.vault.token.isNotEmpty()) work { refresh() }
    }

    suspend fun refresh() {
        try {
            val fresh = repo.bootstrap()
            for (kind in listOf("visit", "dcr")) {
                try {
                    fresh
                        .getJSONObject("records")
                        .put(kind, repo.request("GET", "/records/$kind").getJSONArray("items"))
                } catch (_: Exception) {
                    fresh
                        .getJSONObject("records")
                        .put(
                            kind,
                            boot?.optJSONObject("records")?.optJSONArray(kind) ?: JSONArray(),
                        )
                }
            }
            boot = mergePending(fresh)
            offline = false
        } catch (e: Exception) {
            if (e is ApiException) throw e
            offline = true
            boot = mergePending(repo.cached() ?: throw e)
        }
        localVersion++
    }

    private fun mergePending(value: JSONObject): JSONObject {
        val all = value.getJSONObject("records")
        val pending = repo.db.pending(repo.owner)
        for (key in all.keys().asSequence().toList()) {
            val old = all.optJSONArray(key) ?: continue
            all.put(
                key,
                JSONArray(old.objects().filterNot { r -> r.text("id").startsWith("local-") }),
            )
        }
        for (op in pending) {
            val path = op.text("path")
            val body = JSONObject(op.getString("body"))
            val kind =
                if (path.startsWith("/records/")) path.substringAfterLast('/')
                else if (path == "/visits") "visit" else if (path == "/dcr") "dcr" else ""
            if (kind.isNotEmpty()) {
                val d =
                    JSONObject((body.optJSONObject("data") ?: body).toString())
                        .put("id", op.text("temp_id"))
                        .put("ownerId", repo.vault.owner)
                        .put("ownerName", value.getJSONObject("user").text("name"))
                        .put("kind", kind)
                        .put("status", if (kind == "dayplan") "active" else "draft")
                        .put("version", 1)
                        .put("queued", true)
                if (kind == "visit") {
                    d.put(
                        "date",
                        try {
                            Instant.parse(d.text("visitedAt"))
                                .atZone(ZoneId.of("Asia/Kolkata"))
                                .toLocalDate()
                                .toString()
                        } catch (_: Exception) {
                            localDate()
                        },
                    )
                    d.put("customerName", names(d.text("customerId")))
                    val total =
                        d.array("orderLines").sumOf { line ->
                            records("product")
                                .find { it.text("id") == line.text("itemId") }
                                ?.optDouble("price", 0.0)
                                ?.times(line.optInt("quantity")) ?: 0.0
                        }
                    d.put("orderTotal", total)
                }
                val list = all.optJSONArray(kind) ?: JSONArray()
                list.put(d)
                all.put(kind, list)
            } else if (op.text("method") == "PUT" && path.startsWith("/record/")) {
                val id = path.substringAfterLast('/')
                for (key in all.keys()) {
                    all.array(key)
                        .find { it.text("id") == id }
                        ?.let { record ->
                            val data = body.optJSONObject("data") ?: JSONObject()
                            data.keys().forEach { record.put(it, data.opt(it)) }
                            record.put("queued", true)
                        }
                }
            }
        }
        return value
    }

    fun login(company: String, email: String, password: String, base: String) {
        work {
            require(
                base.startsWith("https://") ||
                    (BuildConfig.DEBUG &&
                        base.matches(
                            Regex("http://(10\\.0\\.2\\.2|127\\.0\\.0\\.1|localhost)(:[0-9]+)?")
                        ))
            ) {
                "Use an HTTPS company server URL"
            }
            require(repo.vault.shift.isEmpty() || base.trimEnd('/') == repo.vault.baseUrl) {
                "End your active shift before changing company servers"
            }
            if (base.trimEnd('/') != repo.vault.baseUrl) repo.vault.pinHash = ""
            repo.vault.baseUrl = base
            val session = repo.login(company, email, password)
            locked = false
            boot = repo.cached()
            if (session.getJSONObject("user").optBoolean("mustChangePassword")) {
                boot =
                    JSONObject()
                        .put("user", session.getJSONObject("user"))
                        .put("records", JSONObject())
                        .put("modules", JSONArray())
                screen = "account"
            } else {
                refresh()
                screen = "home"
            }
        }
    }

    fun navigate(to: String) {
        if (to != "form") {
            replacingOperation = null
            conflictServer = null
        }
        error = ""
        message = ""
        screen = to
        selected = null
        localVersion++
    }

    fun add(kind: String) {
        replacingOperation = null
        conflictServer = null
        formKind = kind
        formInitial = null
        navigate("form")
    }

    fun edit(record: JSONObject, operation: String? = null) {
        replacingOperation = operation
        if (operation == null) conflictServer = null
        formKind = record.text("kind")
        formInitial = record
        screen = "form"
        error = ""
    }

    fun save(kind: String, data: JSONObject, initial: JSONObject?) {
        work {
            val path = if (initial == null) "/records/$kind" else "/record/${initial.text("id")}"
            val result =
                repo.mutate(
                    if (initial == null) "POST" else "PUT",
                    path,
                    JSONObject().put("data", data).also {
                        if (initial != null) it.put("version", initial.optInt("version"))
                    },
                    initial == null,
                )
            replacingOperation?.let {
                repo.db.remove(it)
                replacingOperation = null
            }
            message =
                if (result.optBoolean("queued")) "Saved on this phone. Waiting to sync."
                else "Record saved"
            refresh()
            screen = if (kind == "dayplan") "home" else "module/$kind"
        }
    }

    fun submit(record: JSONObject) {
        work {
            require(!record.optBoolean("queued")) { "Sync this draft before submitting it" }
            repo.mutate(
                "POST",
                "/record/${record.text("id")}/submit",
                JSONObject().put("version", record.optInt("version")),
            )
            refresh()
            screen = "module/${record.text("kind")}"
            message = "Submitted for review"
        }
    }

    fun delete(record: JSONObject) {
        work {
            repo.mutate(
                "DELETE",
                "/record/${record.text("id")}",
                JSONObject().put("version", record.optInt("version")),
            )
            refresh()
            screen = "module/${record.text("kind")}"
            message = "Record removed"
        }
    }

    fun saveVisit(data: JSONObject) {
        work {
            val result = repo.mutate("POST", "/visits", data, true)
            refresh()
            screen = "calls"
            message =
                if (result.optBoolean("queued"))
                    "Visit saved offline. It will be validated when synced."
                else if (result.optBoolean("verified")) "Visit recorded · GPS verified"
                else "Visit recorded · Location needs review"
        }
    }

    fun saveDcr(date: String, remarks: String) {
        work {
            val result =
                repo.mutate(
                    "POST",
                    "/dcr",
                    JSONObject().put("date", date).put("remarks", remarks),
                    true,
                )
            refresh()
            if (result.optBoolean("queued")) {
                screen = "module/dcr"
                message = "Draft saved offline. Sync before submitting."
            } else {
                selected = result
                screen = "detail"
            }
        }
    }

    fun startShift() {
        work {
            val at = Instant.now().toString()
            val result =
                repo.mutate(
                    "POST",
                    "/shifts/start",
                    JSONObject().put("deviceId", repo.vault.deviceId).put("startedAt", at),
                    true,
                )
            repo.vault.shift = result.getString("id")
            repo.vault.shiftStarted = result.text("started_at", at)
            ContextCompat.startForegroundService(
                getApplication(),
                Intent(getApplication(), TrackingService::class.java),
            )
            message = "Work shift started. Location tracking is visible in notifications."
            localVersion++
        }
    }

    fun endShift() {
        work {
            val id = repo.vault.shift
            require(id.isNotEmpty()) { "No shift is active" }
            getApplication<Application>()
                .stopService(Intent(getApplication(), TrackingService::class.java))
            repo.db.enqueue(
                repo.owner,
                "POST",
                "/shifts/$id/end",
                JSONObject().put("endedAt", Instant.now().toString()),
            )
            repo.vault.shift = ""
            repo.vault.shiftStarted = ""
            repo.schedule()
            repo.sync()
            refresh()
            message = "Work shift ended. Tracking has stopped."
        }
    }

    fun acknowledge(record: JSONObject, qty: Int, notes: String) {
        work {
            repo.mutate(
                "POST",
                "/record/${record.text("id")}/acknowledge",
                JSONObject()
                    .put("version", record.optInt("version"))
                    .put("receivedQty", qty)
                    .put("notes", notes),
            )
            refresh()
            screen = "module/challan"
            message = "Receipt acknowledged"
        }
    }

    fun sync() {
        work {
            repo.sync()
            refresh()
            message =
                if (repo.db.pending(repo.owner).isEmpty()) "All saved work is synced"
                else "Review pending operations in Sync center"
        }
    }

    fun logout() {
        work {
            require(repo.vault.shift.isEmpty()) { "End the work shift before signing out" }
            try {
                repo.request("POST", "/auth/logout", JSONObject())
            } catch (_: Exception) {}
            repo.vault.token = ""
            boot = null
            screen = "login"
        }
    }

    fun viewAttachment(id: String) {
        work {
            require(!id.startsWith("local-")) { "Sync this attachment before opening it" }
            val file = repo.download(id)
            val uri =
                FileProvider.getUriForFile(
                    getApplication(),
                    BuildConfig.APPLICATION_ID + ".files",
                    file,
                )
            val intent =
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(
                        uri,
                        if (file.extension == "pdf") "application/pdf" else "image/*",
                    )
                    .addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    )
            try {
                getApplication<Application>().startActivity(intent)
            } catch (_: Exception) {
                throw IllegalStateException(
                    "Install a compatible document viewer to open this attachment"
                )
            }
        }
    }

    fun password(current: String, next: String) {
        work {
            require(next.length >= 12) { "Use at least 12 characters" }
            repo.request(
                "POST",
                "/auth/password",
                JSONObject().put("currentPassword", current).put("newPassword", next),
            )
            repo.vault.token = ""
            boot = null
            screen = "login"
            message = "Password changed. Sign in again."
        }
    }
}
