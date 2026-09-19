// Two flowing passes of the palette, gently warped so colours recur in moving
// patches rather than belonging to a left/centre/right section. No constant
// contribution from all three colours: each picker gets a recognisable core.
export function flowingColour(colours, position, phase, cycles = 2) {
  const angle = position * Math.PI * 2 * cycles - phase
    + Math.sin(position * Math.PI * 2 + phase) * 0.65;
  const weights = [0, 1, 2].map((index) => (
    (0.5 + Math.cos(angle - index * Math.PI * 2 / 3) * 0.5) ** 4
  ));
  const total = weights[0] + weights[1] + weights[2];
  // Blend light energy (gamma ~2) to avoid muddy/dark seams between vivid
  // colours, while preserving an identical-colour palette exactly.
  const mixed = [0, 1, 2].map((channel) => Math.round(Math.sqrt(
    colours.reduce((sum, colour, index) => sum + colour[channel] ** 2 * weights[index], 0) / total
  )));
  return `rgb(${mixed[0]} ${mixed[1]} ${mixed[2]})`;
}
