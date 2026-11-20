/// API base URL.
/// - Android emulator: http://10.0.2.2:8787
/// - iOS simulator / desktop / web (same machine): http://127.0.0.1:8787
/// Override at build time: --dart-define=API_BASE=https://your-worker.example
const String kApiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'http://127.0.0.1:8787',
);
