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

  Future<void> _rateMember(Listing listing, Member member) async {
    final me = context.read<SessionController>().user;
    if (me == null) return;
    if (!listing.members.any((m) => m.userId == me.id)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('評価するには参加が必要です')),
        );
      }
      return;
    }

    final current = listing.myScoreFor(member.userId) ?? 5;
    var selected = current;
    final score = await showDialog<int>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: Text('${member.displayName} を評価'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('1〜5の星で評価してください'),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (i) {
                      final value = i + 1;
                      return IconButton(
                        onPressed: () => setLocal(() => selected = value),
                        icon: Icon(
                          value <= selected ? Icons.star : Icons.star_border,
                          color: Theme.of(ctx).colorScheme.primary,
                        ),
                      );
                    }),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('キャンセル'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, selected),
                  child: const Text('送信'),
                ),
              ],
            );
          },
        );
      },
    );
    if (score == null || !mounted) return;

    try {
      await context.read<SessionController>().api.rateMember(
            listingId: listing.id,
            toUserId: member.userId,
            score: score,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${member.displayName} を $score で評価しました')),
      );
      _reload();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
  }

  Future<void> _reportMember(Listing listing, Member member) async {
    final me = context.read<SessionController>().user;
    if (me == null) return;
    if (!listing.members.any((m) => m.userId == me.id)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('通報するには参加が必要です')),
        );
      }
      return;
    }

    final api = context.read<SessionController>().api;
    List<ReportReason> reasons;
    try {
      reasons = await api.reportReasons();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      return;
    }
    if (!mounted || reasons.isEmpty) return;

    var selectedReason = reasons.first.id;
    final commentCtrl = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: Text('${member.displayName} を通報'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: selectedReason,
                      decoration: const InputDecoration(labelText: '理由'),
                      items: reasons
                          .map(
                            (r) => DropdownMenuItem(
                              value: r.id,
                              child: Text(r.label),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setLocal(() => selectedReason = v);
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: commentCtrl,
                      maxLines: 3,
                      maxLength: 500,
                      decoration: const InputDecoration(
                        labelText: 'コメント（任意）',
                        alignLabelWithHint: true,
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('キャンセル'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('通報する'),
                ),
              ],
            );
          },
        );
      },
    );
    final comment = commentCtrl.text.trim();
    commentCtrl.dispose();
    if (submitted != true || !mounted) return;

    try {
      await api.reportMember(
        listingId: listing.id,
        reportedUserId: member.userId,
        reason: selectedReason,
        comment: comment,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('通報を受け付けました')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    }
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
              const SizedBox(height: 4),
              Text(
                'マッチ後は参加者を評価・通報できます',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              ...l.members.map((m) {
                final isMe = me != null && m.userId == me.id;
                final myScore = l.myScoreFor(m.userId);
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    child: Icon(
                      m.isPremium ? Icons.workspace_premium : Icons.person,
                    ),
                  ),
                  title: Text(
                    m.isPremium ? '${m.displayName} · Premium' : m.displayName,
                  ),
                  subtitle: Text(
                    [
                      m.userId == l.hostId ? 'ホスト' : '参加者',
                      if (myScore != null) 'あなたの評価: $myScore',
                    ].join(' · '),
                  ),
                  trailing: isMe || !already
                      ? null
                      : PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'rate') {
                              _rateMember(l, m);
                            } else if (value == 'report') {
                              _reportMember(l, m);
                            }
                          },
                          itemBuilder: (_) => [
                            PopupMenuItem(
                              value: 'rate',
                              child: Text(myScore == null ? '評価する' : '評価を変更'),
                            ),
                            const PopupMenuItem(
                              value: 'report',
                              child: Text('通報する'),
                            ),
                          ],
                        ),
                );
              }),
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
