import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';

import 'app_theme.dart';
import 'screens/age_gate_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/listings_screen.dart';
import 'services/session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Enable DOM semantics so automated demos / a11y tools can find controls.
  SemanticsBinding.instance.ensureSemantics();
  runApp(const GameMatchApp());
}

class GameMatchApp extends StatefulWidget {
  const GameMatchApp({super.key});

  @override
  State<GameMatchApp> createState() => _GameMatchAppState();
}

class _GameMatchAppState extends State<GameMatchApp> {
  final SessionController _session = SessionController();

  @override
  void initState() {
    super.initState();
    _session.bootstrap();
  }

  @override
  void dispose() {
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _session,
      child: MaterialApp(
        title: 'ゲーム通話',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: Consumer<SessionController>(
          builder: (context, session, _) {
            if (!session.bootstrapped) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            if (!session.ageConfirmed && session.user == null) {
              return const AgeGateScreen();
            }
            if (session.user == null) {
              return const AuthScreen();
            }
            return const ListingsScreen();
          },
        ),
      ),
    );
  }
}
