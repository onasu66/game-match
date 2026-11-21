import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/session.dart';

class CreateListingScreen extends StatefulWidget {
  const CreateListingScreen({super.key});

  @override
  State<CreateListingScreen> createState() => _CreateListingScreenState();
}

class _CreateListingScreenState extends State<CreateListingScreen> {
  String _game = kGames.first;
  final _rank = TextEditingController();
  final _desc = TextEditingController();
  int _slots = 4;
  bool _voiceOptional = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _rank.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<SessionController>().api.createListing(
            game: _game,
            slots: _slots,
            rankNote: _rank.text.trim(),
            description: _desc.text.trim(),
            voiceOptional: _voiceOptional,
          );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('募集を作成')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          DropdownButtonFormField<String>(
            // ignore: deprecated_member_use
            value: _game,
            decoration: const InputDecoration(labelText: 'タイトル'),
            items: kGames
                .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _game = v);
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _rank,
            decoration: const InputDecoration(
              labelText: 'ランク / メモ（任意）',
              hintText: '例: 金〜ダイヤ',
            ),
          ),
          const SizedBox(height: 12),
          Text('人数: $_slots', style: Theme.of(context).textTheme.titleSmall),
          Slider(
            value: _slots.toDouble(),
            min: 2,
            max: 10,
            divisions: 8,
            label: '$_slots',
            onChanged: (v) => setState(() => _slots = v.round()),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _desc,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: '説明（任意）',
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('マイクは任意'),
            subtitle: const Text('入室時はミュート可。通話は LiveKit。'),
            value: _voiceOptional,
            onChanged: (v) => setState(() => _voiceOptional = v),
          ),
          Text(
            '同時募集は無料1件まで。追加は50pt（プレミアム中は無料枠5件）。残高はプロフィールで確認。',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          if (_error != null) ...[
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            const SizedBox(height: 8),
          ],
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: Text(_busy ? '作成中…' : '作成する'),
          ),
        ],
      ),
    );
  }
}
