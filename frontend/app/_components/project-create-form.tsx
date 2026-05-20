"use client";

import { FormEvent, useState } from "react";

import { apiRequest } from "@/lib/api";
import { Project } from "@/types";

type ProjectCreateFormProps = {
  onCreated: (project: Project) => void;
};

export function ProjectCreateForm({ onCreated }: ProjectCreateFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const project = await apiRequest<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      onCreated(project);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć projektu");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card rounded-[2rem] p-6">
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Nazwa projektu</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="RNA-seq pilot 01"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Opis</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Zestaw demonstracyjny paired-end"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-2xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Tworzenie..." : "Utwórz projekt"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </form>
  );
}
