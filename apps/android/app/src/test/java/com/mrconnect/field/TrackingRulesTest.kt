package com.mrconnect.field

import org.junit.Assert.*
import org.junit.Test

class TrackingRulesTest {
    @Test
    fun validEvidence() {
        assertNull(
            TrackingRules.evidenceProblem(200000, 190000, 10.0, false, true, 50.0, 100.0, 200.0)
        )
    }

    @Test
    fun mockCannotBeVerifiedEvenAtMaster() {
        assertTrue(
            TrackingRules.evidenceProblem(200000, 190000, 1.0, true, true, 0.0, 100.0, 200.0)!!
                .contains("mock")
        )
    }

    @Test
    fun staleAndFutureTimesFail() {
        for (time in listOf(1L, 400000L)) assertNotNull(
            TrackingRules.evidenceProblem(200000, time, 10.0, false, true, 0.0, 100.0, 200.0)
        )
    }

    @Test
    fun uncertaintyAndMissingMasterFail() {
        assertNotNull(
            TrackingRules.evidenceProblem(200000, 190000, 101.0, false, true, 0.0, 100.0, 200.0)
        )
        assertNotNull(
            TrackingRules.evidenceProblem(200000, 190000, 10.0, false, false, null, 100.0, 200.0)
        )
    }

    @Test
    fun boundaryAndInvalidNumbers() {
        assertNull(
            TrackingRules.evidenceProblem(200000, 190000, 100.0, false, true, 200.0, 100.0, 200.0)
        )
        assertNotNull(
            TrackingRules.evidenceProblem(
                200000,
                190000,
                Double.NaN,
                false,
                true,
                0.0,
                100.0,
                200.0,
            )
        )
        assertNotNull(
            TrackingRules.evidenceProblem(200000, 190000, 10.0, false, true, 201.0, 100.0, 200.0)
        )
    }
}
