/* ------------------------------------------------------------------
 * Page configuration: authors, links, BibTeX. Edit here, not in index.html.
 *
 * affiliations: a string, or { name, url, logo } (logo shown before the name).
 * links: "" renders a grey button marked "soon" (not clickable); "#id" scrolls on the page.
 * venue: leave "" (no venue on the page).
 * ------------------------------------------------------------------ */
window.SITE = {
  venue: "",

  authors: [
    { name: "Yuhang Dai", url: "", affil: [1] },
    { name: "Xingyi Yang", url: "", affil: [1] }
  ],
  affiliations: [
    { name: "Learning & Generation Lab, The Hong Kong Polytechnic University", url: "https://lglabpolyu.github.io/", logo: "static/images/lg_lab_logo.webp" }
  ],
  notes: [],

  links: {
    paper: "https://arxiv.org/pdf/2604.14048",
    arxiv: "https://arxiv.org/abs/2604.14048",
    code: "https://github.com/yuhangdai427/Free-Geometry",
    supplement: "",
    video: "#video"
  },

  // as in the code README (arXiv 2604.14048); to be updated when the new arXiv version is out
  bibtex:
`@misc{dai2026freegeometryrefining3d,
  title={Free Geometry: Refining 3D Reconstruction from Longer Versions of Itself},
  author={Dai, Yuhang and Yang, Xingyi},
  year={2026},
  eprint={2604.14048},
  archivePrefix={arXiv},
  url={https://arxiv.org/abs/2604.14048}
}`
};
