export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  birth_date: string;
  favorite_games: string;
  created_at: string;
};

export type ListingRow = {
  id: string;
  host_id: string;
  game: string;
  rank_note: string;
  slots: number;
  description: string;
  voice_optional: number;
  status: string;
  created_at: string;
};

export type MembershipRow = {
  listing_id: string;
  user_id: string;
  joined_at: string;
};

export type DbExecResult = {
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
};

export interface MatchDb {
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<DbExecResult>;
}
