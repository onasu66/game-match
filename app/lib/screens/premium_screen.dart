import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/session.dart';

class PremiumScreen extends StatefulWidget {
  const PremiumScreen({super.key});

  @override
  State<PremiumScreen> createState() => _PremiumScreenState();
}

class _PremiumScreenState extends State<PremiumScreen> {
  BillingStatus? _status;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final status =
          await context.read<SessionController>().api.billingStatus();
      if (mounted) {
        setState(() {
          _status = status;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _startCheckout() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session =
          await context.read<SessionController>().api.createCheckout();
      final uri = Uri.parse(session.url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        setState(() => _error = 'ブラウザを開けませんでした');
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('決済後、この画面を再読み込みしてください'),
          ),
        );
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _mockPurchase() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final session = context.read<SessionController>();
    try {
      final result = await session.api.mockPurchase();
      await session.applyUser(result.user);
      if (!mounted) return;
      setState(() => _status = result.status);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('プレミアムを有効化しました（モック）')),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user;
    final status = _status;
    final isPremium = status?.isPremium ?? user?.isPremium ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('プレミアム'),
        actions: [
          IconButton(
            tooltip: '更新',
            onPressed: _busy
                ? null
                : () async {
                    await context.read<SessionController>().refreshUser();
                    await _load();
                  },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Row(
                  children: [
                    Icon(
                      isPremium ? Icons.workspace_premium : Icons.person_outline,
                      size: 36,
                      color: isPremium
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).colorScheme.outline,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isPremium ? 'プレミアムプラン' : '無料プラン',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          if (isPremium &&
                              (status?.premiumUntil ?? user?.premiumUntil) !=
                                  null)
                            Text(
                              '有効期限: ${status?.premiumUntil ?? user?.premiumUntil}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  status?.productName ?? 'ゲーム通話 プレミアム（30日）',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  '¥${status?.premiumPriceJpy ?? 480} / ${status?.premiumDurationDays ?? 30}日（税込表示は Stripe 側設定に依存）',
                ),
                const SizedBox(height: 16),
                Text('特典', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                Text(
                  '・同時に公開できる募集: 無料 ${status?.freeMaxOpenListings ?? 1} 件 → プレミアム ${status?.premiumMaxOpenListings ?? 5} 件\n'
                  '・プロフィール / 募集にプレミアムバッジ表示',
                ),
                const SizedBox(height: 16),
                Text(
                  status?.note ??
                      'Web 決済（Stripe Checkout）。App Store / Google Play のアプリ内課金は後続。',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
                const SizedBox(height: 24),
                if (!isPremium) ...[
                  if (status?.stripeEnabled == true)
                    FilledButton(
                      onPressed: _busy ? null : _startCheckout,
                      child: Text(_busy ? '準備中…' : 'Stripe で購入する'),
                    ),
                  if (status?.mockPurchaseAvailable == true) ...[
                    if (status?.stripeEnabled == true) const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _busy ? null : _mockPurchase,
                      child: const Text('モック購入（開発用）'),
                    ),
                  ],
                  if (status?.stripeEnabled != true &&
                      status?.mockPurchaseAvailable != true)
                    const Text('現在購入手段が利用できません。管理者に連絡してください。'),
                ] else
                  const Text('すでにプレミアムです。期限が近い場合は再度購入すると延長されます。'),
              ],
            ),
    );
  }
}
