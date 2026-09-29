import { encode, svgPath } from "../lib/qr.ts";

// A printed asset label: the QR code of the item's page in the Chest, the
// company, the tag in large monospaced letters, the item's name. The same
// drawing on the item's page and on the A4 sheets. Black on white in every
// look (the paper's colours, app/tokens.css): a scanner needs it so.
export function QrCode({ value, label }: { value: string; label: string }) {
  const matrix = encode(value);
  const size = matrix.length + 8;
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect className="qr-ground" width={size} height={size} />
      <path className="qr-modules" d={svgPath(matrix, 4)} />
    </svg>
  );
}

export function LabelFace({ url, tag, name, company, scan, qrLabel }: { url: string; tag: string; name: string; company: string; scan: string; qrLabel: string }) {
  return (
    <div className="label-face">
      <QrCode value={url} label={qrLabel} />
      <div className="label-face-text">
        {company && <span className="label-face-company">{company}</span>}
        <span className="label-face-tag" translate="no">{tag}</span>
        <span className="label-face-name">{name}</span>
        <span className="label-face-scan">{scan}</span>
      </div>
    </div>
  );
}
