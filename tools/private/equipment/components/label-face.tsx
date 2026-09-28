import { encode, svgPath } from "../lib/qr.ts";

// A printed asset label: the QR code of the item's page in the Chest, the
// company, the tag in large monospaced letters, the item's name. The same
// drawing on the item's page and on the A4 sheets.
export function QrCode({ value, label }: { value: string; label: string }) {
  const matrix = encode(value);
  const size = matrix.length + 8;
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={svgPath(matrix, 4)} fill="#000" />
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
