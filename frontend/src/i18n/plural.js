export function ruPlural(n, one, few, many) {
  const a = Math.abs(Number(n) || 0) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export function enPlural(n, one, many) {
  return Number(n) === 1 ? one : many;
}
