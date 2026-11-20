import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/models.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client, this.baseUrl = kApiBase})
      : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;
  String? _token;

  void setToken(String? token) => _token = token;

  Uri _uri(String path, [Map<String, String>? query]) {
    return Uri.parse('$baseUrl$path').replace(queryParameters: query);
  }

  Future<Map<String, dynamic>> _json(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
    bool auth = false,
  }) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (auth && _token != null) 'Authorization': 'Bearer $_token',
    };
    late http.Response res;
    final uri = _uri(path, query);
    switch (method) {
      case 'GET':
        res = await _client.get(uri, headers: headers);
      case 'POST':
        res = await _client.post(
          uri,
          headers: headers,
          body: body == null ? null : jsonEncode(body),
        );
      case 'PATCH':
        res = await _client.patch(
          uri,
          headers: headers,
          body: body == null ? null : jsonEncode(body),
        );
      default:
        throw ApiException('unsupported method $method');
    }
    final decoded = res.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw ApiException(
        (decoded['error'] as String?) ?? 'リクエストに失敗しました (${res.statusCode})',
        statusCode: res.statusCode,
      );
    }
    return decoded;
  }

  Future<({String token, User user})> register({
    required String email,
    required String password,
    required String displayName,
    required String birthDate,
    List<String> favoriteGames = const [],
  }) async {
    final data = await _json(
      'POST',
      '/auth/register',
      body: {
        'email': email,
        'password': password,
        'displayName': displayName,
        'birthDate': birthDate,
        'favoriteGames': favoriteGames,
      },
    );
    return (
      token: data['token'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<({String token, User user})> login({
    required String email,
    required String password,
  }) async {
    final data = await _json(
      'POST',
      '/auth/login',
      body: {'email': email, 'password': password},
    );
    return (
      token: data['token'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<User> me() async {
    final data = await _json('GET', '/auth/me', auth: true);
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> updateProfile({
    String? displayName,
    List<String>? favoriteGames,
  }) async {
    final data = await _json(
      'PATCH',
      '/profile',
      auth: true,
      body: {
        'displayName': ?displayName,
        'favoriteGames': ?favoriteGames,
      },
    );
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<List<String>> games() async {
    final data = await _json('GET', '/games');
    return (data['games'] as List<dynamic>).map((e) => e.toString()).toList();
  }

  Future<List<Listing>> listings({String? game}) async {
    final data = await _json(
      'GET',
      '/listings',
      auth: true,
      query: game == null || game.isEmpty ? null : {'game': game},
    );
    return (data['listings'] as List<dynamic>)
        .map((e) => Listing.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Listing> createListing({
    required String game,
    required int slots,
    String rankNote = '',
    String description = '',
    bool voiceOptional = true,
  }) async {
    final data = await _json(
      'POST',
      '/listings',
      auth: true,
      body: {
        'game': game,
        'slots': slots,
        'rankNote': rankNote,
        'description': description,
        'voiceOptional': voiceOptional,
      },
    );
    return Listing.fromJson(data['listing'] as Map<String, dynamic>);
  }

  Future<Listing> listingDetail(String id) async {
    final data = await _json('GET', '/listings/$id', auth: true);
    return Listing.fromJson(data['listing'] as Map<String, dynamic>);
  }

  Future<Listing> joinListing(String id) async {
    final data = await _json('POST', '/listings/$id/join', auth: true);
    return Listing.fromJson(data['listing'] as Map<String, dynamic>);
  }
}
