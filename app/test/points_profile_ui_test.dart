import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game_match_app/app_theme.dart';
import 'package:game_match_app/models/models.dart';
import 'package:game_match_app/screens/create_listing_screen.dart';
import 'package:game_match_app/screens/profile_screen.dart';
import 'package:game_match_app/services/api_client.dart';
import 'package:game_match_app/services/session.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'font_loader.dart';

class _FakeApi extends ApiClient {
  _FakeApi() : super(baseUrl: 'http://example.invalid');

  @override
  Future<BillingStatus> billingStatus() async {
    await Future<void>.value();
    return BillingStatus(
      isPremium: false,
      plan: 'free',
      maxOpenListings: 1,
      freeMaxOpenListings: 1,
      premiumMaxOpenListings: 5,
      premiumDurationDays: 30,
      premiumPriceJpy: 480,
      productName: 'プレミアム',
      stripeEnabled: false,
      mockPurchaseAvailable: true,
      pointsBalance: 450,
      packs: [
        PointPack(
          id: 'points_100',
          points: 100,
          priceJpy: 120,
          name: 'ポイント 100',
          description: 'd',
        ),
        PointPack(
          id: 'points_500',
          points: 500,
          priceJpy: 480,
          name: 'ポイント 500',
          description: 'd',
        ),
        PointPack(
          id: 'points_1000',
          points: 1000,
          priceJpy: 900,
          name: 'ポイント 1000',
          description: 'd',
        ),
      ],
      extraListingCost: 50,
      callCost: 20,
      freeCallsPerDay: 1,
      freeCallsRemainingToday: 1,
      rulesJa: const ['募集作成: 無料で同時 1 件。それ以上は 50 pt/件（上限 10）。'],
      history: [
        PointLedgerEntry(
          id: '1',
          delta: 500,
          balanceAfter: 500,
          reason: 'purchase_points_500',
          createdAt: '2026-11-21T14:00:00Z',
        ),
        PointLedgerEntry(
          id: '2',
          delta: -50,
          balanceAfter: 450,
          reason: 'spend_extra_listing',
          createdAt: '2026-11-21T14:01:00Z',
        ),
      ],
    );
  }

  @override
  Future<RatingSummary> myRatingSummary() async {
    await Future<void>.value();
    return RatingSummary(count: 0);
  }
}

void main() {
  setUpAll(loadAppFonts);

  testWidgets('profile shows points packs history and rules', (tester) async {
    await tester.binding.setSurfaceSize(const Size(420, 1800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    SharedPreferences.setMockInitialValues({
      'age_confirmed': true,
      'auth_token': 't',
    });
    final session = SessionController(api: _FakeApi());
    session.user = User(
      id: '1',
      email: 'a@b.c',
      displayName: 'ポイント太郎',
      birthDate: '2000-01-01',
      favoriteGames: const ['Valorant'],
      createdAt: 'x',
      ageVerified: true,
      pointsBalance: 450,
    );
    session.bootstrapped = true;
    session.ageConfirmed = true;

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const ProfileScreen(),
        ),
      ),
    );
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.textContaining('450 pt'), findsWidgets);
    expect(find.textContaining('ポイント 100 ·'), findsOneWidget);
    expect(find.textContaining('ポイント 500 ·'), findsOneWidget);
    expect(find.textContaining('ポイント 1000 ·'), findsOneWidget);
    expect(find.text('モック'), findsWidgets);
    expect(find.text('追加募集'), findsOneWidget);
    expect(find.text('ポイント購入'), findsOneWidget);
  });

  testWidgets('create listing mentions extra listing point cost', (tester) async {
    SharedPreferences.setMockInitialValues({
      'age_confirmed': true,
      'auth_token': 't',
    });
    final session = SessionController(api: _FakeApi());
    session.user = User(
      id: '1',
      email: 'a@b.c',
      displayName: 'ポイント太郎',
      birthDate: '2000-01-01',
      favoriteGames: const ['Valorant'],
      createdAt: 'x',
      ageVerified: true,
      pointsBalance: 100,
    );
    session.bootstrapped = true;
    session.ageConfirmed = true;

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const CreateListingScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('50pt'), findsOneWidget);
  });
}
