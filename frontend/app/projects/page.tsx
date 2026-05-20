"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "../_components/app-shell";
import { ProjectCreateForm } from "../_components/project-create-form";
import { apiRequest } from "@/lib/api";
import { Project } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Project[]>("/projects")
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Nie udało się wczytać projektów"));
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <ProjectCreateForm onCreated={(project) => setProjects((current) => [project, ...current])} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.length ? (
            projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="card rounded-[2rem] p-6">
                <p className="text-sm uppercase tracking-[0.2em] text-muted">Projekt #{project.id}</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">{project.name}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {project.description || "Brak opisu projektu."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                  <span className="pill rounded-full px-3 py-1">
                    {project.access_role === "owner" ? "Właściciel" : "Współpraca"}
                  </span>
                  <span className="pill rounded-full px-3 py-1">{project.member_count} osób</span>
                </div>
                <p className="mt-4 text-sm text-muted">Właściciel: {project.owner_email}</p>
                <p className="mt-6 text-sm text-muted">
                  Utworzono {new Date(project.created_at).toLocaleString()}
                </p>
              </Link>
            ))
          ) : (
            <div className="card rounded-[2rem] p-6 text-sm text-muted">
              Nie znaleziono projektów. Zacznij od małego projektu demonstracyjnego i wrzuć parę FASTQ.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
