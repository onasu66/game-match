class User {
  User({
    required this.id,
    required this.email,
    required this.displayName,
    required this.birthDate,
    required this.favoriteGames,
    required this.createdAt,
    required this.ageVerified,
  });

  final String id;
  final String email;
  final String displayName;
  final String birthDate;
  final List<String> favoriteGames;
  final String createdAt;
  final bool ageVerified;

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
    );
  }
}

class Member {
  Member({
    required this.userId,
    required this.displayName,
    required this.email,
    required this.joinedAt,
  });

  final String userId;
  final String displayName;
  final String email;
  final String joinedAt;

  factory Member.fromJson(Map<String, dynamic> json) {
    return Member(
      userId: json['userId'] as String,
      displayName: json['displayName'] as String,
      email: json['email'] as String,
      joinedAt: json['joinedAt'] as String,
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
  });

  final String id;
  final String hostId;
  final String hostDisplayName;
  final String game;
  final String rankNote;
  final int slots;
  final String description;
  final bool voiceOptional;
  final String status;
  final String createdAt;
  final int memberCount;
  final List<Member> members;

  factory Listing.fromJson(Map<String, dynamic> json) {
    return Listing(
      id: json['id'] as String,
      hostId: json['hostId'] as String,
      hostDisplayName: json['hostDisplayName'] as String? ?? '',
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
