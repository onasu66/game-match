import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_match_app/app_theme.dart';
import 'package:game_match_app/models/models.dart';
import 'package:game_match_app/screens/call_screen.dart';
import 'package:game_match_app/screens/listing_detail_screen.dart';
import 'package:game_match_app/services/api_client.dart';
import 'package:game_match_app/services/session.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'font_loader.dart';

class _FakeApi extends ApiClient {
  _FakeApi() : super(baseUrl: 'http://example.invalid');

  @override
  Future<Listing> listingDetail(String id) async {
    return Listing(
      id: id,
      hostId: 'u1',
      hostDisplayName: 'DemoHost',
      game: 'Valorant',
      rankNote: 'Gold',
      slots: 5,
      description: 'LiveKit demo listing',
      voiceOptional: true,
      status: 'open',
      createdAt: '2026-01-01T00:00:00Z',
      memberCount: 2,
      members: [
        Member(
          userId: 'u1',
          displayName: 'DemoHost',
          email: 'demo@example.com',
          joinedAt: '2026-01-01T00:00:00Z',
        ),
        Member(
          userId: 'u2',
          displayName: 'GuestPlayer',
          email: 'guest@example.com',
          joinedAt: '2026-01-01T00:01:00Z',
        ),
      ],
      myRatings: const [MyRating(toUserId: 'u2', score: 4)],
    );
  }

  @override
  Future<CallCredentials> callToken(String listingId) async {
    throw ApiException('LiveKit 接続デモ用の擬似エラー（鍵未設定）', statusCode: 503);
  }
}

void main() {
  setUpAll(loadAppFonts);

  SessionController buildSession() {
    SharedPreferences.setMockInitialValues({
      'age_confirmed': true,
      'auth_token': 'fake',
    });
    final session = SessionController(api: _FakeApi());
    session.user = User(
      id: 'u1',
      email: 'demo@example.com',
      displayName: 'DemoHost',
      birthDate: '2000-01-01',
      favoriteGames: const ['Valorant'],
      createdAt: '2026-01-01T00:00:00Z',
      ageVerified: true,
    );
    session.bootstrapped = true;
    session.ageConfirmed = true;
    return session;
  }

  testWidgets('listing detail shows join-call button for member', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: buildSession(),
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const ListingDetailScreen(listingId: 'listing-demo'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('通話ルームに入る'), findsOneWidget);
    expect(find.textContaining('評価・通報'), findsOneWidget);
    expect(find.textContaining('あなたの評価: 4'), findsOneWidget);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/livekit_listing_call_button.png'),
    );
  });

  testWidgets('call screen shows error and retry when token fails', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: buildSession(),
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const CallScreen(listingId: 'listing-demo', gameTitle: 'Valorant'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('擬似エラー'), findsOneWidget);
    expect(find.text('再接続'), findsOneWidget);
    expect(find.text('戻る'), findsOneWidget);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/livekit_call_screen_error.png'),
    );
  });
}
