/** Font families for the social image composer (preview + export mapping on backend). */
export const FONT_GROUPS = [
  {
    label: "Sans-serif",
    fonts: [
      "Arial",
      "Helvetica",
      "Verdana",
      "Tahoma",
      "Trebuchet MS",
      "Calibri",
      "Segoe UI",
      "Open Sans",
      "Roboto",
      "Montserrat",
      "Lato",
    ],
  },
  {
    label: "Serif",
    fonts: [
      "Georgia",
      "Times New Roman",
      "Palatino",
      "Garamond",
      "Merriweather",
      "Playfair Display",
    ],
  },
  {
    label: "Display",
    fonts: ["Impact", "Arial Black", "Bebas Neue", "Oswald", "Anton"],
  },
  {
    label: "Monospace",
    fonts: ["Courier New", "Consolas", "Monaco", "Lucida Console"],
  },
];

export const ALL_OVERLAY_FONTS = FONT_GROUPS.flatMap((g) => g.fonts);
