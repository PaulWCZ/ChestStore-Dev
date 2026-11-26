// A bar beside a figure (a pipeline's value, a month's wins), drawn in SVG:
// its length is an attribute, never a style (the policy refuses style
// attributes). `share` is 0 to 100; anything above 0 shows at least a
// sliver. Decorative: the figure beside it says the number.
export function Bar({ share, tone, vertical = false }: { share: number; tone?: "won" | "lost"; vertical?: boolean }) {
  const length = share > 0 ? Math.min(100, Math.max(2, share)) : 0;
  const fill = `bar-fill${tone ? " " + tone : ""}`;
  return vertical ? (
    <svg className="month-bar" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="bar-bg" width="10" height="100" />
      {length > 0 && <rect className={fill} y={100 - length} width="10" height={length} />}
    </svg>
  ) : (
    <svg className="bar-track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="bar-bg" width="100" height="8" />
      {length > 0 && <rect className={fill} width={length} height="8" />}
    </svg>
  );
}
