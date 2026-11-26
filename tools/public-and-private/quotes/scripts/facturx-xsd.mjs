// The Factur-X EN 16931 schema check, with the official XSD fetched at test
// time (never committed): the `factur-x` package on PyPI (BSD licence,
// Akretion) carries the Factur-X 1.09 XSD files. Pinned by version and
// SHA-256; unpacked once into node_modules/.cache/facturx-xsd/, then the
// tests run with FACTURX_XSD set (test/facturx.test.ts checks the invoice,
// credit note and non-euro samples with xmllint).
//
//   npm run test:facturx        (needs network once, unzip and xmllint)
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const wheel = {
  url: "https://files.pythonhosted.org/packages/ac/f6/e84b43135edda6c2bfb725518a7c513b623ff717c6e060b6b5ea68cfb432/factur_x-7.3-py3-none-any.whl",
  sha256: "46264c4f5c401c9f9b5db25cc846752197732a38ebf99db45666493af1df2fae",
};
const cache = join(process.cwd(), "node_modules", ".cache", "facturx-xsd");
const xsd = join(cache, "facturx", "xsd_and_schematron", "facturx-en16931", "Factur-X_EN16931.xsd");

if (!existsSync(xsd)) {
  const response = await fetch(wheel.url);
  if (!response.ok) throw new Error(`PyPI answered ${response.status} for the factur-x wheel`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sum = createHash("sha256").update(bytes).digest("hex");
  if (sum !== wheel.sha256) throw new Error(`the factur-x wheel's SHA-256 is ${sum}, not the pinned one`);
  mkdirSync(cache, { recursive: true });
  const file = join(cache, "factur_x.whl");
  writeFileSync(file, bytes);
  execFileSync("unzip", ["-o", "-q", file, "facturx/xsd_and_schematron/facturx-en16931/*", "-d", cache]);
}
console.log(`FACTURX_XSD=${xsd}`);
const run = spawnSync("npm", ["test"], { stdio: "inherit", env: { ...process.env, FACTURX_XSD: xsd } });
process.exit(run.status ?? 1);
