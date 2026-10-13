export const CHARACTER_ITEMS = [
  {
    id: "original",
    slot: "body",
    name: "Feather One",
    matches: 0,
    wins: 0,
    streak: 0,
    description: "The original SHUTTL court companion. Everyone starts here.",
  },
  {
    id: "night",
    slot: "body",
    name: "Midnight Flight",
    matches: 20,
    wins: 0,
    streak: 0,
    description: "A midnight shell with an electric court glow.",
  },
  {
    id: "solar",
    slot: "body",
    name: "Solar Flight",
    matches: 0,
    wins: 12,
    streak: 0,
    description: "A warm copper shell earned through confirmed wins.",
  },
  {
    id: "none",
    slot: "accessory",
    name: "Pure Feather",
    matches: 0,
    wins: 0,
    streak: 0,
    description: "Clean lines. Your original look.",
  },
  {
    id: "visor",
    slot: "accessory",
    name: "Volt Visor",
    matches: 5,
    wins: 0,
    streak: 0,
    description: "A luminous lime visor for your first five confirmed matches.",
  },
  {
    id: "band",
    slot: "accessory",
    name: "Coral Courtband",
    matches: 10,
    wins: 0,
    streak: 0,
    description: "The coral signature band. Ten confirmed matches.",
  },
  {
    id: "halo",
    slot: "accessory",
    name: "Orbit Halo",
    matches: 40,
    wins: 0,
    streak: 0,
    description: "A floating orbit of gold. Forty confirmed matches.",
  },
  {
    id: "bounce",
    slot: "dance",
    name: "Court Bounce",
    matches: 0,
    wins: 0,
    streak: 0,
    description: "A little lift for every confirmed win.",
  },
  {
    id: "shuffle",
    slot: "dance",
    name: "Victory Shuffle",
    matches: 0,
    wins: 5,
    streak: 0,
    description: "A quick celebration. Five confirmed wins.",
  },
  {
    id: "spin",
    slot: "dance",
    name: "Feather Spin",
    matches: 0,
    wins: 0,
    streak: 3,
    description:
      "An earned run of three consecutive confirmed wins unlocks the spin.",
  },
] as const;
export type CharacterLook = { body: string; accessory: string; dance: string };
export const DEFAULT_CHARACTER: CharacterLook = {
  body: "original",
  accessory: "none",
  dance: "bounce",
};
export function characterUnlocked(
  item: (typeof CHARACTER_ITEMS)[number],
  progress: { matches: number; wins: number; streak: number },
) {
  return (
    progress.matches >= item.matches &&
    progress.wins >= item.wins &&
    progress.streak >= item.streak
  );
}
export function validCharacter(
  look: Partial<CharacterLook>,
  progress: { matches: number; wins: number; streak: number },
) {
  return Object.fromEntries(
    Object.entries(DEFAULT_CHARACTER).map(([slot, fallback]) => {
      const item = CHARACTER_ITEMS.find(
        (i) => i.slot === slot && i.id === look[slot as keyof CharacterLook],
      );
      return [
        slot,
        item && characterUnlocked(item, progress) ? item.id : fallback,
      ];
    }),
  ) as CharacterLook;
}
