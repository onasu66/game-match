import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/session.dart';
import 'premium_screen.dart';

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
          Row(
            children: [
              Expanded(child: Text('メール: ${user.email}')),
              if (user.isPremium)
                Chip(
                  avatar: Icon(
                    Icons.workspace_premium,
                    size: 18,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  label: const Text('Premium'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            user.isPremium
                ? 'プラン: プレミアム（同時募集 ${user.maxOpenListings} 件）'
                : 'プラン: 無料（同時募集 ${user.maxOpenListings} 件）',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (user.isPremium && user.premiumUntil != null)
            Text(
              '有効期限: ${user.premiumUntil}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PremiumScreen()),
              );
              if (mounted) setState(() {});
            },
            icon: const Icon(Icons.workspace_premium_outlined),
            label: Text(user.isPremium ? 'プレミアムを管理' : 'プレミアムにアップグレード'),
          ),
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
