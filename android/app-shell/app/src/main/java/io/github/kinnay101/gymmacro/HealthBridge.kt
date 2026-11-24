package io.github.kinnay101.gymmacro

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.MealType
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Health Connect für die Web-App. Die Web-Seite ruft die Methoden über die Brücke "GymHC" auf
 * (Format siehe js/healthConnect.js im Web-Projekt). Alle Antworten sind JSON.
 */
class HealthBridge(private val context: Context) {

    companion object {
        const val PROVIDER = "com.google.android.apps.healthdata"

        /** Rechte, die die App anfragt (müssen auch im Manifest stehen). */
        val PERMISSIONS = setOf(
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(BodyFatRecord::class),
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getWritePermission(NutritionRecord::class),
        )

        /** "android.permission.health.READ_STEPS" → "read_steps" */
        fun shortName(p: String) = p.substringAfterLast('.').lowercase()
    }

    private fun sdkStatus() = HealthConnectClient.getSdkStatus(context, PROVIDER)
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    suspend fun granted(): Set<String> =
        if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) client.permissionController.getGrantedPermissions() else emptySet()

    suspend fun status(): JSONObject {
        val s = sdkStatus()
        val o = JSONObject()
            .put("available", s == HealthConnectClient.SDK_AVAILABLE)
            .put("needsUpdate", s == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
        o.put("granted", JSONArray(granted().filter { it in PERMISSIONS }.map(::shortName)))
        return o
    }

    /** Health-Connect-Einstellungen bzw. Play Store, falls nicht installiert / veraltet. */
    fun settingsIntent(): Intent =
        if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) {
            Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding"))
                .setPackage("com.android.vending")
        }

    // ---------- Lesen ----------
    suspend fun read(params: JSONObject): JSONObject {
        val from = Instant.parse(params.getString("from"))
        val to = Instant.parse(params.getString("to"))
        val zone = ZoneId.systemDefault()
        val g = granted()
        fun has(type: KClass<out Record>) = HealthPermission.getReadPermission(type) in g
        val out = JSONObject()

        // Tagessummen: Health Connect rechnet Doppelte (Handy + Uhr) selbst heraus
        val metrics = buildSet {
            if (has(StepsRecord::class)) add(StepsRecord.COUNT_TOTAL)
            if (has(ActiveCaloriesBurnedRecord::class)) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
            if (has(DistanceRecord::class)) add(DistanceRecord.DISTANCE_TOTAL)
        }
        val days = JSONArray()
        if (metrics.isNotEmpty()) {
            val start = LocalDateTime.ofInstant(from, zone).toLocalDate().atStartOfDay()
            val end = LocalDateTime.ofInstant(to, zone)
            val groups = client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(metrics, TimeRangeFilter.between(start, end), Period.ofDays(1)),
            )
            for (grp in groups) {
                val r = grp.result
                val o = JSONObject().put("date", grp.startTime.toLocalDate().toString())
                r[StepsRecord.COUNT_TOTAL]?.let { o.put("steps", it) }
                r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { o.put("activeKcal", it.inKilocalories) }
                r[DistanceRecord.DISTANCE_TOTAL]?.let { o.put("distanceKm", it.inKilometers) }
                if (o.length() > 1) days.put(o)
            }
        }
        out.put("days", days)

        val range = TimeRangeFilter.between(from, to)
        out.put("weights", JSONArray().apply {
            if (has(WeightRecord::class)) readAll(WeightRecord::class, range).forEach {
                put(JSONObject().put("time", it.time.toString()).put("kg", it.weight.inKilograms))
            }
        })
        out.put("bodyFat", JSONArray().apply {
            if (has(BodyFatRecord::class)) readAll(BodyFatRecord::class, range).forEach {
                put(JSONObject().put("time", it.time.toString()).put("percent", it.percentage.value))
            }
        })

        val exercise = JSONArray()
        if (has(ExerciseSessionRecord::class)) {
            // Werte pro Training (nur, was erlaubt ist – sonst wirft Health Connect einen Fehler)
            val perSession = buildSet {
                if (has(ActiveCaloriesBurnedRecord::class)) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
                if (has(DistanceRecord::class)) add(DistanceRecord.DISTANCE_TOTAL)
                if (has(HeartRateRecord::class)) add(HeartRateRecord.BPM_AVG)
            }
            for (s in readAll(ExerciseSessionRecord::class, range)) {
                val o = JSONObject()
                    .put("start", s.startTime.toString()).put("end", s.endTime.toString())
                    .put("type", exerciseName(s.exerciseType)).put("title", s.title ?: "")
                if (perSession.isNotEmpty()) {
                    val a = client.aggregate(AggregateRequest(perSession, TimeRangeFilter.between(s.startTime, s.endTime)))
                    a[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { o.put("kcal", it.inKilocalories) }
                    a[DistanceRecord.DISTANCE_TOTAL]?.let { o.put("km", it.inKilometers) }
                    a[HeartRateRecord.BPM_AVG]?.let { o.put("avgHr", it) }
                }
                exercise.put(o)
            }
        }
        out.put("exercise", exercise)

        val sleep = JSONArray()
        if (has(SleepSessionRecord::class)) {
            // Nächte, die vor "from" beginnen, auch mitnehmen
            for (s in readAll(SleepSessionRecord::class, TimeRangeFilter.between(from.minusSeconds(16 * 3600), to))) {
                val stages = JSONArray()
                s.stages.forEach {
                    stages.put(JSONObject().put("start", it.startTime.toString()).put("end", it.endTime.toString()).put("stage", stageName(it.stage)))
                }
                sleep.put(JSONObject().put("start", s.startTime.toString()).put("end", s.endTime.toString()).put("stages", stages))
            }
        }
        out.put("sleep", sleep)
        return out
    }

    private suspend fun <T : Record> readAll(type: KClass<T>, range: TimeRangeFilter): List<T> {
        val all = mutableListOf<T>()
        var token: String? = null
        do {
            val r = client.readRecords(ReadRecordsRequest(type, range, pageToken = token))
            all += r.records
            token = r.pageToken
        } while (!token.isNullOrEmpty())
        return all
    }

    private fun exerciseName(t: Int): String = when (t) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running_treadmill"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "biking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "biking_stationary"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "swimming_pool"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming_open_water"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING -> "rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing_machine"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING -> "stair_climbing"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "stair_climbing_machine"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength_training"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "weightlifting"
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "calisthenics"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "high_intensity_interval_training"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "pilates"
        else -> "other"
    }

    private fun stageName(s: Int): String = when (s) {
        SleepSessionRecord.STAGE_TYPE_AWAKE -> "awake"
        SleepSessionRecord.STAGE_TYPE_SLEEPING -> "sleeping"
        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> "out_of_bed"
        SleepSessionRecord.STAGE_TYPE_LIGHT -> "light"
        SleepSessionRecord.STAGE_TYPE_DEEP -> "deep"
        SleepSessionRecord.STAGE_TYPE_REM -> "rem"
        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "awake_in_bed"
        else -> "unknown"
    }

    // ---------- Mahlzeiten schreiben ----------
    private fun gramsOrNull(o: JSONObject, key: String): Mass? =
        if (o.has(key) && !o.isNull(key)) Mass.grams(o.getDouble(key)) else null

    suspend fun writeNutrition(params: JSONObject): JSONObject {
        if (HealthPermission.getWritePermission(NutritionRecord::class) !in granted()) throw SecurityException("write_nutrition not granted")
        val zone = ZoneId.systemDefault()
        val version = System.currentTimeMillis() // höhere Version ersetzt den Eintrag mit derselben clientRecordId
        val upsert = params.optJSONArray("upsert") ?: JSONArray()
        val records = (0 until upsert.length()).map { i ->
            val o = upsert.getJSONObject(i)
            val start = Instant.parse(o.getString("start"))
            val end = Instant.parse(o.getString("end"))
            NutritionRecord(
                startTime = start,
                startZoneOffset = zone.rules.getOffset(start),
                endTime = end,
                endZoneOffset = zone.rules.getOffset(end),
                metadata = Metadata.manualEntry(clientRecordId = o.getString("id"), clientRecordVersion = version),
                energy = Energy.kilocalories(o.optDouble("kcal", 0.0)),
                protein = Mass.grams(o.optDouble("proteinG", 0.0)),
                totalCarbohydrate = Mass.grams(o.optDouble("carbsG", 0.0)),
                totalFat = Mass.grams(o.optDouble("fatG", 0.0)),
                dietaryFiber = Mass.grams(o.optDouble("fiberG", 0.0)),
                sugar = Mass.grams(o.optDouble("sugarG", 0.0)),
                sodium = Mass.grams(o.optDouble("sodiumG", 0.0)),
                // Nur wenn die Web-App sie kennt (alle Einträge der Mahlzeit mit Angabe), sonst leer lassen
                saturatedFat = gramsOrNull(o, "saturatedFatG"),
                unsaturatedFat = gramsOrNull(o, "unsaturatedFatG"),
                name = o.optString("name").take(200).ifBlank { null },
                mealType = when (o.optString("mealType")) {
                    "breakfast" -> MealType.MEAL_TYPE_BREAKFAST
                    "lunch" -> MealType.MEAL_TYPE_LUNCH
                    "dinner" -> MealType.MEAL_TYPE_DINNER
                    "snack" -> MealType.MEAL_TYPE_SNACK
                    else -> MealType.MEAL_TYPE_UNKNOWN
                },
            )
        }
        if (records.isNotEmpty()) client.insertRecords(records)
        val remove = params.optJSONArray("remove") ?: JSONArray()
        val ids = (0 until remove.length()).map { remove.getString(it) }.filter { it.startsWith("gmt-") }
        if (ids.isNotEmpty()) client.deleteRecords(NutritionRecord::class, emptyList(), ids)
        return JSONObject().put("written", records.size).put("removed", ids.size)
    }
}
