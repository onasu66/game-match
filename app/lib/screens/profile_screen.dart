import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/session.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final TextEditingController _name;
  late Set<String> _favorites;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user!;
    _name = TextEditingController(text: user.displayName);
    _favorites = {...user.favoriteGames};
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await context.read<SessionController>().updateProfile(
            displayName: _name.text.trim(),
            favoriteGames: _favorites.toList(),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('保存しました')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user!;
    return Scaffold(
      appBar: AppBar(
        title: const Text('プロフィール'),
        actions: [
          TextButton(
            onPressed: () async {
              await context.read<SessionController>().logout();
              if (context.mounted) Navigator.of(context).pop();
            },
            child: const Text('ログアウト'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text('メール: ${user.email}'),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: '表示名'),
          ),
          const SizedBox(height: 16),
          Text('好きなタイトル', style: Theme.of(context).textTheme.titleSmall),
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
            onPressed: _busy ? null : _save,
            child: Text(_busy ? '保存中…' : '保存'),
          ),
        ],
      ),
    );
  }
}
