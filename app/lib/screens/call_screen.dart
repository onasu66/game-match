import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/session.dart';

/// Voice room for a listing. Mic starts muted / unpublished (optional).
class CallScreen extends StatefulWidget {
  const CallScreen({
    super.key,
    required this.listingId,
    required this.gameTitle,
  });

  final String listingId;
  final String gameTitle;

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  Room? _room;
  EventsListener<RoomEvent>? _listener;
  String? _error;
  bool _connecting = true;
  bool _micEnabled = false;
  bool _togglingMic = false;
  List<RemoteParticipant> _remotes = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_connect());
  }

  @override
  void dispose() {
    unawaited(_cleanup());
    super.dispose();
  }

  Future<void> _cleanup() async {
    await _listener?.dispose();
    _listener = null;
    final room = _room;
    _room = null;
    if (room != null) {
      await room.disconnect();
      await room.dispose();
    }
  }

  Future<void> _connect() async {
    setState(() {
      _connecting = true;
      _error = null;
    });
    try {
      final creds = await context
          .read<SessionController>()
          .api
          .callToken(widget.listingId);

      // Mic is optional — only request permission if the platform needs it later.
      // We still create the room without publishing audio by default.
      if (!kIsWeb) {
        // Best-effort; denial still allows listen-only join.
        await Permission.microphone.request();
      }

      final room = Room(
        roomOptions: const RoomOptions(
          adaptiveStream: true,
          dynacast: true,
          defaultAudioPublishOptions: AudioPublishOptions(
            name: 'microphone',
          ),
        ),
      );
      final listener = room.createListener();
      listener
        ..on<ParticipantConnectedEvent>((_) => _syncParticipants())
        ..on<ParticipantDisconnectedEvent>((_) => _syncParticipants())
        ..on<RoomDisconnectedEvent>((event) {
          if (!mounted) return;
          setState(() {
            _error = event.reason != null
                ? '通話から切断されました (${event.reason})'
                : '通話から切断されました';
          });
        });

      await room.connect(
        creds.url,
        creds.token,
        connectOptions: const ConnectOptions(autoSubscribe: true),
      );

      // Join without enabling the mic (listen-only until user unmutes).
      await room.localParticipant?.setMicrophoneEnabled(false);

      if (!mounted) {
        await listener.dispose();
        await room.disconnect();
        await room.dispose();
        return;
      }

      setState(() {
        _room = room;
        _listener = listener;
        _connecting = false;
        _micEnabled = false;
        _remotes = room.remoteParticipants.values.toList();
      });
      if (creds.usedFreeQuota) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('本日の無料通話枠を使用しました')),
        );
      } else if (creds.pointsSpent > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${creds.pointsSpent}pt を消費しました（残高 ${creds.pointsBalance ?? '-'}）',
            ),
          ),
        );
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = e.toString();
      });
    }
  }

  void _syncParticipants() {
    final room = _room;
    if (!mounted || room == null) return;
    setState(() {
      _remotes = room.remoteParticipants.values.toList();
    });
  }

  Future<void> _toggleMic() async {
    final participant = _room?.localParticipant;
    if (participant == null || _togglingMic) return;
    setState(() => _togglingMic = true);
    try {
      final next = !_micEnabled;
      if (next && !kIsWeb) {
        final status = await Permission.microphone.request();
        if (!status.isGranted) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('マイク権限がありません（聞き取り専用のまま参加できます）'),
              ),
            );
          }
          return;
        }
      }
      await participant.setMicrophoneEnabled(next);
      if (mounted) setState(() => _micEnabled = next);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('マイク切替に失敗: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _togglingMic = false);
    }
  }

  Future<void> _leave() async {
    await _cleanup();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final localName =
        context.watch<SessionController>().user?.displayName ?? '自分';

    return Scaffold(
      appBar: AppBar(
        title: Text('通話 · ${widget.gameTitle}'),
        automaticallyImplyLeading: false,
      ),
      body: _connecting
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _room == null
              ? _ErrorBody(message: _error!, onRetry: _connect, onClose: _leave)
              : Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'マイクは任意です。ミュートのまま聞けます。',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          _error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Text(
                        '参加者',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Expanded(
                        child: ListView(
                          children: [
                            _ParticipantTile(
                              name: localName,
                              isLocal: true,
                              micOn: _micEnabled,
                            ),
                            ..._remotes.map(
                              (p) => _ParticipantTile(
                                name: p.name.isNotEmpty ? p.name : p.identity,
                                isLocal: false,
                                micOn: p.isMicrophoneEnabled(),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.tonalIcon(
                              onPressed: _togglingMic ? null : _toggleMic,
                              icon: Icon(
                                _micEnabled ? Icons.mic : Icons.mic_off,
                              ),
                              label: Text(_micEnabled ? 'ミュートする' : 'ミュート解除'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: FilledButton.icon(
                              style: FilledButton.styleFrom(
                                backgroundColor:
                                    Theme.of(context).colorScheme.error,
                                foregroundColor:
                                    Theme.of(context).colorScheme.onError,
                              ),
                              onPressed: _leave,
                              icon: const Icon(Icons.call_end),
                              label: const Text('退室'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _ParticipantTile extends StatelessWidget {
  const _ParticipantTile({
    required this.name,
    required this.isLocal,
    required this.micOn,
  });

  final String name;
  final bool isLocal;
  final bool micOn;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        child: Icon(micOn ? Icons.mic : Icons.mic_off),
      ),
      title: Text(name),
      subtitle: Text(isLocal ? 'あなた' : 'リモート'),
      trailing: Text(micOn ? 'ON' : 'ミュート'),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({
    required this.message,
    required this.onRetry,
    required this.onClose,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('再接続')),
            TextButton(onPressed: onClose, child: const Text('戻る')),
          ],
        ),
      ),
    );
  }
}
