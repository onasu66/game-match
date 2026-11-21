import 'package:flutter/material.dart';

/// Bundled Noto Sans JP family (see pubspec fonts).
const String kAppFontFamily = 'NotoSansJP';

ThemeData buildAppTheme({Brightness brightness = Brightness.light}) {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: const Color(0xFF1F6F5F),
    brightness: brightness,
  );

  // Do not set ThemeData.fontFamily — that overrides Material Icons and
  // turns icon glyphs into tofu (□). Apply the CJK face only on text themes.
  final base = ThemeData(
    colorScheme: colorScheme,
    useMaterial3: true,
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
    ),
  );

  final textTheme = base.textTheme.apply(
    fontFamily: kAppFontFamily,
    fontFamilyFallback: const [kAppFontFamily],
  );
  final primaryTextTheme = base.primaryTextTheme.apply(
    fontFamily: kAppFontFamily,
    fontFamilyFallback: const [kAppFontFamily],
  );

  return base.copyWith(
    textTheme: textTheme,
    primaryTextTheme: primaryTextTheme,
    appBarTheme: base.appBarTheme.copyWith(
      titleTextStyle: textTheme.titleLarge?.copyWith(
        color: colorScheme.onSurface,
        fontWeight: FontWeight.w600,
      ),
    ),
    floatingActionButtonTheme: base.floatingActionButtonTheme.copyWith(
      extendedTextStyle: textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w600,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        textStyle: textTheme.labelLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        textStyle: textTheme.labelLarge,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        textStyle: textTheme.labelLarge,
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      labelStyle: textTheme.labelLarge,
    ),
  );
}
