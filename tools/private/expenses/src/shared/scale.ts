// Safe in the browser: no SDK, no database.
// The French mileage scale (barème kilométrique) as data, and the amount of
// one trip. The scale gives an allowance for a year's total professional
// distance d, by band: d × rate (+ a fixed part in the middle band). A trip
// is worth what it adds to the year's allowance:
//
//   trip = allowance(before + trip) − allowance(before)
//
// where "before" is the distance of the person's earlier trips that year
// with the same kind of vehicle. The trips of a year then add up to exactly
// the allowance of the year's total, whatever band each one fell in.
import { AppError } from "./app-error.ts";

export const vehicleKinds = ["car", "motorbike", "moped"] as const;
export type VehicleKind = (typeof vehicleKinds)[number];

// A band: [rate in thousandths of a euro per km, fixed part in euros].
export type Band = [number, number];
export type ScaleTable = { limits: [number, number]; rows: { power: string; bands: [Band, Band, Band] }[] };
export type Scale = { electricBonus: number } & Record<VehicleKind, ScaleTable>;

export const isVehicleKind = (value: unknown): value is VehicleKind => typeof value === "string" && (vehicleKinds as readonly string[]).includes(value);

// checkScale reads a scale an accountant edited: every table, three bands
// per row, rates and parts whole and bounded, limits increasing.
export function checkScale(value: unknown): Scale {
  if (!value || typeof value !== "object") throw new AppError("scale_invalid");
  const v = value as Record<string, unknown>;
  const bonus = v["electricBonus"];
  if (typeof bonus !== "number" || !Number.isInteger(bonus) || bonus < 0 || bonus > 100) throw new AppError("scale_invalid");
  const out: Partial<Scale> = { electricBonus: bonus };
  for (const kind of vehicleKinds) {
    const t = v[kind] as Record<string, unknown> | undefined;
    if (!t || !Array.isArray(t["limits"]) || !Array.isArray(t["rows"])) throw new AppError("scale_invalid");
    const [a, b] = t["limits"] as unknown[];
    if (typeof a !== "number" || typeof b !== "number" || !Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b <= a || b > 1_000_000) throw new AppError("scale_invalid");
    const rows = (t["rows"] as unknown[]).map(r => {
      const row = r as Record<string, unknown>;
      const power = row["power"];
      if (typeof power !== "string" || !/^[0-9a-z+-]{1,10}$/u.test(power)) throw new AppError("scale_invalid");
      const bands = row["bands"];
      if (!Array.isArray(bands) || bands.length !== 3) throw new AppError("scale_invalid");
      const clean = bands.map(band => {
        if (!Array.isArray(band) || band.length !== 2) throw new AppError("scale_invalid");
        const [rate, fixed] = band as unknown[];
        if (typeof rate !== "number" || typeof fixed !== "number" || !Number.isInteger(rate) || !Number.isInteger(fixed) || rate < 0 || rate > 10_000 || fixed < 0 || fixed > 100_000) throw new AppError("scale_invalid");
        return [rate, fixed] as Band;
      }) as [Band, Band, Band];
      return { power, bands: clean };
    });
    if (rows.length === 0 || rows.length > 10 || new Set(rows.map(r => r.power)).size !== rows.length) throw new AppError("scale_invalid");
    out[kind] = { limits: [a, b], rows };
  }
  return out as Scale;
}

// The allowance of a year's total distance (in tenths of a km), in
// ten-thousandths of a euro: exact integers, rounded once, at the end.
function allowance(table: ScaleTable, power: string, tenths: number): number {
  const row = table.rows.find(r => r.power === power);
  if (!row) throw new AppError("no_vehicle");
  const band = tenths <= table.limits[0] * 10 ? 0 : tenths <= table.limits[1] * 10 ? 1 : 2;
  const [rate, fixed] = row.bands[band];
  return tenths * rate + (tenths > 0 ? fixed * 10_000 : 0);
}

// In cents, with the electric bonus (percent) applied before rounding.
export function allowanceCents(scale: Scale, kind: VehicleKind, power: string, electric: boolean, tenths: number): number {
  const base = allowance(scale[kind], power, tenths);
  const factor = 100 + (electric ? scale.electricBonus : 0);
  return Math.round((base * factor) / 10_000);
}

// What one trip is worth, after `before` tenths of km that year.
export function tripCents(scale: Scale, kind: VehicleKind, power: string, electric: boolean, before: number, trip: number): number {
  return Math.max(0, allowanceCents(scale, kind, power, electric, before + trip) - allowanceCents(scale, kind, power, electric, before));
}

// The powers of a kind of vehicle, in the order of the scale.
export function powers(scale: Scale, kind: VehicleKind): string[] {
  return scale[kind].rows.map(r => r.power);
}
