package com.mrconnect.field
/** Client preview only; the API independently verifies and stores location evidence. */
object TrackingRules {
    fun evidenceProblem(
        nowMillis: Long,
        observedMillis: Long,
        accuracy: Double,
        mocked: Boolean,
        hasMaster: Boolean,
        distance: Double?,
        maxAccuracy: Double,
        radius: Double,
    ): String? =
        when {
            mocked -> "Android reported a mock location"
            kotlin.math.abs(nowMillis - observedMillis) > 120000 ->
                "Location is older than two minutes or has an invalid time"
            !accuracy.isFinite() || accuracy < 0 || accuracy > maxAccuracy ->
                "Location accuracy is outside company policy"
            !hasMaster || distance == null -> "Customer master location is missing"
            distance > radius -> "Visit is outside the verification radius"
            else -> null
        }
}
