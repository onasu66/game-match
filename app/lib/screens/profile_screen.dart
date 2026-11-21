import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/api_client.dart';
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
  bool _billingBusy = false;
  BillingStatus? _billing;
  String? _billingError;

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user!;
    _name = TextEditingController(text: user.displayName);
    _favorites = {...user.favoriteGames};
    _loadBilling();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _loadBilling() async {
    try {
      final status =
          await context.read<SessionController>().api.billingStatus();
      if (mounted) {
        setState(() {
          _billing = status;
          _billingError = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _billingError = e.message);
    } catch (e) {
      if (mounted) setState(() => _billingError = e.toString());
    }
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

  Future<void> _startCheckout() async {
    setState(() {
      _billingBusy = true;
      _billingError = null;
    });
    try {
      final session =
          await context.read<SessionController>().api.createCheckout();
      final ok = await launchUrl(
        Uri.parse(session.url),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      if (!ok) {
        setState(() => _billingError = 'ブラウザを開けませんでした');
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('決済後、プロフィールを再読み込みしてください')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _billingError = e.message);
    } finally {
      if (mounted) setState(() => _billingBusy = false);
    }
  }

  Future<void> _mockPurchase() async {
    setState(() {
      _billingBusy = true;
      _billingError = null;
    });
    final session = context.read<SessionController>();
    try {
      final result = await session.api.mockPurchase();
      await session.applyUser(result.user);
      if (!mounted) return;
      setState(() => _billing = result.status);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('プレミアムを有効化しました（モック）')),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _billingError = e.message);
    } finally {
      if (mounted) setState(() => _billingBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user!;
    final billing = _billing;
    final isPremium = billing?.isPremium ?? user.isPremium;
    final premiumUntil = billing?.premiumUntil ?? user.premiumUntil;
    final maxOpen = billing?.maxOpenListings ?? user.maxOpenListings;

    return Scaffold(
      appBar: AppBar(
        title: const Text('プロフィール'),
        actions: [
          IconButton(
            tooltip: '更新',
            onPressed: _billingBusy
                ? null
                : () async {
                    await context.read<SessionController>().refreshUser();
                    await _loadBilling();
                  },
            icon: const Icon(Icons.refresh),
          ),
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
              if (isPremium)
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
          const SizedBox(height: 32),
          Text('プラン', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            isPremium
                ? 'プレミアム（同時募集 $maxOpen 件）'
                : '無料（同時募集 $maxOpen 件）',
          ),
          if (isPremium && premiumUntil != null)
            Text(
              '有効期限: $premiumUntil',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          Text(
            '同時募集: 無料 ${billing?.freeMaxOpenListings ?? 1} → プレミアム ${billing?.premiumMaxOpenListings ?? 5}。'
            ' Web 決済（Stripe）。アプリ内課金は後続。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (_billingError != null) ...[
            const SizedBox(height: 8),
            Text(
              _billingError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 12),
          if (!isPremium) ...[
            if (billing?.stripeEnabled == true)
              FilledButton.tonal(
                onPressed: _billingBusy ? null : _startCheckout,
                child: Text(
                  _billingBusy
                      ? '準備中…'
                      : 'プレミアムを購入（¥${billing?.premiumPriceJpy ?? 480}）',
                ),
              ),
            if (billing?.mockPurchaseAvailable == true) ...[
              if (billing?.stripeEnabled == true) const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _billingBusy ? null : _mockPurchase,
                child: const Text('モック購入（開発用）'),
              ),
            ],
            if (billing != null &&
                billing.stripeEnabled != true &&
                billing.mockPurchaseAvailable != true)
              const Text('現在購入手段が利用できません。'),
          ] else
            Text(
              'すでにプレミアムです。再購入で期限を延長できます。',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}
