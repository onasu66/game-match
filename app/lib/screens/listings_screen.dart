import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/session.dart';
import 'create_listing_screen.dart';
import 'listing_detail_screen.dart';
import 'profile_screen.dart';

class ListingsScreen extends StatefulWidget {
  const ListingsScreen({super.key});

  @override
  State<ListingsScreen> createState() => _ListingsScreenState();
}

class _ListingsScreenState extends State<ListingsScreen> {
  String? _filterGame;
  late Future<List<Listing>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Listing>> _load() {
    return context.read<SessionController>().api.listings(game: _filterGame);
  }

  void _reload() {
    setState(() => _future = _load());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('募集一覧'),
        actions: [
          IconButton(
            tooltip: 'プロフィール',
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ProfileScreen()),
              );
              _reload();
            },
            icon: const Icon(Icons.person_outline),
          ),
          IconButton(
            tooltip: '更新',
            onPressed: _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => const CreateListingScreen()),
          );
          if (created == true) _reload();
        },
        icon: const Icon(Icons.add),
        label: const Text('募集を作成'),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('すべて'),
                    selected: _filterGame == null,
                    onSelected: (_) {
                      setState(() {
                        _filterGame = null;
                        _future = _load();
                      });
                    },
                  ),
                ),
                ...kGames.map(
                  (g) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(g),
                      selected: _filterGame == g,
                      onSelected: (_) {
                        setState(() {
                          _filterGame = g;
                          _future = _load();
                        });
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Listing>>(
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
                final items = snap.data ?? [];
                if (items.isEmpty) {
                  return const Center(child: Text('募集がありません。作成してみましょう。'));
                }
                return ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (context, index) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final l = items[i];
                    return ListTile(
                      title: Text(l.game),
                      subtitle: Text(
                        '${l.hostDisplayName}${l.hostIsPremium ? ' ★' : ''} · ${l.memberCount}/${l.slots}人'
                        '${l.rankNote.isEmpty ? '' : ' · ${l.rankNote}'}'
                        '${l.voiceOptional ? ' · マイク任意' : ' · マイク希望'}',
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (l.hostIsPremium)
                            Icon(
                              Icons.workspace_premium,
                              size: 20,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ListingDetailScreen(listingId: l.id),
                          ),
                        );
                        _reload();
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
