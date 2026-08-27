import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Hammer, BookOpen, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Walkthrough, useWalkthrough } from "@/components/Walkthrough";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "My plan projects — Minim" },
      { name: "description", content: "Your saved photo-to-miniature woodworking plan projects." },
      { property: "og:title", content: "My plan projects — Minim" },
      {
        property: "og:description",
        content: "Your saved photo-to-miniature woodworking plan projects.",
      },
    ],
  }),
  component: ProjectsList,
});

function ProjectsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, status, scale_denominator, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tech-label text-accent">Workbench</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Your projects</h1>
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus className="mr-2 size-4" /> New plan
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-10 tech-label text-muted-foreground">Loading…</p>
      ) : !data?.length ? (
        <div className="grid-paper mt-10 rounded-lg border-2 border-dashed border-border p-14 text-center">
          <Hammer className="mx-auto size-6 text-accent" />
          <h2 className="mt-4 text-xl font-bold">No plans yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Upload photos of a building, choose a scale, and Minim will draft the cut list and
            drawings for you.
          </p>
          <Button asChild className="mt-6">
            <Link to="/projects/new">Start your first plan</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <li key={p.id}>
              <Link
                to="/projects/$id"
                params={{ id: p.id }}
                className="block h-full rounded-lg border-2 border-foreground bg-card p-5 transition-shadow hover:shadow-[6px_6px_0_0_var(--kraft)]"
              >
                <div className="flex items-center justify-between">
                  <span className="tech-label text-blueprint">
                    1:{p.scale_denominator ?? 12}
                  </span>
                  <span className="tech-label text-muted-foreground">{p.status}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">{p.title}</h3>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
