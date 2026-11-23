package io.github.kinnay101.gymmacro

import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/** Datenschutz-Erklärung, die Health Connect beim Erlauben der Rechte anzeigt (Pflicht). */
class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            text = getString(R.string.privacy_text)
            setTextColor(ContextCompat.getColor(context, R.color.app_text))
            textSize = 16f
            setLineSpacing(0f, 1.3f)
            setPadding(pad, pad * 2, pad, pad)
        }
        setContentView(ScrollView(this).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.app_bg))
            addView(text)
        })
        title = getString(R.string.privacy_title)
    }
}
