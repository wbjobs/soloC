export function scoreToColor(score: number): [number, number, number] {
  const clampedScore = Math.max(0, Math.min(1, score));
  
  if (clampedScore <= 0.5) {
    const t = clampedScore * 2;
    return [
      1.0,
      t,
      t
    ];
  } else {
    const t = (clampedScore - 0.5) * 2;
    return [
      1.0 - t,
      0.5 + t * 0.5,
      1.0
    ];
  }
}

export function scoreToHex(score: number): string {
  const [r, g, b] = scoreToColor(score);
  const toHex = (c: number) => {
    const hex = Math.floor(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getColorScaleColors(): string[] {
  const colors: string[] = [];
  for (let i = 0; i <= 100; i += 10) {
    colors.push(scoreToHex(i / 100));
  }
  return colors;
}
