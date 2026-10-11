export const PREFERENCE_KEYS = [
  "name",
  "district",
  "publicName",
  "publicDistrict",
  "publicHistory",
  "discoverable",
  "localOptIn",
  "breakMode",
  "timezone",
  "goals",
  "country",
  "city",
  "publicPortrait",
] as const;

export function preferenceValues(value: any): Record<string, any> {
  return Object.fromEntries(
    PREFERENCE_KEYS.map((key) => [
      key,
      key === "goals"
        ? Object.fromEntries(
            ["Singles", "Doubles", "Mixed"]
              .filter((c) => value.goals?.[c] !== undefined)
              .map((c) => [c, value.goals[c]]),
          )
        : value[key],
    ]),
  );
}
export const preferenceSnapshot = (value: any) =>
  JSON.stringify(preferenceValues(value));
export const preferenceDraftKey = (owner: string) =>
  "shuttl:preferences-draft:" + owner;
export function clearPreferenceDraft(owner: string) {
  try {
    sessionStorage.removeItem(preferenceDraftKey(owner));
  } catch {}
}
export function readPreferenceDraft(
  me: any,
): { values: Record<string, any>; base: string } | null {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(preferenceDraftKey(me.id)) || "null",
    );
    if (
      !stored ||
      stored.owner !== me.id ||
      stored.version !== 1 ||
      typeof stored.savedAt !== "number" ||
      Date.now() - stored.savedAt > 86400000 ||
      typeof stored.base !== "string" ||
      stored.base.length > 4096 ||
      !stored.values ||
      typeof stored.values !== "object"
    )
      return null;
    for (const key of PREFERENCE_KEYS) {
      const value = stored.values[key];
      if (key === "goals") {
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).some(
            (c) =>
              !["Singles", "Doubles", "Mixed"].includes(c) ||
              !Number.isInteger(value[c]) ||
              value[c] < 0 ||
              value[c] > 5000,
          )
        )
          return null;
      } else if (
        typeof value !== typeof me[key] ||
        (typeof value === "string" && value.length > 128)
      )
        return null;
    }
    return { values: preferenceValues(stored.values), base: stored.base };
  } catch {
    return null;
  }
}
