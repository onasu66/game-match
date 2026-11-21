import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api_client.dart';

class SessionController extends ChangeNotifier {
  SessionController({ApiClient? api}) : api = api ?? ApiClient();

  final ApiClient api;
  User? user;
  bool bootstrapped = false;
  bool ageConfirmed = false;
  String? error;

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    ageConfirmed = prefs.getBool('age_confirmed') ?? false;
    final token = prefs.getString('auth_token');
    if (token != null && token.isNotEmpty) {
      api.setToken(token);
      try {
        user = await api.me();
      } catch (_) {
        await prefs.remove('auth_token');
        api.setToken(null);
        user = null;
      }
    }
    bootstrapped = true;
    notifyListeners();
  }

  Future<void> confirmAge(bool isOver18) async {
    if (!isOver18) {
      error = '18歳未満は利用できません';
      notifyListeners();
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('age_confirmed', true);
    ageConfirmed = true;
    error = null;
    notifyListeners();
  }

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
    required String birthDate,
    List<String> favoriteGames = const [],
  }) async {
    error = null;
    notifyListeners();
    try {
      final result = await api.register(
        email: email,
        password: password,
        displayName: displayName,
        birthDate: birthDate,
        favoriteGames: favoriteGames,
      );
      await _persistAuth(result.token, result.user);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    error = null;
    notifyListeners();
    try {
      final result = await api.login(email: email, password: password);
      await _persistAuth(result.token, result.user);
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> updateProfile({
    String? displayName,
    List<String>? favoriteGames,
  }) async {
    user = await api.updateProfile(
      displayName: displayName,
      favoriteGames: favoriteGames,
    );
    notifyListeners();
  }

  Future<void> refreshUser() async {
    user = await api.me();
    notifyListeners();
  }

  Future<void> applyUser(User next) async {
    user = next;
    notifyListeners();
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    api.setToken(null);
    user = null;
    notifyListeners();
  }

  Future<void> _persistAuth(String token, User next) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
    api.setToken(token);
    user = next;
    ageConfirmed = true;
    await prefs.setBool('age_confirmed', true);
    notifyListeners();
  }
}
