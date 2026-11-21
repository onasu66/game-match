class User {
  User({
    required this.id,
    required this.email,
    required this.displayName,
    required this.birthDate,
    required this.favoriteGames,
    required this.createdAt,
    required this.ageVerified,
    this.isPremium = false,
    this.premiumUntil,
    this.plan = 'free',
    this.maxOpenListings = 1,
    this.pointsBalance = 0,
  });

  final String id;
  final String email;
  final String displayName;
  final String birthDate;
  final List<String> favoriteGames;
  final String createdAt;
  final bool ageVerified;
  final bool isPremium;
  final String? premiumUntil;
  final String plan;
  final int maxOpenListings;
  final int pointsBalance;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String,
      birthDate: json['birthDate'] as String,
      favoriteGames: (json['favoriteGames'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      createdAt: json['createdAt'] as String,
      ageVerified: json['ageVerified'] as bool? ?? true,
      isPremium: json['isPremium'] as bool? ?? false,
      premiumUntil: json['premiumUntil'] as String?,
      plan: json['plan'] as String? ?? 'free',
      maxOpenListings: json['maxOpenListings'] as int? ?? 1,
      pointsBalance: json['pointsBalance'] as int? ?? 0,
    );
  }
}

class PointPack {
  PointPack({
    required this.id,
    required this.points,
    required this.priceJpy,
    required this.name,
    required this.description,
  });

  final String id;
  final int points;
  final int priceJpy;
  final String name;
  final String description;

  factory PointPack.fromJson(Map<String, dynamic> json) {
    return PointPack(
      id: json['id'] as String,
      points: json['points'] as int? ?? 0,
      priceJpy: json['priceJpy'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
    );
  }
}

class PointLedgerEntry {
  PointLedgerEntry({
    required this.id,
    required this.delta,
    required this.balanceAfter,
    required this.reason,
    required this.createdAt,
    this.refId,
  });

  final String id;
  final int delta;
  final int balanceAfter;
  final String reason;
  final String? refId;
  final String createdAt;

  factory PointLedgerEntry.fromJson(Map<String, dynamic> json) {
    return PointLedgerEntry(
      id: json['id'] as String,
      delta: json['delta'] as int? ?? 0,
      balanceAfter: json['balanceAfter'] as int? ?? 0,
      reason: json['reason'] as String? ?? '',
      refId: json['refId'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }

  String get labelJa {
    if (reason.startsWith('purchase_')) return 'ポイント購入';
    switch (reason) {
      case 'spend_extra_listing':
        return '追加募集';
      case 'spend_call':
        return '通話開始';
      case 'call_free':
        return '通話（無料枠）';
      default:
        return reason;
    }
  }
}

class BillingStatus {
  BillingStatus({
    required this.isPremium,
    required this.plan,
    required this.maxOpenListings,
    required this.freeMaxOpenListings,
    required this.premiumMaxOpenListings,
    required this.premiumDurationDays,
    required this.premiumPriceJpy,
    required this.productName,
    required this.stripeEnabled,
    required this.mockPurchaseAvailable,
    required this.pointsBalance,
    required this.packs,
    required this.extraListingCost,
    required this.callCost,
    required this.freeCallsPerDay,
    this.premiumUntil,
    this.note,
    this.history = const [],
    this.rulesJa = const [],
    this.freeCallsRemainingToday,
    this.hardMaxOpenListings = 10,
  });

  final bool isPremium;
  final String? premiumUntil;
  final String plan;
  final int maxOpenListings;
  final int freeMaxOpenListings;
  final int premiumMaxOpenListings;
  final int hardMaxOpenListings;
  final int premiumDurationDays;
  final int premiumPriceJpy;
  final String productName;
  final bool stripeEnabled;
  final bool mockPurchaseAvailable;
  final String? note;
  final int pointsBalance;
  final List<PointPack> packs;
  final int extraListingCost;
  final int callCost;
  final int freeCallsPerDay;
  final int? freeCallsRemainingToday;
  final List<PointLedgerEntry> history;
  final List<String> rulesJa;

  factory BillingStatus.fromJson(Map<String, dynamic> json) {
    final costs = json['costs'] as Map<String, dynamic>? ?? {};
    final consumption = json['consumption'] as Map<String, dynamic>? ?? {};
    return BillingStatus(
      isPremium: json['isPremium'] as bool? ?? false,
      premiumUntil: json['premiumUntil'] as String?,
      plan: json['plan'] as String? ?? 'free',
      maxOpenListings: json['maxOpenListings'] as int? ?? 1,
      freeMaxOpenListings: json['freeMaxOpenListings'] as int? ?? 1,
      premiumMaxOpenListings: json['premiumMaxOpenListings'] as int? ?? 5,
      hardMaxOpenListings: json['hardMaxOpenListings'] as int? ?? 10,
      premiumDurationDays: json['premiumDurationDays'] as int? ?? 30,
      premiumPriceJpy: json['premiumPriceJpy'] as int? ?? 480,
      productName: json['productName'] as String? ?? 'プレミアム',
      stripeEnabled: json['stripeEnabled'] as bool? ?? false,
      mockPurchaseAvailable: json['mockPurchaseAvailable'] as bool? ?? false,
      note: json['note'] as String?,
      pointsBalance: json['pointsBalance'] as int? ?? 0,
      packs: (json['packs'] as List<dynamic>? ?? [])
          .map((e) => PointPack.fromJson(e as Map<String, dynamic>))
          .toList(),
      extraListingCost: costs['extraListing'] as int? ??
          consumption['extraListingCostPoints'] as int? ??
          50,
      callCost: costs['call'] as int? ??
          consumption['callCostPoints'] as int? ??
          20,
      freeCallsPerDay: costs['freeCallsPerDay'] as int? ??
          consumption['freeCallsPerDay'] as int? ??
          1,
      freeCallsRemainingToday: json['freeCallsRemainingToday'] as int?,
      history: (json['history'] as List<dynamic>? ?? [])
          .map((e) => PointLedgerEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      rulesJa: (consumption['rulesJa'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

class Member {
  Member({
    required this.userId,
    required this.displayName,
    required this.email,
    required this.joinedAt,
    this.isPremium = false,
  });

  final String userId;
  final String displayName;
  final String email;
  final String joinedAt;
  final bool isPremium;

  factory Member.fromJson(Map<String, dynamic> json) {
    return Member(
      userId: json['userId'] as String,
      displayName: json['displayName'] as String,
      email: json['email'] as String,
      joinedAt: json['joinedAt'] as String,
      isPremium: json['isPremium'] as bool? ?? false,
    );
  }
}

class MyRating {
  const MyRating({required this.toUserId, required this.score});

  final String toUserId;
  final int score;

  factory MyRating.fromJson(Map<String, dynamic> json) {
    return MyRating(
      toUserId: json['toUserId'] as String,
      score: json['score'] as int,
    );
  }
}

class RatingSummary {
  RatingSummary({required this.count, this.averageScore});

  final int count;
  final double? averageScore;

  factory RatingSummary.fromJson(Map<String, dynamic> json) {
    final raw = json['averageScore'];
    return RatingSummary(
      count: json['count'] as int? ?? 0,
      averageScore: raw == null ? null : (raw as num).toDouble(),
    );
  }
}

class ReportReason {
  ReportReason({required this.id, required this.label});

  final String id;
  final String label;

  factory ReportReason.fromJson(Map<String, dynamic> json) {
    return ReportReason(
      id: json['id'] as String,
      label: json['label'] as String,
    );
  }
}

class Listing {
  Listing({
    required this.id,
    required this.hostId,
    required this.hostDisplayName,
    required this.game,
    required this.rankNote,
    required this.slots,
    required this.description,
    required this.voiceOptional,
    required this.status,
    required this.createdAt,
    required this.memberCount,
    required this.members,
    this.hostIsPremium = false,
    this.myRatings = const [],
  });

  final String id;
  final String hostId;
  final String hostDisplayName;
  final bool hostIsPremium;
  final String game;
  final String rankNote;
  final int slots;
  final String description;
  final bool voiceOptional;
  final String status;
  final String createdAt;
  final int memberCount;
  final List<Member> members;
  final List<MyRating> myRatings;

  int? myScoreFor(String userId) {
    for (final r in myRatings) {
      if (r.toUserId == userId) return r.score;
    }
    return null;
  }

  factory Listing.fromJson(Map<String, dynamic> json) {
    return Listing(
      id: json['id'] as String,
      hostId: json['hostId'] as String,
      hostDisplayName: json['hostDisplayName'] as String? ?? '',
      hostIsPremium: json['hostIsPremium'] as bool? ?? false,
      game: json['game'] as String,
      rankNote: json['rankNote'] as String? ?? '',
      slots: json['slots'] as int,
      description: json['description'] as String? ?? '',
      voiceOptional: json['voiceOptional'] as bool? ?? true,
      status: json['status'] as String,
      createdAt: json['createdAt'] as String,
      memberCount: json['memberCount'] as int? ?? 0,
      members: (json['members'] as List<dynamic>? ?? [])
          .map((e) => Member.fromJson(e as Map<String, dynamic>))
          .toList(),
      myRatings: (json['myRatings'] as List<dynamic>? ?? [])
          .map((e) => MyRating.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class CallCredentials {
  CallCredentials({
    required this.url,
    required this.token,
    required this.roomName,
    required this.identity,
    this.pointsSpent = 0,
    this.usedFreeQuota = false,
    this.pointsBalance,
    this.freeCallsRemainingToday,
  });

  final String url;
  final String token;
  final String roomName;
  final String identity;
  final int pointsSpent;
  final bool usedFreeQuota;
  final int? pointsBalance;
  final int? freeCallsRemainingToday;

  factory CallCredentials.fromJson(Map<String, dynamic> json) {
    return CallCredentials(
      url: json['url'] as String,
      token: json['token'] as String,
      roomName: json['roomName'] as String,
      identity: json['identity'] as String? ?? '',
      pointsSpent: json['pointsSpent'] as int? ?? 0,
      usedFreeQuota: json['usedFreeQuota'] as bool? ?? false,
      pointsBalance: json['pointsBalance'] as int?,
      freeCallsRemainingToday: json['freeCallsRemainingToday'] as int?,
    );
  }
}

const kGames = <String>[
  'Apex Legends',
  'League of Legends',
  'Overwatch',
  'ストリートファイター',
  'Valorant',
  'Minecraft',
];
