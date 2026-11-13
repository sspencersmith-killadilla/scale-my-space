import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlanGeneration } from "@/hooks/usePlanGeneration";
import type { DetailLevel } from "@/lib/plan-prompt";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCALE_PRESETS, THICKNESS_OPTIONS, MATERIAL_OPTIONS } from "@/lib/plan-model";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({
    meta: [
      { title: "New plan — upload photos — Shrinkify" },
      {
        name: "description",
        content: "Upload building photos and choose a scale to generate woodworking plans.",
      },
      { property: "og:title", content: "New plan — upload photos — Shrinkify" },
      {
        property: "og:description",
        content: "Upload building photos and choose a scale to generate woodworking plans.",
      },
    ],
  }),
  component: NewProject,
});

interface Pick {
  file: File;
  url: string;
  tag: string;
  note: string;
}

const VIEW_TAGS = [
  ["unsure", "View?"],
  ["front", "Front"],
  ["back", "Back"],
  ["left", "Left side"],
  ["right", "Right side"],
  ["corner", "Corner"],
  ["closeup", "Close-up"],
  ["above", "From above"],
] as const;

function NewProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generate, stage: aiStage } = usePlanGeneration();

  const [title, setTitle] = useState("");
  const [subjectNotes, setSubjectNotes] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [mode, setMode] = useState<"ratio" | "target">("ratio");
  const [denominator, setDenominator] = useState(12);
  const [targetHeight, setTargetHeight] = useState("18");
  const [thickness, setThickness] = useState(0.25);
  const [material, setMaterial] = useState<string>(MATERIAL_OPTIONS[0]);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 8 - picks.length)
      .map((file) => ({ file, url: URL.createObjectURL(file), tag: "unsure", note: "" }));
    setPicks((p) => [...p, ...next]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!picks.length) {
      toast.error("Add at least one photo.");
      return;
    }
    setBusy(true);
    try {
      setStage("Creating project…");
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: title.trim() || "Untitled subject",
          subject_notes: subjectNotes,
          reference_note: referenceNote,
          scale_mode: mode,
          scale_denominator: denominator,
          target_height_in: mode === "target" ? Number(targetHeight) || null : null,
          stock_thickness_in: thickness,
          material,
          status: "generating",
        })
        .select("id")
        .single();
      if (error || !project) throw new Error(error?.message ?? "Could not create project");

      setStage("Uploading photos…");
      for (let i = 0; i < picks.length; i++) {
        const pick = picks[i]!;
        const ext = pick.file.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${project.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("project-media")
          .upload(path, pick.file, { contentType: pick.file.type });
        if (upErr) throw new Error(upErr.message);

        const { error: rowErr } = await supabase.from("project_images").insert({
          project_id: project.id,
          user_id: user.id,
          storage_path: path,
          sort_order: i,
          view_tag: pick.tag,
          note: pick.note.trim(),
        });
        if (rowErr) throw new Error(rowErr.message);
      }

      setStage("Measuring the subject with AI…");
      await generate({ projectId: project.id, detailLevel });


      toast.success("Plan drafted.");
      navigate({ to: "/projects/$id", params: { id: project.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
      setBusy(false);
      setStage("");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="tech-label text-accent">New project</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Describe your subject</h1>

      <form className="mt-8 space-y-10" onSubmit={submit}>
        <section className="rounded-lg border-2 border-foreground bg-card p-6">
          <h2 className="tech-label text-blueprint">01 / Photos</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add up to 8 reference images — they are all read together. Straight-on shots of each face plus a
            corner view and a couple of detail close-ups give the best results. Tell us which side each photo
            shows and note any size you know — this is the single biggest boost to accuracy.
          </p>


          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {picks.map((p, i) => (
              <div key={p.url} className="space-y-1">
              <div className="relative aspect-square overflow-hidden rounded border border-border">
                <img src={p.url} alt={`Upload ${i + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setPicks((list) => list.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded bg-foreground/80 p-1 text-background"
                >
                  <X className="size-3" />
                </button>
              </div>
                <select
                  aria-label={`Which view is photo ${i + 1}?`}
                  value={p.tag}
                  onChange={(e) =>
                    setPicks((l) => l.map((x, idx) => (idx === i ? { ...x, tag: e.target.value } : x)))
                  }
                  className="w-full rounded border border-border bg-background px-1 py-1 text-xs"
                >
                  {VIEW_TAGS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <input
                  aria-label={`Note for photo ${i + 1}`}
                  placeholder="Note, e.g. door is 80in"
                  value={p.note}
                  maxLength={200}
                  onChange={(e) =>
                    setPicks((l) => l.map((x, idx) => (idx === i ? { ...x, note: e.target.value } : x)))
                  }
                  className="w-full rounded border border-border bg-background px-1 py-1 text-xs"
                />
              </div>
            ))}
            {picks.length < 8 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent">
                <ImagePlus className="size-5" />
                <span className="tech-label">add</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
            )}
          </div>

          <div className="mt-6 grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Project name</Label>
              <Input
                id="title"
                placeholder="Grandma's farmhouse"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">What is it? (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Two-storey clapboard farmhouse, gable roof, wraparound porch on the front."
                value={subjectNotes}
                onChange={(e) => setSubjectNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref">Known real dimension (optional but powerful)</Label>
              <Input
                id="ref"
                placeholder="The front door is 84 inches tall"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border-2 border-foreground bg-card p-6">
          <h2 className="tech-label text-blueprint">02 / Scale & material</h2>

          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant={mode === "ratio" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("ratio")}
            >
              Standard scale
            </Button>
            <Button
              type="button"
              variant={mode === "target" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("target")}
            >
              Target size
            </Button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {mode === "ratio" ? (
              <div className="space-y-1.5">
                <Label>Scale</Label>
                <Select
                  value={String(denominator)}
                  onValueChange={(v) => setDenominator(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCALE_PRESETS.map((s) => (
                      <SelectItem key={s.denominator} value={String(s.denominator)}>
                        {s.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="6">1:6 — large display</SelectItem>
                    <SelectItem value="87">1:87 — HO railway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="target">Finished height (inches)</Label>
                <Input
                  id="target"
                  type="number"
                  min={2}
                  step="0.5"
                  value={targetHeight}
                  onChange={(e) => setTargetHeight(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Stock thickness</Label>
              <Select value={String(thickness)} onValueChange={(v) => setThickness(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THICKNESS_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={String(t.value)}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Material</Label>
              <Select value={material} onValueChange={setMaterial}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Shape detail</Label>
              <Select value={detailLevel} onValueChange={(v) => setDetailLevel(v as DetailLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple — big shapes only, fastest to cut</SelectItem>
                  <SelectItem value="standard">
                    Standard — towers, arcades and caps modelled
                  </SelectItem>
                  <SelectItem value="museum">
                    Museum — every profile, dome and moulding chased
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Higher detail runs extra photo passes, so generating takes longer and the cut list
                grows.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            You can change any of this later — the plan recomputes instantly.
          </p>

        </section>

        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> {aiStage || stage}
            </>
          ) : (
            "Generate my plan"
          )}
        </Button>
      </form>
    </main>
  );
}
