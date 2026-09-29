// The harness's sample company brand (Atelier Martin, the cast's company):
// what an owner would give once in the Chest's admin, as chest.theme()
// answers it. Its logo is brand/atelier-martin.svg (and -dark.svg for dark
// pages), served by the fake Chest's front at /_chest/theme/brand/.
export const sampleBrand = {
  name: "Atelier Martin",
  primary: "#0e7c66",
  secondary: "#f2b134",
  neutral: "#5e6b68",
  corners: "round",
  density: "comfortable",
  display: { id: "young-serif" },
  body: { id: "work-sans" },
  logo: { url: "/_chest/theme/brand/logo.svg", alt: "Atelier Martin", dark: "/_chest/theme/brand/logo-dark.svg" },
};

// A second, harder brand (0.2.3): a yellow too light to carry white text
// or to be seen on white (the kit darkens its text, inks its edges), a
// navy second colour, sharp corners, compact — the look a switcher needs
// to show that every tool survives a brand it was not drawn for. Its logo
// is brand/cafe-du-port.svg (and -dark.svg).
export const portBrand = {
  name: "Café du Port",
  primary: "#ffd23f",
  secondary: "#1b2a4a",
  neutral: "#6b6f76",
  corners: "sharp",
  density: "compact",
  display: { id: "fraunces" },
  body: { id: "inter" },
  logo: { url: "/_chest/theme/brand/port-logo.svg", alt: "Café du Port", dark: "/_chest/theme/brand/port-logo-dark.svg" },
};

// The switcher's brands, by the key of their choice ("brand:sample", "brand:port").
export const sampleBrands = { sample: sampleBrand, port: portBrand };
