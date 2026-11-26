package io.github.kinnay101.gymmacro

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Nur für den Debug-Build: Beispielwerte nach Health Connect schreiben und Mahlzeiten zurücklesen,
 * damit sich die App im Emulator ohne Uhr/Handy testen lässt. Wird im Release-Build nie aufgerufen.
 */
object DebugData {
    val PERMISSIONS = setOf(
        HealthPermission.getWritePermission(StepsRecord::class),
        HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class),
        HealthPermission.getWritePermission(BodyFatRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(NutritionRecord::class),
    )

    private fun at(day: LocalDate, h: Int, m: Int = 0): ZonedDateTime = day.atTime(h, m).atZone(ZoneId.systemDefault())

    suspend fun insert(context: Context): JSONObject {
        val c = HealthConnectClient.getOrCreate(context)
        val y = LocalDate.now().minusDays(1)
        val meta = { id: String -> Metadata.manualEntry(clientRecordId = "gmt-test-$id-$y", clientRecordVersion = System.currentTimeMillis()) }
        fun off(z: ZonedDateTime) = z.offset
        val records = listOf(
            // Schritte über den Tag verteilt
            StepsRecord(at(y, 8).toInstant(), off(at(y, 8)), at(y, 12).toInstant(), off(at(y, 12)), 4200, meta("steps1")),
            StepsRecord(at(y, 14).toInstant(), off(at(y, 14)), at(y, 19).toInstant(), off(at(y, 19)), 6345, meta("steps2")),
            ActiveCaloriesBurnedRecord(at(y, 8).toInstant(), off(at(y, 8)), at(y, 20).toInstant(), off(at(y, 20)), Energy.kilocalories(612.0), meta("active")),
            DistanceRecord(at(y, 8).toInstant(), off(at(y, 8)), at(y, 20).toInstant(), off(at(y, 20)), Length.kilometers(8.4), meta("dist")),
            WeightRecord(at(y, 7, 5).toInstant(), off(at(y, 7, 5)), Mass.kilograms(78.6), meta("weight")),
            BodyFatRecord(at(y, 7, 5).toInstant(), off(at(y, 7, 5)), Percentage(13.8), meta("bf")),
            ExerciseSessionRecord(
                startTime = at(y, 17, 30).toInstant(), startZoneOffset = off(at(y, 17, 30)),
                endTime = at(y, 18, 40).toInstant(), endZoneOffset = off(at(y, 18, 40)),
                metadata = meta("strength"),
                exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, title = "Push Day",
            ),
            // Werte, die die Uhr während des Laufs schreibt (liegen ganz im Training)
            ActiveCaloriesBurnedRecord(at(y, 7, 31).toInstant(), off(at(y, 7, 31)), at(y, 8, 4).toInstant(), off(at(y, 8, 4)), Energy.kilocalories(318.0), meta("run-kcal")),
            DistanceRecord(at(y, 7, 31).toInstant(), off(at(y, 7, 31)), at(y, 8, 4).toInstant(), off(at(y, 8, 4)), Length.kilometers(5.6), meta("run-km")),
            ExerciseSessionRecord(
                startTime = at(y, 7, 30).toInstant(), startZoneOffset = off(at(y, 7, 30)),
                endTime = at(y, 8, 5).toInstant(), endZoneOffset = off(at(y, 8, 5)),
                metadata = meta("run"),
                exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, title = "Morgenlauf",
            ),
            // Nacht auf heute mit Schlafphasen
            run {
                val s = at(y, 23, 10); val e = at(y.plusDays(1), 6, 50)
                fun st(a: ZonedDateTime, b: ZonedDateTime, t: Int) = SleepSessionRecord.Stage(a.toInstant(), b.toInstant(), t)
                SleepSessionRecord(
                    startTime = s.toInstant(), startZoneOffset = off(s), endTime = e.toInstant(), endZoneOffset = off(e),
                    metadata = meta("sleep"),
                    stages = listOf(
                        st(s, at(y.plusDays(1), 1, 0), SleepSessionRecord.STAGE_TYPE_LIGHT),
                        st(at(y.plusDays(1), 1, 0), at(y.plusDays(1), 2, 30), SleepSessionRecord.STAGE_TYPE_DEEP),
                        st(at(y.plusDays(1), 2, 30), at(y.plusDays(1), 3, 40), SleepSessionRecord.STAGE_TYPE_REM),
                        st(at(y.plusDays(1), 3, 40), at(y.plusDays(1), 3, 55), SleepSessionRecord.STAGE_TYPE_AWAKE),
                        st(at(y.plusDays(1), 3, 55), e, SleepSessionRecord.STAGE_TYPE_LIGHT),
                    ),
                )
            },
        )
        c.insertRecords(records)
        return JSONObject().put("inserted", records.size)
    }

    /** Was die App an Mahlzeiten nach Health Connect geschrieben hat (letzte 8 Tage). */
    suspend fun readNutrition(context: Context): JSONObject {
        val c = HealthConnectClient.getOrCreate(context)
        val r = c.readRecords(ReadRecordsRequest(NutritionRecord::class, TimeRangeFilter.between(Instant.now().minusSeconds(8 * 86400), Instant.now().plusSeconds(86400))))
        val arr = JSONArray()
        r.records.forEach {
            arr.put(JSONObject().put("id", it.metadata.clientRecordId).put("kcal", it.energy?.inKilocalories).put("protein", it.protein?.inGrams)
                .put("sodium", it.sodium?.inGrams).put("fat", it.totalFat?.inGrams).put("satFat", it.saturatedFat?.inGrams).put("unsatFat", it.unsaturatedFat?.inGrams).put("meal", it.mealType).put("name", it.name).put("start", it.startTime.toString()))
        }
        return JSONObject().put("records", arr)
    }
}
