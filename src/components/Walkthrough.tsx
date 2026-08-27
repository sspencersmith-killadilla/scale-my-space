import { useEffect, useState } from "react";
import { Camera, Ruler, FileText, Hammer, X, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "shrinkify.walkthrough.v1";

const SLIDES = [
  {
    icon: Camera,
    label: "Step 01 / Photograph",
    title: "Upload 1–6 photos",
    body: "Start with a straight-on front shot, then add sides and any angle you have. Corners help most — they let Shrinkify read depth as well as width.",
    tip: "Add one real measurement in the notes (\"the front door is 84 inches tall\") and every other dimension gets calibrated against it.",
  },
  {
    icon: Ruler,
    label: "Step 02 / Scale",
    title: "Choose a scale or a size",
    body: "Pick a classic dollhouse ratio (1:12, 1:24, 1:48), type a custom ratio, or simply say how tall you want the finished model to stand and Shrinkify solves the ratio for you.",
    tip: "Set your stock thickness too — the cut list compensates for butt joints so walls end up the right outside dimension.",
  },
  {
    icon: FileText,
    label: "Step 03 / Plan",
    title: "Read and adjust the plan",
    body: "You get a cut list snapped to 1/32\", scaled elevations, a cutting layout for your sheet, and assembly steps. Every estimate is listed as an assumption you can correct.",
    tip: "Use the Scale Bench at the top of a plan to change scale or thickness — the whole plan recomputes instantly, no regeneration needed.",
  },
  {
    icon: Hammer,
    label: "Step 04 / Build",
    title: "Print the pack and cut",
    body: "Download the PDF pack for the bench: cover sheet, cut list, elevations, cutting layout and instructions. Your project stays saved so you can come back at a new scale.",
    tip: "Cut the largest panels first, dry-fit the box before glue, and keep the roof for last.",
  },
];

export function Walkthrough({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  if (!open) return null;
  const s = SLIDES[i]!;
  const last = i === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-lg rounded-lg border-2 border-foreground bg-card p-6 shadow-[8px_8px_0_0_var(--kraft)]">
        <div className="flex items-start justify-between gap-4">
          <p className="tech-label text-accent">{s.label}</p>
          <button
            onClick={onClose}
            aria-label="Close walkthrough"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <s.icon className="mt-4 size-6 text-blueprint" />
        <h2 className="mt-3 text-2xl font-bold tracking-tight">{s.title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{s.body}</p>
        <p className="mt-4 border-l-2 border-accent bg-secondary p-3 font-mono text-xs text-foreground">
          {s.tip}
        </p>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {SLIDES.map((slide, idx) => (
              <span
                key={slide.label}
                className={`h-1.5 w-6 rounded-full ${idx === i ? "bg-foreground" : "bg-border"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}>
                <ArrowLeft className="mr-1 size-4" /> Back
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? (
                "Start building"
              ) : (
                <>
                  Next <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** First-run gate: returns whether the walkthrough should show, plus controls. */
export function useWalkthrough() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY) !== "seen") setOpen(true);
  }, []);

  return {
    open,
    show: () => setOpen(true),
    close: () => {
      localStorage.setItem(KEY, "seen");
      setOpen(false);
    },
  };
}
