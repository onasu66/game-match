import 'package:flutter_test/flutter_test.dart';
import 'package:game_match_app/main.dart';

void main() {
  testWidgets('app boots to age gate or loading', (tester) async {
    await tester.pumpWidget(const GameMatchApp());
    await tester.pump();
    expect(find.byType(GameMatchApp), findsOneWidget);
  });
}
