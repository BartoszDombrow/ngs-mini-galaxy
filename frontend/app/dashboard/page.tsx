"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "../_components/app-shell";
import { apiRequest } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { Job, Project, ToolStatus, User } from "@/types";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [me, items, toolItems] = await Promise.all([
          apiRequest<User>("/me"),
          apiRequest<Project[]>("/projects"),
          apiRequest<ToolStatus[]>("/system/tools"),
        ]);
        if (!active) {
          return;
        }

        setUser(me);
        setProjects(items);
        setTools(toolItems);

        const jobLists = await Promise.all(
          items.slice(0, 5).map((project) => apiRequest<Job[]>(`/projects/${project.id}/jobs`)),
        );
        if (!active) {
          return;
        }

        setRecentJobs(
          jobLists
            .flat()
            .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
            .slice(0, 6),
        );
      } catch (err) {
        if (!active) {
          return;
        }
        clearToken();
        setError(err instanceof Error ? err.message : "Nie udało się wczytać dashboardu.");
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="card rounded-[2rem] p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Podsumowanie użytkownika</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Panel główny</h1>
          {user ? (
            <div className="mt-6 space-y-3 text-sm">
              <div className="pill rounded-2xl px-4 py-3">E-mail: {user.email}</div>
              <div className="pill rounded-2xl px-4 py-3">Projekty: {projects.length}</div>
              <div className="pill rounded-2xl px-4 py-3">Ostatnie zadania: {recentJobs.length}</div>
              <div className="pill rounded-2xl px-4 py-3">
                Utworzono: {new Date(user.created_at).toLocaleString()}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Zaloguj się, aby wczytać dane projektów.</p>
          )}
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        </section>
        <section className="card rounded-[2rem] p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted">Projekty</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Ostatnie przestrzenie robocze</h2>
            </div>
            <Link href="/projects" className="rounded-full bg-accent px-4 py-2 text-sm text-white">
              Zarządzaj projektami
            </Link>
          </div>
          <div className="mt-6 space-y-3">
            {projects.length ? (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="pill flex items-center justify-between rounded-2xl px-4 py-4 text-sm"
                >
                  <span>
                    {project.name}
                    <span className="ml-2 text-xs text-muted">
                      {project.access_role === "owner" ? "Twój projekt" : `Właściciel: ${project.owner_email}`}
                    </span>
                  </span>
                  <span className="text-muted">{new Date(project.created_at).toLocaleDateString()}</span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">Nie masz jeszcze projektów. Utwórz pierwszy w widoku projektów.</p>
            )}
          </div>
        </section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="card rounded-[2rem] p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted">Uruchomienia</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Ostatnie analizy</h2>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {recentJobs.length ? (
              recentJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="pill flex items-center justify-between rounded-2xl px-4 py-4 text-sm"
                >
                  <span>
                    {job.sample_name} · {job.selected_steps.map((step) => step.tool_name).join(", ")}
                  </span>
                  <span className={`status-${job.status}`}>{job.status}</span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">Nie uruchomiono jeszcze żadnych analiz.</p>
            )}
          </div>
        </section>
        <section className="card rounded-[2rem] p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted">Środowisko</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Zainstalowane narzędzia bioinformatyczne</h2>
            </div>
            <code className="text-sm text-muted">GET /system/tools</code>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {tools.map((tool) => (
              <div key={tool.name} className="pill rounded-2xl px-4 py-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{tool.name}</span>
                  <span className={tool.installed ? "status-completed" : "status-failed"}>
                    {tool.installed ? "zainstalowane" : "brak"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {tool.version || tool.notes || "Brak informacji o wersji"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
