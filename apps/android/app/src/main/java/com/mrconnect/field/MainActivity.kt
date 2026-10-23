package com.mrconnect.field

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.location.*
import android.os.*
import androidx.activity.ComponentActivity
import androidx.activity.compose.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.*
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import org.json.*

class MainActivity : ComponentActivity() {
    private val model: FieldViewModel by viewModels()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setContent { FieldTheme { FieldApp(model) } }
    }

    override fun onStop() {
        super.onStop()
        if (model.repo.vault.pinHash.isNotEmpty() && model.repo.vault.token.isNotEmpty())
            model.locked = true
    }
}

@Composable
fun Primary(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(text)
    }
}

@Composable
fun Secondary(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    FilledTonalButton(
        onClick = onClick,
        enabled = enabled,
        colors =
            ButtonDefaults.filledTonalButtonColors(containerColor = Soft, contentColor = Brand),
        modifier = Modifier.fillMaxWidth().heightIn(min = 46.dp),
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(text)
    }
}

@Composable
fun FieldCard(
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = color,
        border = if (color == Color.White) BorderStroke(1.dp, Line) else null,
    ) {
        Column(
            Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content,
        )
    }
}

@Composable
fun Message(text: String, error: Boolean = false) {
    Surface(
        color = if (error) Color(0xFFFDEEF0) else Soft,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text,
            Modifier.padding(16.dp),
            color = if (error) Color(0xFFBC3F45) else Ink,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
fun Entry(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    required: Boolean = false,
    password: Boolean = false,
    number: Boolean = false,
    lines: Int = 1,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            label + if (required) " *" else "",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            singleLine = lines == 1,
            minLines = lines,
            visualTransformation =
                if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions =
                KeyboardOptions(
                    keyboardType =
                        if (password) KeyboardType.Password
                        else if (number) KeyboardType.Decimal else KeyboardType.Text
                ),
            colors =
                OutlinedTextFieldDefaults.colors(
                    unfocusedBorderColor = Line,
                    focusedBorderColor = Brand,
                    unfocusedContainerColor = Color.White,
                    focusedContainerColor = Color.White,
                ),
        )
    }
}

@Composable
fun Choice(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    required: Boolean = false,
) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            label + if (required) " *" else "",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Surface(
            onClick = { open = true },
            color = Color.White,
            border = BorderStroke(1.dp, Line),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    options.find { it.first == value }?.second ?: "Select ${label.lowercase()}",
                    Modifier.weight(1f),
                )
                Text("⌄", color = Brand)
            }
        }
    }
    if (open) {
        var q by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text(label) },
            text = {
                Column(Modifier.heightIn(max = 450.dp)) {
                    Entry("Search", q, { q = it })
                    Spacer(Modifier.height(12.dp))
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        if (!required)
                            TextButton(
                                onClick = {
                                    onSelect("")
                                    open = false
                                }
                            ) {
                                Text("None")
                            }
                        options
                            .filter { it.second.contains(q, true) }
                            .take(100)
                            .forEach { (id, name) ->
                                TextButton(
                                    onClick = {
                                        onSelect(id)
                                        open = false
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Text(name, Modifier.fillMaxWidth())
                                }
                            }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { open = false }) { Text("Close") } },
        )
    }
}

@Composable
fun FieldApp(vm: FieldViewModel) {
    val context = LocalContext.current
    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            result ->
            if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true) vm.startShift()
            else vm.error = "Precise location permission is required to start shift tracking."
        }
    val capture =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r
            ->
            if (r[Manifest.permission.ACCESS_FINE_LOCATION] == true)
                vm.work {
                    val point = currentFix(context)
                    vm.repo.db.cache(vm.repo.owner, "location", point)
                    vm.message = "Current location captured"
                }
            else vm.error = "Location was not granted. Add a visit exception reason if necessary."
        }
    val locationAction = {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
            vm.work {
                val point = currentFix(context)
                vm.repo.db.cache(vm.repo.owner, "location", point)
                vm.message = "Current location captured"
            }
        else
            capture.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                )
            )
    }
    val shiftAction = {
        if (vm.repo.vault.shift.isNotEmpty()) vm.endShift()
        else if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
            vm.startShift()
        else
            permission.launch(
                if (Build.VERSION.SDK_INT >= 33)
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.POST_NOTIFICATIONS,
                    )
                else
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    )
            )
    }
    val auth = vm.screen in listOf("welcome", "login")
    BackHandler(enabled = !auth && vm.screen != "home") { vm.navigate("home") }
    LaunchedEffect(vm.screen) {
        if (
            vm.screen == "home" &&
                vm.repo.vault.shift.isNotEmpty() &&
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
        )
            try {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, TrackingService::class.java),
                )
            } catch (_: Exception) {}
    }
    if (vm.locked && !auth) {
        Unlock(vm)
        return
    }
    Scaffold(
        containerColor = Canvas,
        topBar = {
            if (!auth)
                Surface(color = Color.White) {
                    Row(
                        Modifier.statusBarsPadding()
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (vm.screen != "home")
                            TextButton(
                                onClick = { vm.navigate("home") },
                                contentPadding = PaddingValues(0.dp),
                                modifier = Modifier.width(36.dp),
                            ) {
                                Text("‹", fontSize = 30.sp)
                            }
                        Column(Modifier.weight(1f)) {
                            Text(
                                when {
                                    vm.screen == "home" ->
                                        if (vm.repo.vault.hindi)
                                            "नमस्ते, " + vm.user.text("name").substringBefore(' ')
                                        else
                                            "Good day, " + vm.user.text("name").substringBefore(' ')
                                    vm.screen == "calls" -> "Today’s visits"
                                    vm.screen == "plan" -> "Plan your day"
                                    vm.screen == "visit" -> "Record customer call"
                                    vm.screen == "more" -> "Your workspace"
                                    vm.screen == "reports" -> "My performance"
                                    vm.screen == "sync" -> "Sync center"
                                    vm.screen == "form" -> "Add / edit record"
                                    vm.screen == "detail" -> "Record detail"
                                    vm.screen == "dcr" -> "Daily call report"
                                    vm.screen == "account" -> "Account & settings"
                                    else ->
                                        vm.modules
                                            .find { vm.screen == "module/" + it.text("key") }
                                            ?.text("title") ?: "MR Connect"
                                },
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Text(
                                localDate() +
                                    if (vm.offline) " · Offline" else " · Company workspace",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Muted,
                            )
                        }
                        TextButton(
                            onClick = { vm.navigate("module/announcement") },
                            modifier = Modifier.size(42.dp),
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            FieldIcon("bell")
                        }
                    }
                }
        },
        bottomBar = {
            if (!auth)
                Surface(color = Color.White) {
                    Row(
                        Modifier.navigationBarsPadding()
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 8.dp)
                    ) {
                        listOf(
                                Triple("home", "house", "Today"),
                                Triple("calls", "stethoscope", "Calls"),
                                Triple("plan", "calendar-days", "Plan"),
                                Triple("reports", "chart-no-axes-combined", "Reports"),
                                Triple("more", "menu", "More"),
                            )
                            .forEach { (route, icon, title) ->
                                Surface(
                                    onClick = { vm.navigate(route) },
                                    modifier = Modifier.weight(1f),
                                    color = if (vm.screen == route) Soft else Color.White,
                                    shape = RoundedCornerShape(14.dp),
                                ) {
                                    Column(
                                        Modifier.padding(vertical = 8.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        FieldIcon(icon, 24)
                                        Text(
                                            title,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = if (vm.screen == route) Brand else Muted,
                                        )
                                    }
                                }
                            }
                    }
                }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Brand)
            if (vm.error.isNotEmpty())
                Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Message(vm.error, true)
                }
            if (vm.message.isNotEmpty())
                Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                    Message(vm.message)
                }
            if (vm.offline && !auth)
                TextButton(onClick = { vm.navigate("sync") }) {
                    Text("Offline · saved work stays on this phone. Open sync center →")
                }
            Column(
                Modifier.weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(if (auth) 24.dp else 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                when {
                    vm.screen == "welcome" -> Welcome { vm.navigate("login") }
                    vm.screen == "login" -> LoginScreen(vm)
                    vm.boot == null -> Message("Sign in to load your company workspace.")
                    vm.screen == "home" -> Home(vm, shiftAction)
                    vm.screen == "calls" -> Calls(vm)
                    vm.screen == "plan" -> Plan(vm)
                    vm.screen == "visit" -> Visit(vm, locationAction)
                    vm.screen == "more" -> More(vm)
                    vm.screen == "form" -> RecordEditor(vm)
                    vm.screen == "detail" -> Detail(vm)
                    vm.screen == "dcr" -> DailyReport(vm)
                    vm.screen == "sync" -> SyncCenter(vm)
                    vm.screen == "account" -> AccountScreen(vm)
                    vm.screen == "reports" -> ReportsScreen(vm)
                    vm.screen == "permissions" -> PermissionsScreen(vm, locationAction)
                    vm.screen.startsWith("module/") -> ModuleList(vm, vm.screen.substringAfter('/'))
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }
}

@Composable
fun Welcome(onContinue: () -> Unit) {
    Spacer(Modifier.height(16.dp))
    FieldCard(color = Navy) {
        FieldIcon("briefcase-medical", 32)
        Text(
            "Every visit.\nA stronger connection.",
            fontSize = 32.sp,
            lineHeight = 40.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
        Text(
            "Plan your day, meet your customers and report with confidence.",
            color = Color(0xFFBED1D7),
        )
    }
    Text("YOUR FIELD WORKSPACE", color = Brand, style = MaterialTheme.typography.bodyMedium)
    listOf(
            "Plan with purpose" to "Routes, schedules and joint working",
            "Capture the complete visit" to "Detailing, samples and business",
            "Stay connected" to "Offline work and transparent shift tracking",
        )
        .forEach { (a, b) ->
            FieldCard {
                Text(a, fontWeight = FontWeight.Bold)
                Text(b, color = Muted)
            }
        }
    Primary("Get started", onClick = onContinue)
}

@Composable
fun LoginScreen(vm: FieldViewModel) {
    var company by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var base by remember { mutableStateOf(vm.repo.vault.baseUrl) }
    Text("Welcome back", style = MaterialTheme.typography.headlineMedium)
    Text("Sign in with your company account.", color = Muted)
    Entry("Company code", company, { company = it }, true)
    Entry("Employee ID / email", email, { email = it }, true)
    Entry("Password", password, { password = it }, true, password = true)
    Entry("Company server URL", base, { base = it }, true)
    Message("Your company administrator provides your account and server address.")
    Primary(
        "Sign in",
        !vm.busy && company.isNotBlank() && email.isNotBlank() && password.isNotEmpty(),
    ) {
        vm.login(company, email, password, base)
    }
    Secondary("Forgot password?") {
        vm.message = "Contact your company administrator to verify your identity and reset access."
    }
}

@Composable
fun Home(vm: FieldViewModel, shiftAction: () -> Unit) {
    val date = localDate()
    val plan =
        vm.records("dayplan").find {
            it.text("date") == date && it.text("ownerId") == vm.user.text("id")
        }
    val visits = vm.records("visit").filter { it.text("date") == date }
    val customers = vm.records("customer").filter { it.text("assignedTo") == vm.user.text("id") }
    val next = customers.firstOrNull { c -> visits.none { it.text("customerId") == c.text("id") } }
    if (plan == null) {
        FieldCard(color = Navy) {
            Text(
                "Ready for the field?",
                color = Color.White,
                style = MaterialTheme.typography.titleLarge,
            )
            Text("Start with a clear plan for your day.", color = Color.White)
            Primary("Plan your day") { vm.navigate("plan") }
        }
    } else {
        FieldCard(color = Soft) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FieldIcon("calendar-days")
                Column {
                    Text("Your day, on track", fontWeight = FontWeight.Bold)
                    Text(
                        vm.names(plan.text("routeId")),
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.weight(1f)) {
            FieldCard {
                Text("Visits", color = Muted)
                Text(
                    "${visits.size} / ${customers.size}",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    "${(customers.size-visits.size).coerceAtLeast(0)} customers remaining",
                    color = Brand,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        Box(Modifier.weight(1f)) {
            FieldCard {
                Text("POB value", color = Muted)
                Text(
                    rupees(visits.sumOf { it.optDouble("orderTotal", 0.0) }),
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    "Captured customer orders",
                    color = Brand,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
    if (next != null)
        FieldCard(color = Navy) {
            Text("UP NEXT", color = Color(0xFFD9FF59), style = MaterialTheme.typography.bodyMedium)
            Text(
                next.text("name"),
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(next.text("specialty") + " · " + next.text("area"), color = Color.White)
            Primary("View visit") {
                vm.selected = next
                vm.screen = "detail"
            }
        }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(
                Triple("calls", "stethoscope", "Log a call"),
                Triple("module/expense", "wallet", "Expenses"),
                Triple("dcr", "calendar-days", "Daily report"),
            )
            .forEach { (route, icon, title) ->
                Box(Modifier.weight(1f)) {
                    Surface(
                        onClick = { vm.navigate(route) },
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, Line),
                        color = Color.White,
                    ) {
                        Column(
                            Modifier.fillMaxWidth().padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            FieldIcon(icon)
                            Text(title, fontSize = 11.sp)
                        }
                    }
                }
            }
    }
    FieldCard {
        Text(
            if (vm.repo.vault.shift.isEmpty()) "Shift tracking is off"
            else "Your work shift is active",
            fontWeight = FontWeight.Bold,
        )
        Text(
            if (vm.repo.vault.shift.isEmpty())
                "Start after planning. Location is shared during your shift with a visible notification."
            else "Tracking continues while the screen is locked. Auto-stop after 16 hours.",
            color = Muted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Primary(
            if (vm.repo.vault.shift.isEmpty()) "Start work shift" else "End work shift",
            plan != null && !vm.busy,
            onClick = shiftAction,
        )
        Secondary("Location permissions & status") { vm.navigate("permissions") }
    }
    Secondary("Sync saved work (${vm.repo.db.pending(vm.repo.owner).size})") { vm.navigate("sync") }
}

@Composable
fun Calls(vm: FieldViewModel) {
    var query by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("Doctor") }
    Choice(
        "Customer type",
        type,
        listOf("Doctor", "Chemist", "Hospital", "Stockist").map { it to it },
        { type = it },
    )
    Entry("Search customers", query, { query = it })
    val visits = vm.records("visit").filter { it.text("date") == localDate() }
    val customers =
        vm.records("customer").filter {
            it.text("assignedTo") == vm.user.text("id") &&
                it.text("type") == type &&
                it.text("name").contains(query, true)
        }
    if (customers.isEmpty())
        Message(
            "No matching customers. Try a different search or add a customer from your workspace."
        )
    customers.take(100).forEach { c ->
        FieldCard {
            Text(c.text("name"), style = MaterialTheme.typography.titleMedium)
            Text(
                c.text("specialty") + " · " + c.text("area") + " · " + c.text("class"),
                color = Muted,
            )
            Text(
                if (visits.any { it.text("customerId") == c.text("id") }) "Visited today"
                else "Planned customer",
                color = Brand,
                style = MaterialTheme.typography.bodyMedium,
            )
            Secondary("View customer") {
                vm.selected = c
                vm.screen = "detail"
            }
        }
    }
}

@Composable
fun Plan(vm: FieldViewModel) {
    val existing =
        vm.records("dayplan").find {
            it.text("date") == localDate() && it.text("ownerId") == vm.user.text("id")
        }
    if (existing != null) {
        FieldCard {
            Text("Day plan submitted", style = MaterialTheme.typography.titleLarge)
            Text(vm.names(existing.text("routeId")))
            Text(existing.text("workType"))
            Text(existing.text("notes"))
        }
        Secondary("Edit today’s plan") { vm.edit(existing) }
        Primary("Today’s visits") { vm.navigate("calls") }
    } else {
        Message("Choose your route and working type for ${localDate()}.")
        Primary("Create day plan") { vm.add("dayplan") }
        Text("Joint working and route selection are included in your plan.", color = Muted)
    }
}

@Composable
fun More(vm: FieldViewModel) {
    FieldCard(color = Navy) {
        Text(vm.user.text("name"), color = Color.White, style = MaterialTheme.typography.titleLarge)
        Text(vm.user.text("email"), color = Color(0xFFBED1D7))
        Text("YOUR COMPANY WORKSPACE", color = Color(0xFFD9FF59), fontSize = 11.sp)
    }
    vm.modules
        .groupBy { it.text("group") }
        .forEach { (group, list) ->
            Text(group.uppercase(), color = Brand, style = MaterialTheme.typography.bodyMedium)
            list.forEach { m ->
                Surface(
                    onClick = { vm.navigate("module/" + m.text("key")) },
                    shape = RoundedCornerShape(12.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Line),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        FieldIcon(m.text("icon"))
                        Text(m.text("title"), Modifier.weight(1f))
                        Text("›", color = Brand)
                    }
                }
            }
        }
    Secondary("Daily call reports") { vm.navigate("module/dcr") }
    Secondary("Stock & sales") {
        vm.navigate("stock")
        vm.screen = "module/inventory"
    }
    Secondary("Sync center") { vm.navigate("sync") }
    Secondary("Account & settings") { vm.navigate("account") }
    Secondary("Help & support") {
        vm.message =
            "Contact your company administrator with the record ID, date and the message shown. Your offline operations are available in Sync center."
    }
}
