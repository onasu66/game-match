import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/session.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  final _loginEmail = TextEditingController();
  final _loginPassword = TextEditingController();

  final _regEmail = TextEditingController();
  final _regPassword = TextEditingController();
  final _regName = TextEditingController();
  DateTime? _birthDate;
  final Set<String> _favorites = {};
  bool _busy = false;
  String? _localError;

  @override
  void dispose() {
    _tabs.dispose();
    _loginEmail.dispose();
    _loginPassword.dispose();
    _regEmail.dispose();
    _regPassword.dispose();
    _regName.dispose();
    super.dispose();
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 18, now.month, now.day),
      firstDate: DateTime(1950),
      lastDate: now,
      helpText: '生年月日（18歳以上）',
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  String _fmt(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _localError = null;
    });
    try {
      await context.read<SessionController>().login(
            email: _loginEmail.text.trim(),
            password: _loginPassword.text,
          );
    } on ApiException catch (e) {
      setState(() => _localError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _register() async {
    if (_birthDate == null) {
      setState(() => _localError = '生年月日を選択してください');
      return;
    }
    setState(() {
      _busy = true;
      _localError = null;
    });
    try {
      await context.read<SessionController>().register(
            email: _regEmail.text.trim(),
            password: _regPassword.text,
            displayName: _regName.text.trim(),
            birthDate: _fmt(_birthDate!),
            favoriteGames: _favorites.toList(),
          );
    } on ApiException catch (e) {
      setState(() => _localError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ログイン / 登録'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'ログイン'),
            Tab(text: '新規登録'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _pad(
            children: [
              TextField(
                controller: _loginEmail,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'メール'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _loginPassword,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'パスワード'),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy ? null : _login,
                child: Text(_busy ? '送信中…' : 'ログイン'),
              ),
            ],
          ),
          _pad(
            children: [
              TextField(
                controller: _regName,
                decoration: const InputDecoration(labelText: '表示名'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _regEmail,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'メール'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _regPassword,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'パスワード（8文字以上）',
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _birthDate == null
                      ? '生年月日を選択'
                      : '生年月日: ${_fmt(_birthDate!)}',
                ),
                trailing: const Icon(Icons.calendar_today),
                onTap: _pickBirthDate,
              ),
              const SizedBox(height: 8),
              Text('好きなタイトル（任意）', style: Theme.of(context).textTheme.titleSmall),
              Wrap(
                spacing: 8,
                children: kGames
                    .map(
                      (g) => FilterChip(
                        label: Text(g),
                        selected: _favorites.contains(g),
                        onSelected: (v) {
                          setState(() {
                            if (v) {
                              _favorites.add(g);
                            } else {
                              _favorites.remove(g);
                            }
                          });
                        },
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _busy ? null : _register,
                child: Text(_busy ? '送信中…' : '登録する'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pad({required List<Widget> children}) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (_localError != null) ...[
          Text(
            _localError!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 12),
        ],
        ...children,
      ],
    );
  }
}
