import { Fragment, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PlanGlossaryEntry } from "@/lib/plan-model";

/** Renders text with every glossary term turned into a tap-to-explain word. */
export function GlossaryText({ text, glossary }: { text: string; glossary: PlanGlossaryEntry[] }) {
  const pattern = useMemo(() => {
    const terms = glossary
      .map((g) => g.term.trim())
      .filter((t) => t.length > 2)
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return terms.length ? new RegExp(`\\b(${terms.join("|")})\\b`, "gi") : null;
  }, [glossary]);

  if (!pattern) return <>{text}</>;
  const pieces = text.split(pattern);
  return (
    <>
      {pieces.map((piece, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{piece}</Fragment>;
        const entry = glossary.find((g) => g.term.toLowerCase() === piece.toLowerCase());
        if (!entry) return <Fragment key={i}>{piece}</Fragment>;
        return (
          <Popover key={i}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="underline decoration-accent decoration-dotted underline-offset-2"
              >
                {piece}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm">
              <p className="font-semibold">{entry.term}</p>
              <p className="mt-1 text-muted-foreground">{entry.definition}</p>
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}
