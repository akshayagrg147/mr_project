package com.mrconnect.field

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import org.json.*

@Composable
fun Visit(vm: FieldViewModel, capture: () -> Unit) {
    val customer = vm.selected ?: return
    var step by rememberSaveable(customer.text("id")) { mutableIntStateOf(1) }
    var remarks by rememberSaveable { mutableStateOf("") }
    var exception by rememberSaveable { mutableStateOf("") }
    var campaign by rememberSaveable { mutableStateOf("") }
    var outcome by rememberSaveable { mutableStateOf("Met in person") }
    val detailed =
        rememberSaveable(customer.text("id"), saver = BooleanMapSaver) {
            mutableStateMapOf<String, Boolean>()
        }
    val samples =
        rememberSaveable(customer.text("id"), saver = StringMapSaver) {
            mutableStateMapOf<String, String>()
        }
    val orders =
        rememberSaveable(customer.text("id"), saver = StringMapSaver) {
            mutableStateMapOf<String, String>()
        }
    val inputs =
        rememberSaveable(customer.text("id"), saver = StringMapSaver) {
            mutableStateMapOf<String, String>()
        }
    val location = remember(vm.localVersion) { vm.repo.db.cached(vm.repo.owner, "location") }
    Text(
        "Step $step of 3 · " +
            when (step) {
                1 -> "Call details"
                2 -> "Product detailing"
                else -> "Samples & business"
            },
        color = Brand,
        style = MaterialTheme.typography.bodyMedium,
    )
    FieldCard {
        Text(customer.text("name"), style = MaterialTheme.typography.titleLarge)
        Text(customer.text("specialty") + " · " + customer.text("area"), color = Muted)
    }
    when (step) {
        1 -> {
            Choice(
                "Call outcome",
                outcome,
                listOf("Met in person", "Not available", "Follow-up only").map { it to it },
                { outcome = it },
                true,
            )
            Choice(
                "Campaign",
                campaign,
                vm.records("campaign")
                    .filter {
                        it.text("fromDate") <= localDate() && it.text("toDate") >= localDate()
                    }
                    .map { it.text("id") to it.text("name") },
                { campaign = it },
            )
            Entry("Visit remarks", remarks, { remarks = it }, true, lines = 3)
            if (location != null)
                Message(
                    "Location captured · ±${location.optInt("accuracy")} m\n" +
                        location.text("observedAt") +
                        if (location.optBoolean("mocked")) "\nMock location reported by Android"
                        else ""
                )
            else Message("No GPS fix yet. Capture location or explain the exception.")
            location?.let { loc ->
                val problem =
                    TrackingRules.evidenceProblem(
                        System.currentTimeMillis(),
                        try {
                            Instant.parse(loc.text("observedAt")).toEpochMilli()
                        } catch (_: Exception) {
                            0
                        },
                        loc.optDouble("accuracy"),
                        loc.optBoolean("mocked"),
                        customer.has("latitude"),
                        if (customer.has("latitude"))
                            FloatArray(1)
                                .also {
                                    android.location.Location.distanceBetween(
                                        loc.optDouble("latitude"),
                                        loc.optDouble("longitude"),
                                        customer.optDouble("latitude"),
                                        customer.optDouble("longitude"),
                                        it,
                                    )
                                }[0]
                                .toDouble()
                        else null,
                        vm.policies.optDouble("maxAccuracyMeters", 100.0),
                        vm.policies.optDouble("gpsRadiusMeters", 200.0),
                    )
                if (problem != null)
                    Text(problem, color = Muted, style = MaterialTheme.typography.bodyMedium)
            }
            Secondary("Capture current GPS location", !vm.busy, capture)
            Entry("Location exception reason", exception, { exception = it }, lines = 3)
            Text(
                "Required when location is missing, stale, mocked, inaccurate or outside the customer’s verification radius.",
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )
            Primary("Next: products", remarks.isNotBlank()) { step = 2 }
        }
        2 -> {
            Text("Select the products discussed during this visit.", color = Muted)
            vm.records("product").forEach { p ->
                FieldCard {
                    Row {
                        Checkbox(
                            detailed[p.text("id")] == true,
                            onCheckedChange = { detailed[p.text("id")] = it },
                        )
                        Column(Modifier.padding(top = 12.dp)) {
                            Text(p.text("name"), fontWeight = FontWeight.Bold)
                            Text(p.text("category"), color = Muted)
                        }
                    }
                    if (p.text("contentId").isNotEmpty())
                        Secondary("Open presentation") { vm.viewAttachment(p.text("contentId")) }
                    if (p.text("description").isNotEmpty())
                        Text(
                            p.text("description"),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Muted,
                        )
                }
            }
            Primary("Next: samples & business") { step = 3 }
            Secondary("Back to call details") { step = 1 }
        }
        3 -> {
            vm.records("product").forEach { p ->
                val id = p.text("id")
                FieldCard {
                    Text(p.text("name"), style = MaterialTheme.typography.titleMedium)
                    val stock =
                        vm.boot?.array("inventory")?.find {
                            it.text("itemId") == id && it.text("userId") == vm.user.text("id")
                        }
                    Text(
                        "Sample stock: ${stock?.optInt("quantity")?:0} · Unit price ${rupees(p.optDouble("price"))}",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Entry("Sample units", samples[id] ?: "", { samples[id] = it }, number = true)
                    Entry("POB order units", orders[id] ?: "", { orders[id] = it }, number = true)
                }
            }
            vm.records("input").forEach { p ->
                Entry(
                    "Input: " + p.text("name"),
                    inputs[p.text("id")] ?: "",
                    { inputs[p.text("id")] = it },
                    number = true,
                )
            }
            val total =
                vm.records("product").sumOf {
                    it.optDouble("price") * (orders[it.text("id")]?.toIntOrNull() ?: 0)
                }
            Message("POB total: " + rupees(total))
            Primary("Save visit", !vm.busy) {
                try {
                    val plan =
                        vm.records("dayplan").find {
                            it.text("date") == localDate() &&
                                it.text("ownerId") == vm.user.text("id")
                        } ?: error("Submit a day plan first")
                    fun lines(values: Map<String, String>): JSONArray {
                        val a = JSONArray()
                        values.forEach { (id, v) ->
                            if (v.isNotBlank()) {
                                val q = v.toIntOrNull() ?: error("Quantities must be whole numbers")
                                require(q >= 0) { "Quantities cannot be negative" }
                                if (q > 0) a.put(JSONObject().put("itemId", id).put("quantity", q))
                            }
                        }
                        return a
                    }
                    val loc = location?.let {
                        JSONObject()
                            .put("latitude", it.getDouble("latitude"))
                            .put("longitude", it.getDouble("longitude"))
                            .put("accuracy", it.getDouble("accuracy"))
                            .put("observedAt", it.getString("observedAt"))
                            .put("mocked", it.optBoolean("mocked"))
                    }
                    val body =
                        JSONObject()
                            .put("customerId", customer.getString("id"))
                            .put("planId", plan.getString("id"))
                            .put("visitedAt", Instant.now().toString())
                            .put("outcome", outcome)
                            .put("remarks", remarks)
                            .put("location", loc ?: JSONObject.NULL)
                            .put("exceptionReason", exception)
                            .put(
                                "detailedProductIds",
                                JSONArray(detailed.filterValues { it }.keys.toList()),
                            )
                            .put("samples", lines(samples))
                            .put("inputs", lines(inputs))
                            .put("orderLines", lines(orders))
                    if (campaign.isNotEmpty()) body.put("campaignId", campaign)
                    vm.saveVisit(body)
                } catch (e: Exception) {
                    vm.error = e.message ?: "Check the call fields"
                }
            }
            Secondary("Back to detailing") { step = 2 }
        }
    }
}
