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
    );
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
    this.premiumUntil,
    this.note,
  });

  final bool isPremium;
  final String? premiumUntil;
  final String plan;
  final int maxOpenListings;
  final int freeMaxOpenListings;
  final int premiumMaxOpenListings;
  final int premiumDurationDays;
  final int premiumPriceJpy;
  final String productName;
  final bool stripeEnabled;
  final bool mockPurchaseAvailable;
  final String? note;

  factory BillingStatus.fromJson(Map<String, dynamic> json) {
    return BillingStatus(
      isPremium: json['isPremium'] as bool? ?? false,
      premiumUntil: json['premiumUntil'] as String?,
      plan: json['plan'] as String? ?? 'free',
      maxOpenListings: json['maxOpenListings'] as int? ?? 1,
      freeMaxOpenListings: json['freeMaxOpenListings'] as int? ?? 1,
      premiumMaxOpenListings: json['premiumMaxOpenListings'] as int? ?? 5,
      premiumDurationDays: json['premiumDurationDays'] as int? ?? 30,
      premiumPriceJpy: json['premiumPriceJpy'] as int? ?? 480,
      productName: json['productName'] as String? ?? 'プレミアム',
      stripeEnabled: json['stripeEnabled'] as bool? ?? false,
      mockPurchaseAvailable: json['mockPurchaseAvailable'] as bool? ?? false,
      note: json['note'] as String?,
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
  });

  final String url;
  final String token;
  final String roomName;
  final String identity;

  factory CallCredentials.fromJson(Map<String, dynamic> json) {
    return CallCredentials(
      url: json['url'] as String,
      token: json['token'] as String,
      roomName: json['roomName'] as String,
      identity: json['identity'] as String? ?? '',
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
