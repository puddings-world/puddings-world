// Public "Now building" copy for the home page. Refreshed weekly from the
// owner's private development notes; keep it to what is fine to say out loud.
//
// Format for whoever (or whatever) regenerates this file:
// - `note`: one or two sentences. Wrap the one or two phrases a skimming
//   reader should catch in `**double asterisks**`; nothing else is parsed.
// - `href`: only public GitHub repos or pages already on this site.
// - `projects`: slugs from data/projects.json that the item is about (for
//   example ["paperfact"] or ["kaikou-claude", "clip-claude"]). The world map
//   on /projects lights those nodes up with this note; leave it out when the
//   item is about nothing listed there.
// - `image`: optional screenshot under public/now/, 16:9, 1280×720, kept
//   under ~150 KB (it is served as-is, bypassing the image optimizer, which
//   hung on a UI screenshot). Cards without one get a monogram tile instead.

export type NowItem = {
  title: string;
  note: string;
  href?: string;
  image?: string;
  projects?: string[];
};

export const now = {
  updated: "2026-11-23",
  items: [
    {
      title: "Paperfact",
      projects: ["paperfact"],
      note: "I'm building **Paperfact, a desktop reader that turns any paper into a guided reading session**: AI commentary paragraph by paragraph, a citation map, and a reading queue across venues. It was the busiest line this week, and the app can now **open a single paper straight into the window that is already running**.",
      image: "/now/paperfact.jpg",
    },
    {
      title: "Mapetite",
      projects: ["mapetite"],
      note: "I'm building a **browser extension that curates food places on top of Google Maps**. This week it learned to **understand what a request means and rank places by it** instead of filtering, places now nest by location from the country down, and an AI-guessed tag counts for nothing until I confirm it.",
      image: "/now/mapetite.jpg",
    },
    {
      title: "Assistant Hub",
      projects: ["assistant-hub"],
      note: "I'm building a **personal command centre** that every project and tool reports into. This week it gained a **morning news magazine** with the day's events first and papers after, an MCP server and a file viewer, and a decisions page that lists everything actually waiting on me.",
      image: "/now/assistant-hub.jpg",
    },
    {
      title: "Street KTV & Mandopop pipeline",
      projects: ["streetperformermaster", "mandpopdatapipeline", "reprise-studio"],
      note: "I'm running a **music line from dataset to stage**: MandpopDataPipeline turns Mandarin pop into separated stems and time-aligned lyrics, Reprise Studio renders those into abstract lyric videos, and Street KTV is the gig-side app, a **performer app on Android with a live audience songbook on this site**. It was a quiet week on this line.",
      href: "/playground/street-ktv-menu",
      image: "/now/street-ktv.png",
    },
    {
      title: "This site",
      note: "I'm keeping this site as a mount surface for the tools above. The **projects page now has a world map of every project**, lit up by this weekly summary, and activity is counted across every branch rather than only the default one.",
      href: "/projects",
      image: "/now/this-site.png",
    },
    {
      title: "Windoalls & session restore",
      projects: ["windoalls", "visual-impression"],
      note: "I'm building **Windows terminal tooling that tracks and restores AI coding sessions** across tabs, reboots and crashes. This week went into the attention lamps: **each agent is now an adapter that registers itself**, so Claude Code, Codex and Antigravity turns light a lamp on the right tab or editor window, and background runs light nothing.",
    },
    {
      title: "Cataract surgery video analysis",
      projects: ["cataract-vision-lab"],
      note: "I'm running a **research line on cataract surgery video**, with a first study scoped around capsulorhexis. This week I organised a **phase-recognition workspace around Cataract-1K**: the published manual step labels with their boundary rules, a mapping back to the original phases, and a timeline comparison of the released models with my own.",
    },
    {
      title: "SurgeryOCR",
      projects: ["surgeryocr"],
      note: "I'm maintaining an **OCR tool that reads device readouts off ophthalmic surgery video**. It now **ships its trained models** with machine-aware analysis and backend setup, and CI exercises a generated instrument panel.",
      href: "/projects/surgeryocr",
    },
    {
      title: "Smarter AI for Romance of the Three Kingdoms XI",
      projects: ["san11-smart-ai"],
      note: "I'm studying **how the original game AI actually decides** before building a smarter one on top. An **unattended static-research loop** now runs daily at low priority, with each finding checked by an independent read-only review; a full map of the game's legal actions is still ahead, and strategy work stays on hold until then.",
    },
    {
      title: "Agent CLI companions",
      projects: ["kaikou-claude", "clip-claude", "listen-claude"],
      note: "I'm keeping **three small companions for terminal coding agents**: Kaikou for Chinese voice input, Clip for pasting screenshots where the CLI has no image paste, Listen for spoken replies. No new features this week; next for Kaikou is a **speech-recognition comparison on my own recordings**.",
      href: "/projects/kaikou-claude",
    },
  ] satisfies NowItem[],
};
