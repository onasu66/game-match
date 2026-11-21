import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import 'call_screen.dart';

class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen({super.key, required this.listingId});

  final String listingId;

  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  late Future<Listing> _future;
  bool _joining = false;
  String? _joinError;

  @override
  void initState() {
    super.initState();
    _future = context.read<SessionController>().api.listingDetail(widget.listingId);
  }

  void _reload() {
    setState(() {
      _future =
          context.read<SessionController>().api.listingDetail(widget.listingId);
      _joinError = null;
    });
  }

  Future<void> _join() async {
    setState(() {
      _joining = true;
      _joinError = null;
    });
    try {
      final listing = await context
          .read<SessionController>()
          .api
          .joinListing(widget.listingId);
      setState(() {
        _future = Future.value(listing);
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('参加しました')),
        );
      }
    } on ApiException catch (e) {
      setState(() => _joinError = e.message);
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  void _openCall(Listing listing) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CallScreen(
          listingId: listing.id,
          gameTitle: listing.game,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final me = context.watch<SessionController>().user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('募集詳細'),
        actions: [
          IconButton(onPressed: _reload, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: FutureBuilder<Listing>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            final msg = snap.error is ApiException
                ? (snap.error as ApiException).message
                : snap.error.toString();
            return Center(child: Text(msg));
          }
          final l = snap.data!;
          final already = me != null &&
              l.members.any((m) => m.userId == me.id);
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(l.game, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('ホスト: ${l.hostDisplayName}'),
                  if (l.hostIsPremium) ...[
                    const SizedBox(width: 6),
                    Icon(
                      Icons.workspace_premium,
                      size: 18,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ],
                ],
              ),
              Text('人数: ${l.memberCount}/${l.slots}'),
              if (l.rankNote.isNotEmpty) Text('ランク: ${l.rankNote}'),
              Text(l.voiceOptional ? 'マイク: 任意' : 'マイク: 希望あり'),
              if (l.description.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(l.description),
              ],
              const SizedBox(height: 24),
              Text('参加者', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ...l.members.map(
                (m) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    child: Icon(
                      m.isPremium ? Icons.workspace_premium : Icons.person,
                    ),
                  ),
                  title: Text(
                    m.isPremium ? '${m.displayName} · Premium' : m.displayName,
                  ),
                  subtitle: Text(m.userId == l.hostId ? 'ホスト' : '参加者'),
                ),
              ),
              if (_joinError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _joinError!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              const SizedBox(height: 16),
              if (!already)
                FilledButton(
                  onPressed: _joining ? null : _join,
                  child: Text(_joining ? '参加中…' : 'この募集に参加'),
                )
              else ...[
                const Text('すでに参加しています'),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => _openCall(l),
                  icon: const Icon(Icons.headset_mic),
                  label: const Text('通話ルームに入る'),
                ),
                const SizedBox(height: 8),
                Text(
                  'マイクなしでも参加できます。入室後にミュート解除できます。',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
