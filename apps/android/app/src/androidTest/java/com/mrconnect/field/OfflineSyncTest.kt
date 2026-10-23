package com.mrconnect.field

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.*
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineSyncTest {
    @Test
    fun outboxSurvivesReopenAndResolvesDependencies() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repo = Repository(context, false)
        val oldBase = repo.vault.baseUrl
        val oldOwner = repo.vault.owner
        val oldToken = repo.vault.token
        val server = MockWebServer()
        server.start()
        repo.vault.baseUrl = server.url("").toString().trimEnd('/')
        repo.vault.owner = "instrumentation-user"
        repo.vault.token = "test-session"
        try {
            server.enqueue(
                MockResponse()
                    .setResponseCode(503)
                    .setBody("{\"error\":{\"message\":\"Temporary outage\"}}")
            )
            val plan =
                repo.mutate(
                    "POST",
                    "/records/dayplan",
                    JSONObject().put("data", JSONObject().put("date", "2026-10-22")),
                    true,
                )
            assertTrue(plan.optBoolean("queued"))
            val temporary = plan.getString("id")
            val visit =
                repo.mutate(
                    "POST",
                    "/visits",
                    JSONObject().put("planId", temporary).put("remarks", "Saved offline"),
                    true,
                )
            assertTrue(visit.optBoolean("queued"))
            val reopened = LocalStore(context)
            assertEquals(2, reopened.pending(repo.owner).size)
            reopened.close()
            server.enqueue(MockResponse().setBody("{\"id\":\"server-plan-id\"}"))
            server.enqueue(MockResponse().setBody("{\"id\":\"server-visit-id\"}"))
            repo.sync()
            assertTrue(repo.db.pending(repo.owner).isEmpty())
            val first = server.takeRequest()
            val second = server.takeRequest()
            val third = server.takeRequest()
            assertNotNull(second.getHeader("Idempotency-Key"))
            assertEquals(first.getHeader("Idempotency-Key"), second.getHeader("Idempotency-Key"))
            assertTrue(third.body.readUtf8().contains("server-plan-id"))
            assertFalse(third.body.readUtf8().contains(temporary))
        } finally {
            repo.db.pending(repo.owner).forEach { repo.db.remove(it.getString("id")) }
            repo.vault.baseUrl = oldBase
            repo.vault.owner = oldOwner
            repo.vault.token = oldToken
            server.shutdown()
        }
    }

    @Test
    fun conflictsRemainVisibleAndNeverDisappearSilently() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repo = Repository(context, false)
        val oldBase = repo.vault.baseUrl
        val oldOwner = repo.vault.owner
        val oldToken = repo.vault.token
        val server = MockWebServer()
        server.start()
        repo.vault.baseUrl = server.url("").toString().trimEnd('/')
        repo.vault.owner = "conflict-test"
        repo.vault.token = "test"
        try {
            repo.db.enqueue(repo.owner, "PUT", "/record/123", JSONObject().put("version", 1))
            server.enqueue(
                MockResponse()
                    .setResponseCode(409)
                    .setBody(
                        "{\"error\":{\"code\":\"VERSION_CONFLICT\",\"message\":\"Record changed on another device\"}}"
                    )
            )
            repo.sync()
            val pending = repo.db.pending(repo.owner)
            assertEquals(1, pending.size)
            assertEquals("conflict", pending[0].getString("status"))
            assertTrue(pending[0].getString("error").contains("another device"))
        } finally {
            repo.db.pending(repo.owner).forEach { repo.db.remove(it.getString("id")) }
            repo.vault.baseUrl = oldBase
            repo.vault.owner = oldOwner
            repo.vault.token = oldToken
            server.shutdown()
        }
    }
}
