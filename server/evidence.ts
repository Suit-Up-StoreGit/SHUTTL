// Exact bounded row-span checks. These are structural certificates, never
// calibrated skill confidence. Limits fail closed instead of inventing ranks.
type Fraction = [bigint, bigint];
const abs = (x: bigint) => (x < 0n ? -x : x);
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return abs(a) || 1n;
}
function fraction(n: bigint, d = 1n): Fraction {
  if (!d) throw new Error("Invalid evidence division");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const common = gcd(n, d),
    result: Fraction = [n / common, d / common];
  if (
    abs(result[0]).toString(2).length > 1024 ||
    result[1].toString(2).length > 1024
  )
    throw new Error("Evidence complexity limit");
  return result;
}
const sub = (a: Fraction, b: Fraction) =>
  fraction(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Fraction, b: Fraction) => fraction(a[0] * b[0], a[1] * b[1]);
export function comparisonClasses(rosters: string[][]): {
  classes: Map<string, string>;
  bounded: boolean;
} {
  const players = [...new Set(rosters.flat())].sort(),
    classes = new Map<string, string>();
  if (players.length > 128 || rosters.length > 2048)
    return { classes, bounded: false };
  const ids = new Map(players.map((p, i) => [p, i])),
    basis = new Map<number, Map<number, Fraction>>();
  const reduce = (input: Map<number, Fraction>) => {
    const row = new Map(input);
    for (const pivot of [...basis.keys()].sort((a, b) => a - b)) {
      const value = row.get(pivot);
      if (!value?.[0]) continue;
      for (const [column, coefficient] of basis.get(pivot)!) {
        const next = sub(row.get(column) || [0n, 1n], mul(value, coefficient));
        if (next[0]) row.set(column, next);
        else row.delete(column);
      }
    }
    return row;
  };
  try {
    for (const roster of rosters) {
      if (
        ![2, 4].includes(roster.length) ||
        new Set(roster).size !== roster.length
      )
        continue;
      const input = new Map<number, Fraction>(
        roster.map((p, i) => [
          ids.get(p)!,
          [i < roster.length / 2 ? 1n : -1n, 1n],
        ]),
      );
      const row = reduce(input);
      if (!row.size) continue;
      const pivot = Math.min(...row.keys()),
        lead = row.get(pivot)!;
      const inverse = fraction(lead[1], lead[0]);
      for (const [column, value] of row) row.set(column, mul(value, inverse));
      basis.set(pivot, row);
    }
    const representatives: string[] = [];
    for (const p of players) {
      let found: string | undefined;
      for (const representative of representatives) {
        const difference = new Map<number, Fraction>([
          [ids.get(p)!, [1n, 1n]],
          [ids.get(representative)!, [-1n, 1n]],
        ]);
        if (!reduce(difference).size) {
          found = representative;
          break;
        }
      }
      if (!found) {
        found = p;
        representatives.push(p);
      }
      classes.set(p, found);
    }
    return { classes, bounded: true };
  } catch {
    return { classes: new Map(), bounded: false };
  }
}
