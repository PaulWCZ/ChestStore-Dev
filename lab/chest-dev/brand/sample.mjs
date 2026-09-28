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
