import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/session.dart';

class AgeGateScreen extends StatelessWidget {
  const AgeGateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text(
                'ゲーム通話',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'マッチ募集に参加するには、18歳以上である必要があります。',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              if (session.error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    session.error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                    textAlign: TextAlign.center,
                  ),
                ),
              FilledButton(
                onPressed: () => session.confirmAge(true),
                child: const Text('18歳以上です'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => session.confirmAge(false),
                child: const Text('18歳未満です'),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
