export const GAMES = [
  "Apex Legends",
  "League of Legends",
  "Overwatch",
  "ストリートファイター",
  "Valorant",
  "Minecraft",
] as const;

export type GameTitle = (typeof GAMES)[number];

export function isValidGame(value: string): value is GameTitle {
  return (GAMES as readonly string[]).includes(value);
}
