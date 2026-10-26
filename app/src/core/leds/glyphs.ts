/** Dígitos de 5×7 para las matrices de 7×7 (se dibujan en las columnas 1–5). Iguales a anim.cpp. */
export const DIGIT_GLYPHS: Readonly<Record<1 | 2 | 3, readonly string[]>> = {
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
};

export function glyphOn(digit: 1 | 2 | 3, x: number, y: number): boolean {
  if (x < 1 || x > 5 || y < 0 || y > 6) return false;
  return DIGIT_GLYPHS[digit][y]?.[x - 1] === '#';
}
