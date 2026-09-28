// The map's contour lines: concentric rings around two hills, drawn in the
// colour of the place that shows them (a header, an empty state).
// Decoration only.
export function Contours({ variant = "wide" }: { variant?: "wide" | "small" }) {
  const rings = [0, 1, 2, 3, 4, 5, 6];
  const hill = (cx: number, cy: number, rx: number, ry: number, step: number, tilt: number) =>
    rings.map(i => (
      <path
        key={`${cx}-${i}`}
        d={blob(cx, cy, rx + i * step, ry + i * step * 0.62, i)}
        transform={`rotate(${tilt} ${cx} ${cy})`}
      />
    ));
  return (
    <svg className="contours" viewBox={variant === "wide" ? "0 0 1200 160" : "0 0 400 300"} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        {variant === "wide" ? (
          <>
            {hill(930, 70, 40, 22, 34, -8)}
            {hill(260, 150, 60, 30, 30, 6)}
          </>
        ) : (
          <>
            {hill(290, 90, 26, 18, 24, -12)}
            {hill(70, 260, 30, 20, 26, 10)}
          </>
        )}
      </g>
    </svg>
  );
}

// A closed, slightly irregular loop: an ellipse whose radius wobbles a
// little, differently for each ring, like a real contour line.
function blob(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const steps = 10;
  const points: [number, number][] = [];
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2;
    const wobble = 1 + 0.07 * Math.sin(a * 3 + seed * 1.7) + 0.04 * Math.cos(a * 2 - seed);
    points.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]);
  }
  // A smooth closed curve through the points (Catmull-Rom as cubic Béziers).
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M${r(points[0]![0])} ${r(points[0]![1])}`;
  for (let i = 0; i < steps; i++) {
    const p0 = points[(i - 1 + steps) % steps]!, p1 = points[i]!, p2 = points[(i + 1) % steps]!, p3 = points[(i + 2) % steps]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r(c1[0]!)} ${r(c1[1]!)} ${r(c2[0]!)} ${r(c2[1]!)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d + "Z";
}
