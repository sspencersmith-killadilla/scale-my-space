import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, Ruler, FileText, Hammer, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "User guide — how to turn photos into miniature plans | Shrinkify" },
      {
        name: "description",
        content:
          "Step-by-step guide to photographing a building, choosing a dollhouse scale, reading the cut list and building from the printed Shrinkify plan pack.",
      },
      { property: "og:title", content: "User guide — photos to miniature woodworking plans" },
      {
        property: "og:description",
        content:
          "How to shoot usable photos, calibrate scale, read the cut list and build from a Shrinkify plan pack.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Guide,
});

const SECTIONS = [
  {
    id: "photos",
    icon: Camera,
    label: "01 / Photograph",
    title: "Shoot photos Shrinkify can read",
    lead: "The plan is only as good as what the photos show. Five minutes of care here saves an hour of corrections later.",
    dos: [
      "One straight-on shot of the front, standing back far enough that the walls look parallel.",
      "At least one corner shot showing two sides at once — this is what gives depth.",
      "A side elevation if you can get one, and the roof line against the sky.",
      "Even, flat light. Overcast beats harsh midday sun and deep shadows.",
    ],
    donts: [
      "Extreme wide-angle or fisheye lenses — they bend the walls and skew proportions.",
      "Heavy obstructions: parked cars, hedges across the base, people in front of the door.",
      "Shots taken from far below looking up, which exaggerates height.",
    ],
  },
  {
    id: "reference",
    icon: Ruler,
    label: "02 / Calibrate",
    title: "Give it one real measurement",
    lead: "Photos give proportions, not certainty. A single known dimension turns the whole estimate from a guess into arithmetic.",
    dos: [
      "Type a known dimension into the reference note: \"the front door is 84 inches tall\".",
      "Good anchors: a standard door (80–84\"), a garage door (84–96\"), a brick course, a step riser (~7\").",
      "Add a second note about anything unusual — a raised foundation, a deep porch, a tall parapet.",
    ],
    donts: [
      "Leave the reference blank if you know a measurement — the model will assume typical residential sizes instead.",
      "Contradict yourself across notes; the last stated dimension wins.",
    ],
  },
  {
    id: "scale",
    icon: FileText,
    label: "03 / Scale & stock",
    title: "Pick a scale and your material",
    lead: "Scale decides how big the model gets. Stock thickness decides how the parts fit together.",
    dos: [
      "1:12 for classic dollhouse furniture-compatible builds. 1:24 for a display piece. 1:48 for a shelf model.",
      "Or set a target height — \"18 inches tall\" — and Shrinkify solves the ratio for you.",
      "Match stock thickness to what's actually on your bench (1/8\", 1/4\", 1/2\" and so on).",
      "Everything is recomputed live in the Scale Bench, so try a few sizes before printing.",
    ],
    donts: [
      "Go below 1:48 on a detailed building — window openings get too small to cut cleanly.",
      "Assume the cut list ignores thickness: side walls are shortened to account for butt joints.",
    ],
  },
  {
    id: "reading",
    icon: Wrench,
    label: "04 / Read the plan",
    title: "What each sheet means",
    lead: "A finished project has four things to read, in this order.",
    dos: [
      "Assumptions — everything the model inferred. Read this first and correct anything wrong.",
      "Cut list — every part, quantity, and finished size rounded to the nearest 1/32\".",
      "Elevations — scaled front, back and side drawings with openings positioned.",
      "Cutting layout — parts nested on your sheet so you can see how much stock you need.",
    ],
    donts: [
      "Trust a dimension that contradicts the photo — edit it; the drawings and PDF follow.",
      "Cut before dry-checking the largest panel against the elevation.",
    ],
  },
  {
    id: "build",
    icon: Hammer,
    label: "05 / Build",
    title: "From printout to model",
    lead: "Download the PDF pack, take it to the bench, and work outside-in.",
    dos: [
      "Print at 100% (no \"fit to page\") so the scale bar on the sheet stays true.",
      "Cut the largest panels first, then openings, then the roof.",
      "Dry-fit the box with tape before any glue goes on.",
      "Sand edges after assembly, not before — it keeps joints tight.",
    ],
    donts: [
      "Cut window openings before the wall panel is squared.",
      "Glue the roof on until the interior is finished and painted.",
    ],
  },
];

const FAQ = [
  {
    q: "How accurate are the dimensions?",
    a: "They are informed estimates. With a straight-on photo and one known measurement, the proportions are usually close; without a reference the model falls back to typical residential sizes. Every assumption is listed so you can correct it.",
  },
  {
    q: "Can I change the scale after generating?",
    a: "Yes. The Scale Bench on a saved project recomputes the cut list, drawings and PDF instantly — no new generation and no new photos needed.",
  },
  {
    q: "What material should I use?",
    a: "Baltic birch plywood or basswood sheet both cut cleanly at these sizes. Whatever you use, set the thickness in the project so joinery compensation is right.",
  },
  {
    q: "How many photos should I upload?",
    a: "Two to four is the sweet spot: front, a corner, and a side. Six is the maximum.",
  },
  {
    q: "Are my photos and projects private?",
    a: "Yes. Uploads live in private storage and every project is readable only by the account that created it.",
  },
];

function Guide() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold tracking-tight">SHRINKIFY</span>
            <span className="tech-label text-blueprint">plan works</span>
          </Link>
          <Button asChild size="sm">
            <Link to="/projects">Start a plan</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-14">
        <p className="tech-label text-accent">User guide</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
          Photo to model, start to finish
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Everything you need to get a plan you can actually cut: how to shoot the building, how to
          calibrate the scale, how to read each sheet, and how to build from the printout.
        </p>

        <nav className="grid-paper mt-10 rounded-lg border-2 border-foreground p-5">
          <p className="tech-label text-muted-foreground">On this page</p>
          <ul className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-blueprint hover:underline">
                  {s.label} — {s.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#faq" className="text-blueprint hover:underline">
                06 / Questions
              </a>
            </li>
          </ul>
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mt-16 scroll-mt-8">
            <div className="border-t-2 border-foreground pt-5">
              <s.icon className="size-5 text-accent" />
              <p className="tech-label mt-3 text-muted-foreground">{s.label}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{s.title}</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">{s.lead}</p>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="tech-label text-blueprint">Do this</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {s.dos.map((d) => (
                    <li key={d} className="flex gap-2">
                      <span className="text-accent">+</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-secondary p-5">
                <p className="tech-label text-muted-foreground">Avoid</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {s.donts.map((d) => (
                    <li key={d} className="flex gap-2">
                      <span className="text-destructive">−</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}

        <section id="faq" className="mt-16 scroll-mt-8">
          <div className="border-t-2 border-foreground pt-5">
            <p className="tech-label text-muted-foreground">06 / Questions</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Common questions</h2>
          </div>
          <dl className="mt-6 divide-y divide-border">
            {FAQ.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-16 rounded-lg border-2 border-foreground bg-card p-8 text-center shadow-[8px_8px_0_0_var(--kraft)]">
          <h2 className="text-2xl font-bold tracking-tight">Ready to try it?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Grab two or three photos and a known door height — that's genuinely all you need for a
            first plan.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/projects/new">
              Generate a plan <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </main>

      <footer className="mx-auto max-w-4xl px-6 py-10">
        <p className="tech-label text-muted-foreground">Shrinkify — plan works · built for sawdust</p>
      </footer>
    </div>
  );
}
