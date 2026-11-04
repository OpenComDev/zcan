/**
 * SVG text can't wrap, and translated labels run longer than English. `fitText` estimates the rendered
 * width of a monospace label (CJK glyphs are full width) and returns props that shrink it to `max` px:
 * first by lowering the font size (down to 70%), then by compressing glyphs with `textLength`.
 */
export function fitText(text: string, size: number, max: number) {
  let em = 0;
  for (const ch of text) em += /[⺀-꓏가-힯豈-﫿︰-﹏＀-｠]/.test(ch) ? 1 : 0.6;
  if (em * size <= max) return { fontSize: size };
  const fontSize = Math.max(size * 0.7, max / em);
  return fontSize * em > max ? { fontSize, textLength: max, lengthAdjust: "spacingAndGlyphs" as const } : { fontSize };
}
