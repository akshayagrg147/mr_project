package com.mrconnect.field

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.rememberAsyncImagePainter
import coil.decode.SvgDecoder
import coil.imageLoader

val Brand = Color(0xFF087F83)
val Navy = Color(0xFF12313C)
val Ink = Color(0xFF172F38)
val Muted = Color(0xFF526872)
val Canvas = Color(0xFFF5F8F9)
val Soft = Color(0xFFEAF4F3)
val Line = Color(0xFFDEE7E9)
@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
val Manrope =
    FontFamily(
        *listOf(400, 500, 600, 700, 800)
            .map { weight ->
                Font(
                    R.font.manrope,
                    weight = FontWeight(weight),
                    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
                )
            }
            .toTypedArray()
    )

@Composable
fun FieldTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme =
            lightColorScheme(
                primary = Brand,
                onPrimary = Color.White,
                secondary = Brand,
                background = Canvas,
                surface = Color.White,
                onSurface = Ink,
                onBackground = Ink,
                outline = Line,
            ),
        typography =
            Typography(
                bodyLarge = TextStyle(fontFamily = Manrope, fontSize = 14.sp, lineHeight = 22.sp),
                bodyMedium = TextStyle(fontFamily = Manrope, fontSize = 12.sp, lineHeight = 18.sp),
                titleLarge =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 20.sp,
                        lineHeight = 28.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                titleMedium =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 16.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                headlineMedium =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                    ),
                labelLarge =
                    TextStyle(
                        fontFamily = Manrope,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
            ),
        content = content,
    )
}

@Composable
fun FieldIcon(name: String, size: Int = 24) {
    val context = LocalContext.current
    val loader =
        androidx.compose.runtime.remember(context) {
            context.imageLoader.newBuilder().components { add(SvgDecoder.Factory()) }.build()
        }
    Image(
        painter = rememberAsyncImagePainter("file:///android_asset/icons/$name.svg", loader),
        contentDescription = null,
        modifier = Modifier.size(size.dp),
    )
}
