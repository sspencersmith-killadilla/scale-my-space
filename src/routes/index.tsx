import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, Ruler, FileText, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shrinkify — Photo to Miniature Woodworking Plans" },
      {
        name: "description",
        content:
          "Upload photos of a real building, pick a dollhouse scale, and get a printable cut list, elevations and assembly plan.",
      },
      { property: "og:title", content: "Shrinkify — Photo to Miniature Woodworking Plans" },
      {
        property: "og:description",
        content:
          "Turn a real building into scaled woodworking plans: cut list, elevations, cutting layout and a printable PDF pack.",
      },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: Camera,
    label: "01 / Photograph",
    title: "Upload your photos",
    body: "Front, sides, and any angle you have. Add one known dimension — a door height, a step — and the estimates get sharper.",
  },
  {
    icon: Ruler,
    label: "02 / Scale",
    title: "Pick your scale",
    body: "Classic 1:12, 1:24 and 1:48, a custom ratio, or just say how tall you want the finished model to stand.",
  },
  {
    icon: FileText,
    label: "03 / Plan",
    title: "Get real drawings",
    body: "A cut list snapped to your stock thickness, four scaled elevations, a cutting layout, and step-by-step assembly.",
  },
  {
    icon: Hammer,
    label: "04 / Build",
    title: "Print and cut",
    body: "Download the whole pack as a PDF, save the project, and regenerate at a different scale whenever you like.",
  },
];

function Landing() {
  const { user, loading } = useAuth();
  const target = user ? "/projects" : "/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold tracking-tight">SHRINKIFY</span>
            <span className="tech-label text-blueprint">plan works</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/guide">Guide</Link>
            </Button>
            {!loading &&
              (user ? (
                <Button asChild size="sm">
                  <Link to="/projects">My projects</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to="/auth">Start a plan</Link>
                  </Button>
                </>
              ))}
          </nav>
        </div>
      </header>

      <main>
        <section className="grid-paper border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
            <div>
              <p className="tech-label text-accent">Photo → dollhouse plans</p>
              <h1 className="mt-4 text-5xl font-extrabold leading-[0.95] tracking-tight md:text-6xl">
                Any building.
                <br />
                Any scale.
                <br />
                <span className="text-blueprint">Cut list included.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                Photograph the house you grew up in, the corner shop, a barn on a back road. Shrinkify
                estimates its real dimensions, shrinks it to the scale you choose, and hands you a
                printable woodworking plan pack.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to={target}>
                    Generate a plan <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/guide">Read the guide</Link>
                </Button>
                <span className="tech-label text-muted-foreground">
                  1:12 · 1:24 · 1:48 · custom
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-lg border-2 border-foreground bg-card p-5 shadow-[8px_8px_0_0_var(--kraft)]">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="tech-label">Sheet 1 / cut list</span>
                  <span className="tech-label text-blueprint">scale 1:24</span>
                </div>
                <svg viewBox="0 0 320 220" className="mt-4 w-full" role="img" aria-label="Sample elevation drawing">
                  <polygon
                    points="40,180 40,90 160,40 280,90 280,180"
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth="2"
                  />
                  <line x1="40" y1="90" x2="280" y2="90" stroke="var(--blueprint)" strokeWidth="1" strokeDasharray="5 4" />
                  <rect x="70" y="120" width="34" height="42" fill="none" stroke="var(--foreground)" />
                  <line x1="87" y1="120" x2="87" y2="162" stroke="var(--blueprint)" />
                  <line x1="70" y1="141" x2="104" y2="141" stroke="var(--blueprint)" />
                  <rect x="216" y="120" width="34" height="42" fill="none" stroke="var(--foreground)" />
                  <line x1="233" y1="120" x2="233" y2="162" stroke="var(--blueprint)" />
                  <line x1="216" y1="141" x2="250" y2="141" stroke="var(--blueprint)" />
                  <rect x="142" y="126" width="36" height="54" fill="none" stroke="var(--foreground)" strokeWidth="1.4" />
                  <circle cx="171" cy="153" r="2.4" fill="var(--accent)" />
                  <g stroke="var(--accent)">
                    <line x1="40" y1="198" x2="280" y2="198" />
                    <line x1="40" y1="193" x2="40" y2="203" />
                    <line x1="280" y1="193" x2="280" y2="203" />
                  </g>
                  <text x="160" y="213" textAnchor="middle" fill="var(--foreground)" style={{ font: "500 11px var(--font-mono)" }}>
                    10 1/2&quot;
                  </text>
                </svg>
                <div className="mt-4 space-y-1.5 font-mono text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Front wall</span>
                    <span>10 1/2&quot; × 6 3/16&quot;</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Side wall ×2</span>
                    <span>7 1/4&quot; × 6 3/16&quot;</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Roof panel ×2</span>
                    <span>11 1/8&quot; × 4 7/8&quot;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.label} className="border-t-2 border-foreground pt-5">
                <s.icon className="size-5 text-accent" />
                <p className="tech-label mt-3 text-muted-foreground">{s.label}</p>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-secondary">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <p className="tech-label text-accent">Honest about estimates</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Photos give proportions, not certainty
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every plan lists exactly what was inferred from the images, and every dimension stays
              editable — correct one number and the cut list, drawings and PDF all recompute.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link to={target}>Start your first project</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <p className="tech-label text-muted-foreground">Shrinkify — plan works · built for sawdust</p>
      </footer>
    </div>
  );
}
