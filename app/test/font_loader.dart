import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<ByteData> _loadFile(String path) async {
  final bytes = await File(path).readAsBytes();
  return ByteData.view(bytes.buffer);
}

/// Load fonts needed for readable Japanese + Material icons in widget tests.
Future<void> loadAppFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();

  final noto = FontLoader('NotoSansJP')
    ..addFont(rootBundle.load('assets/fonts/NotoSansJP-Regular.ttf'))
    ..addFont(rootBundle.load('assets/fonts/NotoSansJP-Bold.ttf'));
  await noto.load();

  // Material Icons are not always registered in golden/test runs.
  final flutterRoot = Platform.environment['FLUTTER_ROOT'] ??
      File(Platform.resolvedExecutable).parent.parent.path;
  final candidates = <String>[
    if (Platform.environment['FLUTTER_ROOT'] != null)
      '${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    '$flutterRoot/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    '/tmp/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  ];
  for (final iconPath in candidates) {
    if (File(iconPath).existsSync()) {
      final icons = FontLoader('MaterialIcons')
        ..addFont(_loadFile(iconPath));
      await icons.load();
      break;
    }
  }
}
