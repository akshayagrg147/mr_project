package com.mrconnect.field

import androidx.compose.runtime.saveable.mapSaver
import androidx.compose.runtime.snapshots.SnapshotStateMap
import androidx.compose.runtime.toMutableStateMap

val StringMapSaver =
    mapSaver<SnapshotStateMap<String, String>>(
        save = { it.toMap() },
        restore = { it.mapValues { entry -> entry.value as String }.toList().toMutableStateMap() },
    )
val BooleanMapSaver =
    mapSaver<SnapshotStateMap<String, Boolean>>(
        save = { it.toMap() },
        restore = { it.mapValues { entry -> entry.value as Boolean }.toList().toMutableStateMap() },
    )
val StringListMapSaver =
    mapSaver<SnapshotStateMap<String, List<String>>>(
        save = { it.mapValues { entry -> ArrayList(entry.value) } },
        restore = {
            it.mapValues { entry -> (entry.value as ArrayList<*>).filterIsInstance<String>() }
                .toList()
                .toMutableStateMap()
        },
    )
