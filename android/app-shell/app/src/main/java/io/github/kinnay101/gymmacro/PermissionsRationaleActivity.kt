package io.github.kinnay101.gymmacro

import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Datenschutz-Erklärung, die Health Connect beim Erlauben der Rechte anzeigt (Pflicht).
 * Mit Kopf „‹ Zurück“ + Titel und Abstand zu Status-/Navigationsleiste (vorher nur Fliesstext ohne Zurück).
 * Sprache kommt aus res/values(-de)/strings.xml – auf einem deutschen Handy deutsch.
 */
class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        val d = resources.displayMetrics.density
        val pad = (24 * d).toInt()
        val textColor = ContextCompat.getColor(this, R.color.app_text)
        val back = TextView(this).apply {
            text = "‹  " + getString(R.string.privacy_back)
            textSize = 17f
            setTextColor(ContextCompat.getColor(context, R.color.accent))
            setPadding(pad, (14 * d).toInt(), pad, (14 * d).toInt())
            isClickable = true
            setOnClickListener { finish() }
        }
        val title = TextView(this).apply {
            text = getString(R.string.privacy_title)
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textColor)
            setPadding(pad, 0, pad, (8 * d).toInt())
        }
        val body = TextView(this).apply {
            text = getString(R.string.privacy_text)
            setTextColor(textColor)
            textSize = 16f
            setLineSpacing(0f, 1.3f)
            setPadding(pad, (8 * d).toInt(), pad, pad)
        }
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(back); addView(title); addView(body)
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.app_bg))
            addView(column)
        }
        setContentView(scroll)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        this.title = getString(R.string.privacy_title)
    }
}
