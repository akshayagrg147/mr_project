package com.mrconnect.field

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.work.*
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

fun JSONObject.array(key: String): List<JSONObject> =
    optJSONArray(key)?.let { arr -> (0 until arr.length()).mapNotNull { arr.optJSONObject(it) } }
        ?: emptyList()

fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

fun JSONObject.text(key: String, default: String = ""): String =
    if (isNull(key)) default else optString(key, default)

class ApiException(val status: Int, val code: String, message: String) : Exception(message)

class Vault(context: Context) {
    private val prefs = context.getSharedPreferences("secure", Context.MODE_PRIVATE)
    private val key: SecretKey
        get() {
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            return (store.getKey("session", null) as? SecretKey)
                ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                    .apply {
                        init(
                            KeyGenParameterSpec.Builder(
                                    "session",
                                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                                )
                                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                                .build()
                        )
                    }
                    .generateKey()
        }

    var token: String
        get() =
            try {
                val packed = prefs.getString("token", null) ?: return ""
                val bytes = Base64.decode(packed, Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key,
                    GCMParameterSpec(128, bytes.copyOfRange(0, 12)),
                )
                String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)))
            } catch (_: Exception) {
                ""
            }
        set(value) {
            if (value.isEmpty()) {
                prefs.edit().remove("token").apply()
                return
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            prefs
                .edit()
                .putString(
                    "token",
                    Base64.encodeToString(
                        cipher.iv + cipher.doFinal(value.toByteArray()),
                        Base64.NO_WRAP,
                    ),
                )
                .apply()
        }

    var baseUrl: String
        get() = prefs.getString("baseUrl", BuildConfig.DEFAULT_API_URL)!!
        set(v) {
            prefs.edit().putString("baseUrl", v.trimEnd('/')).apply()
        }

    var owner: String
        get() = prefs.getString("owner", "")!!
        set(v) {
            prefs.edit().putString("owner", v).apply()
        }

    var shift: String
        get() = prefs.getString("shift", "")!!
        set(v) {
            prefs.edit().putString("shift", v).apply()
        }

    var shiftStarted: String
        get() = prefs.getString("shiftStarted", "")!!
        set(v) {
            prefs.edit().putString("shiftStarted", v).apply()
        }

    val deviceId: String
        get() {
            val old = prefs.getString("deviceId", null)
            if (old != null) return old
            return UUID.randomUUID().toString().also {
                prefs.edit().putString("deviceId", it).apply()
            }
        }

    var hindi: Boolean
        get() = prefs.getBoolean("hindi", false)
        set(v) {
            prefs.edit().putBoolean("hindi", v).apply()
        }

    var pinHash: String
        get() = prefs.getString("pin", "")!!
        set(v) {
            prefs.edit().putString("pin", v).putInt("pinAttempts", 0).apply()
        }

    var pinAttempts: Int
        get() = prefs.getInt("pinAttempts", 0)
        set(v) {
            prefs.edit().putInt("pinAttempts", v).apply()
        }

    fun digest(pin: String) =
        MessageDigest.getInstance("SHA-256")
            .digest((deviceId + owner + pin).toByteArray())
            .joinToString("") { "%02x".format(it) }
}

class LocalStore(context: Context) : SQLiteOpenHelper(context, "field.sqlite", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE cache(owner TEXT,key TEXT,data TEXT,PRIMARY KEY(owner,key))")
        db.execSQL(
            "CREATE TABLE outbox(id TEXT PRIMARY KEY,owner TEXT NOT NULL,method TEXT NOT NULL,path TEXT NOT NULL,body TEXT NOT NULL,temp_id TEXT,status TEXT NOT NULL DEFAULT 'pending',error TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {}

    fun cached(owner: String, key: String): JSONObject? =
        readableDatabase
            .rawQuery("SELECT data FROM cache WHERE owner=? AND key=?", arrayOf(owner, key))
            .use { if (it.moveToFirst()) JSONObject(it.getString(0)) else null }

    fun cache(owner: String, key: String, value: JSONObject) {
        writableDatabase.insertWithOnConflict(
            "cache",
            null,
            ContentValues().apply {
                put("owner", owner)
                put("key", key)
                put("data", value.toString())
            },
            SQLiteDatabase.CONFLICT_REPLACE,
        )
    }

    fun enqueue(
        owner: String,
        method: String,
        path: String,
        body: JSONObject,
        tempId: String? = null,
        id: String = UUID.randomUUID().toString(),
    ): String {
        writableDatabase.insertOrThrow(
            "outbox",
            null,
            ContentValues().apply {
                put("id", id)
                put("owner", owner)
                put("method", method)
                put("path", path)
                put("body", body.toString())
                put("temp_id", tempId)
                put("created_at", System.currentTimeMillis())
            },
        )
        return id
    }

    fun pending(owner: String): List<JSONObject> =
        readableDatabase
            .rawQuery(
                "SELECT * FROM outbox WHERE owner=? ORDER BY created_at,rowid",
                arrayOf(owner),
            )
            .use { c ->
                buildList {
                    while (c.moveToNext()) {
                        val o = JSONObject()
                        c.columnNames.forEachIndexed { i, k -> o.put(k, c.getString(i)) }
                        add(o)
                    }
                }
            }

    fun remove(id: String) {
        writableDatabase.delete("outbox", "id=?", arrayOf(id))
    }

    fun mark(id: String, status: String, error: String) {
        writableDatabase.update(
            "outbox",
            ContentValues().apply {
                put("status", status)
                put("error", error)
            },
            "id=?",
            arrayOf(id),
        )
    }

    fun replace(owner: String, from: String, to: String) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (table in listOf("outbox", "cache")) {
                val columns = if (table == "outbox") listOf("path", "body") else listOf("data")
                for (col in columns) db.execSQL(
                    "UPDATE $table SET $col=replace($col,?,?) WHERE owner=?",
                    arrayOf(from, to, owner),
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun updateBody(id: String, body: JSONObject) {
        writableDatabase.update(
            "outbox",
            ContentValues().apply {
                put("body", body.toString())
                put("status", "pending")
                put("error", "")
            },
            "id=?",
            arrayOf(id),
        )
    }
}

class Repository(val context: Context, private val autoSchedule: Boolean = true) {
    val vault = Vault(context)
    val db = LocalStore(context)
    private val http =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .build()
    val owner
        get() = vault.baseUrl + "|" + vault.owner

    suspend fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        operation: String? = null,
        sessionToken: String = vault.token,
        base: String = vault.baseUrl,
    ): JSONObject =
        withContext(Dispatchers.IO) {
            val req =
                Request.Builder().url(base + "/api" + path).header("Accept", "application/json")
            if (sessionToken.isNotEmpty() && !path.startsWith("/auth/login"))
                req.header("Authorization", "Bearer " + sessionToken)
            if (operation != null) req.header("Idempotency-Key", operation)
            req.method(
                method,
                if (method == "GET" || method == "HEAD") null
                else
                    (body ?: JSONObject())
                        .toString()
                        .toRequestBody("application/json".toMediaType()),
            )
            http.newCall(req.build()).execute().use { r ->
                val obj = JSONObject(r.body?.string() ?: "{}")
                if (!r.isSuccessful) {
                    val error = obj.optJSONObject("error")
                    throw ApiException(
                        r.code,
                        error?.optString("code") ?: "FAILED",
                        error?.optString("message") ?: "Request failed",
                    )
                }
                obj
            }
        }

    suspend fun login(company: String, email: String, password: String): JSONObject {
        val result =
            request(
                "POST",
                "/auth/login",
                JSONObject()
                    .put("companyCode", company)
                    .put("email", email)
                    .put("password", password)
                    .put("client", "android"),
            )
        val newOwner = result.getJSONObject("user").getString("id")
        require(vault.shift.isEmpty() || vault.owner == newOwner) {
            "End the active work shift before switching accounts"
        }
        vault.pinAttempts = 0
        if (vault.owner != newOwner) {
            vault.shift = ""
            vault.pinHash = ""
        }
        vault.owner = newOwner
        vault.token = result.getString("token")
        db.pending(owner)
            .filter { it.text("status") == "auth_required" }
            .forEach { db.mark(it.getString("id"), "pending", "") }
        return result
    }

    suspend fun bootstrap(): JSONObject {
        sync()
        return request("GET", "/bootstrap").also { db.cache(owner, "bootstrap", it) }
    }

    fun cached(): JSONObject? = db.cached(owner, "bootstrap")

    suspend fun get(path: String, key: String): JSONObject =
        try {
            request("GET", path).also { db.cache(owner, key, it) }
        } catch (e: Exception) {
            db.cached(owner, key) ?: throw e
        }

    suspend fun mutate(
        method: String,
        path: String,
        body: JSONObject,
        temp: Boolean = false,
    ): JSONObject {
        val op = UUID.randomUUID().toString()
        try {
            if (body.toString().contains("local-") || path.contains("local-"))
                throw java.io.IOException("Pending dependency")
            return request(method, path, body, op)
        } catch (e: Exception) {
            if (e is ApiException && e.status < 500 && e.status != 429) throw e
            val local = if (temp) "local-" + UUID.randomUUID() else null
            db.enqueue(owner, method, path, body, local, op)
            schedule()
            return JSONObject(body.optJSONObject("data")?.toString() ?: body.toString())
                .put("id", local ?: "")
                .put("queued", true)
                .put("status", "draft")
                .put("version", 1)
        }
    }

    suspend fun upload(bytes: ByteArray, name: String, mime: String): JSONObject {
        require(bytes.size <= 10 * 1024 * 1024) { "Maximum file size is 10 MB" }
        return try {
            sendFile(bytes, name, mime)
        } catch (e: Exception) {
            if (e is ApiException && e.status < 500 && e.status != 429) throw e
            val temp = "local-file-" + UUID.randomUUID()
            val file = File(context.filesDir, "pending-$temp")
            file.writeBytes(bytes)
            db.enqueue(
                owner,
                "UPLOAD",
                "/attachments",
                JSONObject().put("file", file.absolutePath).put("name", name).put("mime", mime),
                temp,
            )
            schedule()
            JSONObject().put("id", temp).put("queued", true)
        }
    }

    private suspend fun sendFile(
        bytes: ByteArray,
        name: String,
        mime: String,
        sessionToken: String = vault.token,
        base: String = vault.baseUrl,
    ): JSONObject =
        withContext(Dispatchers.IO) {
            val request =
                Request.Builder()
                    .url(base + "/api/attachments")
                    .header("Authorization", "Bearer " + sessionToken)
                    .post(
                        MultipartBody.Builder()
                            .setType(MultipartBody.FORM)
                            .addFormDataPart("file", name, bytes.toRequestBody(mime.toMediaType()))
                            .build()
                    )
                    .build()
            http.newCall(request).execute().use { r ->
                val result = JSONObject(r.body?.string() ?: "{}")
                if (!r.isSuccessful)
                    throw ApiException(
                        r.code,
                        "UPLOAD_FAILED",
                        result.optJSONObject("error")?.optString("message") ?: "Upload failed",
                    )
                result
            }
        }

    suspend fun download(id: String): File =
        withContext(Dispatchers.IO) {
            val req =
                Request.Builder()
                    .url(vault.baseUrl + "/api/attachments/" + id)
                    .header("Authorization", "Bearer " + vault.token)
                    .build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful)
                    throw ApiException(r.code, "DOWNLOAD_FAILED", "Could not download attachment")
                val mime = r.header("Content-Type") ?: "application/pdf"
                val ext =
                    if (mime.contains("pdf")) "pdf" else if (mime.contains("png")) "png" else "jpg"
                val dir = File(context.cacheDir, "documents").apply { mkdirs() }
                File(dir, "$id.$ext").also { it.writeBytes(r.body!!.bytes()) }
            }
        }

    suspend fun sync(): Int = syncMutex.withLock {
        var count = 0
        val syncOwner = owner
        val syncBase = vault.baseUrl
        val syncToken = vault.token
        while (count < 1000) {
            if (owner != syncOwner) break
            val op = db.pending(syncOwner).firstOrNull() ?: break
            if (op.optString("status") != "pending") break
            try {
                val body = JSONObject(op.getString("body"))
                val result =
                    if (op.getString("method") == "UPLOAD")
                        sendFile(
                            File(body.getString("file")).readBytes(),
                            body.getString("name"),
                            body.getString("mime"),
                            syncToken,
                            syncBase,
                        )
                    else
                        request(
                            op.getString("method"),
                            op.getString("path"),
                            body,
                            op.getString("id"),
                            syncToken,
                            syncBase,
                        )
                if (op.getString("method") == "UPLOAD") File(body.getString("file")).delete()
                val temp = op.optString("temp_id")
                if (temp.isNotEmpty() && temp != "null" && result.has("id")) {
                    val real = result.getString("id")
                    db.replace(syncOwner, temp, real)
                    if (owner == syncOwner && vault.shift == temp) vault.shift = real
                }
                db.remove(op.getString("id"))
                count++
            } catch (e: ApiException) {
                if (e.status >= 500 || e.status == 429) break
                db.mark(
                    op.getString("id"),
                    if (e.status == 409) "conflict"
                    else if (e.status == 401) "auth_required" else "failed",
                    e.message ?: "Request failed",
                )
                break
            } catch (_: Exception) {
                break
            }
        }
        count
    }

    fun schedule() {
        if (!autoSchedule) return
        val constraints =
            Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(
                "sync",
                ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<SyncWorker>()
                    .setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build(),
            )
    }

    companion object {
        private val syncMutex = Mutex()
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val r = Repository(applicationContext)
        if (r.vault.token.isEmpty()) return Result.success()
        return try {
            r.sync()
            if (r.db.pending(r.owner).any { it.optString("status") == "pending" }) Result.retry()
            else Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
