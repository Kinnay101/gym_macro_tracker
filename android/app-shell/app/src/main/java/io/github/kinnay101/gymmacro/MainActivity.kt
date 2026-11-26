package io.github.kinnay101.gymmacro

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Hülle um die Web-App: zeigt sie in einer WebView und stellt ihr Health Connect über die Brücke "GymHC" bereit.
 * Die Brücke bekommt nur die eigene Adresse (fremde Seiten nicht). Fremde Links öffnen im Browser.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val APP_URL = "https://kinnay101.github.io/gym_macro_tracker/"
        const val APP_ORIGIN = "https://kinnay101.github.io"
        const val APP_PATH = "/gym_macro_tracker/"
        // Nur Debug-Build: lokale Vorschau über "adb reverse tcp:8010 tcp:8010"
        const val DEV_ORIGIN = "http://localhost:8010"
    }

    private lateinit var web: WebView
    private lateinit var health: HealthBridge
    private var startUrl = APP_URL

    // Health-Connect-Rechte anfragen
    private var pendingPermissionReply: Pair<JavaScriptReplyProxy, Int>? = null
    private val healthPermissionLauncher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) {
        val (proxy, id) = pendingPermissionReply ?: return@registerForActivityResult
        pendingPermissionReply = null
        lifecycleScope.launch { reply(proxy, id) { health.status() } }
    }

    // Kamera für den Barcode-Scanner der Web-App
    private var pendingCamera: PermissionRequest? = null
    private val cameraLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val req = pendingCamera ?: return@registerForActivityResult
        pendingCamera = null
        if (ok) req.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else req.deny()
    }

    // Datei wählen (Daten importieren)
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
        fileCallback = null
    }

    // Datei speichern (Daten exportieren): Android-Dialog „Speichern unter“, danach Text hineinschreiben.
    // Die WebView kann blob:-Downloads der Web-App nicht speichern → Export ging in 1.3 still nicht.
    private var pendingSave: Triple<JavaScriptReplyProxy, Int, String>? = null
    private val saveLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val (proxy, id, text) = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        if (uri == null) { send(proxy, JSONObject().put("id", id).put("ok", true).put("result", JSONObject().put("saved", false))); return@registerForActivityResult }
        lifecycleScope.launch {
            reply(proxy, id) {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) } ?: error("no stream")
                }
                JSONObject().put("saved", true)
            }
        }
    }

    private fun allowedOrigins(): Set<String> = if (BuildConfig.DEBUG) setOf(APP_ORIGIN, DEV_ORIGIN) else setOf(APP_ORIGIN)

    private fun isOwnPage(uri: Uri): Boolean {
        val origin = "${uri.scheme}://${uri.authority}"
        if (origin == APP_ORIGIN) return (uri.path ?: "").startsWith(APP_PATH)
        return BuildConfig.DEBUG && origin == DEV_ORIGIN
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Web-App ist immer dunkel → helle Symbole in Status- und Navigationsleiste
        enableEdgeToEdge(
            statusBarStyle = androidx.activity.SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = androidx.activity.SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        setContentView(R.layout.activity_main)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            // Ränder sind hier schon als Abstand berücksichtigt → nicht an die WebView weitergeben.
            // Sonst rechnet die Web-App (neuere WebView, env(safe-area-inset-bottom)) den Rand ein zweites Mal
            // und unten entsteht ein grosser leerer Balken (gemeldet auf Galaxy S24+, One UI 9).
            WindowInsetsCompat.CONSUMED
        }

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        health = HealthBridge(this)
        web = findViewById(R.id.web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        // Versionsnummer der Hülle für die Web-App (Anzeige „1.3.55“ unter Körper und im Feedback)
        web.settings.userAgentString = "${web.settings.userAgentString} GymMacroApp/${BuildConfig.VERSION_NAME}"

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isOwnPage(request.url)) return false
                // Alles andere (z. B. Supabase-Mail-Links, Quellenhinweise) im Browser öffnen
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: ActivityNotFoundException) { }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // request.origin ist nur die Herkunft ("https://kinnay101.github.io/", ohne Pfad) → nur die Herkunft vergleichen
                val origin = "${request.origin.scheme}://${request.origin.authority}"
                val own = origin in allowedOrigins()
                if (!own || PermissionRequest.RESOURCE_VIDEO_CAPTURE !in request.resources) { request.deny(); return }
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    pendingCamera = request
                    cameraLauncher.launch(Manifest.permission.CAMERA)
                }
            }

            override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) android.util.Log.i("GymWeb", "${m.messageLevel()} ${m.sourceId()}:${m.lineNumber()} ${m.message()}")
                return BuildConfig.DEBUG
            }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try { fileLauncher.launch(params.createIntent()); true } catch (_: ActivityNotFoundException) { fileCallback = null; false }
            }
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "GymHC", allowedOrigins()) { _, message, sourceOrigin, isMainFrame, proxy ->
                if (!isMainFrame || sourceOrigin.toString().trimEnd('/') !in allowedOrigins()) return@addWebMessageListener
                handleMessage(message.data ?: return@addWebMessageListener, proxy)
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })

        // Debug-Build: andere Start-Adresse zum Testen (adb shell am start ... --es url http://localhost:8010/)
        if (BuildConfig.DEBUG) intent.getStringExtra("url")?.let { if (isOwnPage(Uri.parse(it))) startUrl = it }
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(startUrl)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // ---------- Brücke ----------
    private fun handleMessage(data: String, proxy: JavaScriptReplyProxy) {
        val msg = try { JSONObject(data) } catch (_: Exception) { return }
        val id = msg.optInt("id")
        val params = msg.optJSONObject("params") ?: JSONObject()
        when (msg.optString("method")) {
            "status" -> lifecycleScope.launch { reply(proxy, id) { health.status() } }
            "read" -> lifecycleScope.launch { reply(proxy, id) { health.read(params) } }
            "writeNutrition" -> lifecycleScope.launch { reply(proxy, id) { health.writeNutrition(params) } }
            // Nur Debug-Build: Beispielwerte nach Health Connect schreiben (Test im Emulator ohne echte Geräte)
            "debugInsertTestData" -> if (BuildConfig.DEBUG) lifecycleScope.launch { reply(proxy, id) { DebugData.insert(this@MainActivity) } }
            "debugReadNutrition" -> if (BuildConfig.DEBUG) lifecycleScope.launch { reply(proxy, id) { DebugData.readNutrition(this@MainActivity) } }
            "requestPermissions" -> {
                pendingPermissionReply = proxy to id
                try {
                    healthPermissionLauncher.launch(if (BuildConfig.DEBUG) HealthBridge.PERMISSIONS + DebugData.PERMISSIONS else HealthBridge.PERMISSIONS)
                } catch (e: Exception) {
                    pendingPermissionReply = null
                    send(proxy, JSONObject().put("id", id).put("ok", false).put("error", e.message ?: "error"))
                }
            }
            "saveFile" -> {
                val name = params.optString("name").ifBlank { "gym-macro-tracker.json" }.replace(Regex("[^A-Za-z0-9._-]"), "_")
                pendingSave = Triple(proxy, id, params.optString("text"))
                try { saveLauncher.launch(name) } catch (e: ActivityNotFoundException) {
                    pendingSave = null
                    send(proxy, JSONObject().put("id", id).put("ok", false).put("error", "no file dialog"))
                }
            }
            "openSettings" -> {
                val ok = try { startActivity(health.settingsIntent()); true } catch (_: ActivityNotFoundException) { false }
                send(proxy, JSONObject().put("id", id).put("ok", ok).put("result", JSONObject()).put("error", if (ok) null else "no settings"))
            }
            else -> send(proxy, JSONObject().put("id", id).put("ok", false).put("error", "unknown method"))
        }
    }

    private suspend fun reply(proxy: JavaScriptReplyProxy, id: Int, block: suspend () -> JSONObject) {
        val msg = try {
            JSONObject().put("id", id).put("ok", true).put("result", block())
        } catch (e: Exception) {
            JSONObject().put("id", id).put("ok", false).put("error", "${e.javaClass.simpleName}: ${e.message}")
        }
        send(proxy, msg)
    }

    private fun send(proxy: JavaScriptReplyProxy, msg: JSONObject) {
        runOnUiThread { proxy.postMessage(msg.toString()) }
    }
}
