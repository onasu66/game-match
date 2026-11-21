import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_match_app/app_theme.dart';
import 'package:game_match_app/models/models.dart';
import 'package:game_match_app/screens/age_gate_screen.dart';
import 'package:game_match_app/screens/create_listing_screen.dart';
import 'package:game_match_app/services/api_client.dart';
import 'package:game_match_app/services/session.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'font_loader.dart';

class _FakeApi extends ApiClient {
  _FakeApi() : super(baseUrl: 'http://example.invalid');
}

SessionController _session({bool withUser = false}) {
  SharedPreferences.setMockInitialValues({
    'age_confirmed': true,
    if (withUser) 'auth_token': 'fake',
  });
  final session = SessionController(api: _FakeApi());
  session.bootstrapped = true;
  session.ageConfirmed = true;
  if (withUser) {
    session.user = User(
      id: 'u1',
      email: 'demo@example.com',
      displayName: 'DemoHost',
      birthDate: '2000-01-01',
      favoriteGames: const ['Valorant'],
      createdAt: '2026-01-01T00:00:00Z',
      ageVerified: true,
    );
  }
  return session;
}

void main() {
  setUpAll(loadAppFonts);

  testWidgets('age gate Japanese text uses Noto Sans JP (no tofu)', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: _session(),
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const AgeGateScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ゲーム通話'), findsOneWidget);
    expect(find.text('18歳以上です'), findsOneWidget);

    final theme = Theme.of(tester.element(find.text('ゲーム通話')));
    expect(theme.textTheme.bodyLarge?.fontFamily, kAppFontFamily);
    expect(theme.textTheme.headlineLarge?.fontFamily, kAppFontFamily);

    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/japanese_age_gate.png'),
    );
  });

  testWidgets('create listing form Japanese labels render with app theme', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: _session(withUser: true),
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const CreateListingScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('募集を作成'), findsOneWidget);
    expect(find.text('作成する'), findsOneWidget);
    expect(
      Theme.of(tester.element(find.text('作成する'))).textTheme.labelLarge?.fontFamily,
      kAppFontFamily,
    );

    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/japanese_create_listing.png'),
    );
  });
}
