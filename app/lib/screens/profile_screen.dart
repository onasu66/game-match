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
  RatingSummary? _ratingSummary;
  String? _ratingError;

  @override
  void initState() {
    super.initState();
    final user = context.read<SessionController>().user!;
    _name = TextEditingController(text: user.displayName);
    _favorites = {...user.favoriteGames};
    _loadBilling();
    _loadRatings();
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

  Future<void> _loadRatings() async {
    try {
      final summary =
          await context.read<SessionController>().api.myRatingSummary();
      if (mounted) {
        setState(() {
          _ratingSummary = summary;
          _ratingError = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _ratingError = e.message);
    } catch (e) {
      if (mounted) setState(() => _ratingError = e.toString());
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

  Future<void> _startCheckout(String product) async {
    setState(() {
      _billingBusy = true;
      _billingError = null;
    });
    try {
      final session = await context
          .read<SessionController>()
          .api
          .createCheckout(product: product);
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

  Future<void> _mockPurchase(String product) async {
    setState(() {
      _billingBusy = true;
      _billingError = null;
    });
    final session = context.read<SessionController>();
    try {
      final result = await session.api.mockPurchase(product: product);
      await session.applyUser(result.user);
      if (!mounted) return;
      setState(() => _billing = result.status);
      final label = product.startsWith('points_') ? 'ポイント' : 'プレミアム';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$labelを付与しました（モック）')),
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
    final points = billing?.pointsBalance ?? user.pointsBalance;
    final packs = billing?.packs ?? const <PointPack>[];
    final rules = billing?.rulesJa ?? const <String>[];

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
                    await _loadRatings();
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
          Text('受け取った評価', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (_ratingError != null)
            Text(
              _ratingError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            )
          else if (_ratingSummary == null)
            const Text('読み込み中…')
          else if (_ratingSummary!.count == 0)
            Text(
              'まだ評価はありません',
              style: Theme.of(context).textTheme.bodyMedium,
            )
          else
            Text(
              '平均 ${_ratingSummary!.averageScore?.toStringAsFixed(1) ?? '-'} / 5'
              '（${_ratingSummary!.count}件）',
            ),
          const SizedBox(height: 32),
          Text('ポイント', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            '残高: $points pt',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          if (billing?.freeCallsRemainingToday != null)
            Text(
              '本日の無料通話 残り ${billing!.freeCallsRemainingToday} 回',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          Text(
            'ポイントが主課金です。プレミアム（30日）は共存し、同時募集の無料枠を広げます。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (rules.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...rules.map(
              (r) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('・$r', style: Theme.of(context).textTheme.bodySmall),
              ),
            ),
          ] else ...[
            const SizedBox(height: 8),
            Text(
              '・募集: 無料同時 ${(billing?.freeMaxOpenListings ?? 1)} 件、追加 ${(billing?.extraListingCost ?? 50)} pt\n'
              '・通話: 1日 ${(billing?.freeCallsPerDay ?? 1)} 回無料、超過 ${(billing?.callCost ?? 20)} pt',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (_billingError != null) ...[
            const SizedBox(height: 8),
            Text(
              _billingError!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 16),
          Text('ポイントを購入', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (packs.isEmpty)
            const Text('パック情報を読み込み中…')
          else
            ...packs.map((pack) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('${pack.name} · ¥${pack.priceJpy}'),
                    ),
                    if (billing?.stripeEnabled == true)
                      FilledButton.tonal(
                        onPressed:
                            _billingBusy ? null : () => _startCheckout(pack.id),
                        child: Text(_billingBusy ? '…' : '購入'),
                      ),
                    if (billing?.mockPurchaseAvailable == true) ...[
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: _billingBusy
                            ? null
                            : () => _mockPurchase(pack.id),
                        child: const Text('モック'),
                      ),
                    ],
                  ],
                ),
              );
            }),
          if (billing != null &&
              billing.stripeEnabled != true &&
              billing.mockPurchaseAvailable != true)
            const Text('現在購入手段が利用できません。'),
          const SizedBox(height: 24),
          Text('ポイント履歴', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (billing == null)
            const Text('読み込み中…')
          else if (billing.history.isEmpty)
            Text(
              'まだ履歴がありません',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else
            ...billing.history.take(15).map((e) {
              final sign = e.delta > 0 ? '+' : '';
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(e.labelJa),
                subtitle: Text(e.createdAt),
                trailing: Text('$sign${e.delta} → ${e.balanceAfter}'),
              );
            }),
          const SizedBox(height: 24),
          Text('プレミアム（任意）', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            isPremium
                ? 'プレミアム有効（同時募集無料枠 ${billing?.premiumMaxOpenListings ?? 5} 件）'
                : '未加入。同時募集無料枠を ${billing?.premiumMaxOpenListings ?? 5} 件に広げます（¥${billing?.premiumPriceJpy ?? 480} / ${billing?.premiumDurationDays ?? 30}日）。',
          ),
          if (isPremium && premiumUntil != null)
            Text(
              '有効期限: $premiumUntil',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          if (billing?.stripeEnabled == true)
            FilledButton.tonal(
              onPressed:
                  _billingBusy ? null : () => _startCheckout('premium_30d'),
              child: Text(
                _billingBusy
                    ? '準備中…'
                    : isPremium
                        ? 'プレミアムを延長'
                        : 'プレミアムを購入',
              ),
            ),
          if (billing?.mockPurchaseAvailable == true) ...[
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed:
                  _billingBusy ? null : () => _mockPurchase('premium_30d'),
              child: const Text('プレミアム モック購入'),
            ),
          ],
        ],
      ),
    );
  }
}
