"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { JobCreateForm } from "@/app/_components/job-create-form";
import { ProjectCollaboratorsCard } from "@/app/_components/project-collaborators-card";
import { ProjectUploadForm } from "@/app/_components/project-upload-form";
import { apiRequest } from "@/lib/api";
import { Job, ProjectDetail, ProjectMember, UploadFileItem } from "@/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [latestJob, setLatestJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    Promise.all([
      apiRequest<ProjectDetail>(`/projects/${projectId}`),
      apiRequest<Job[]>(`/projects/${projectId}/jobs`),
    ])
      .then(([projectData, jobsData]) => {
        setProject(projectData);
        setJobs(jobsData);
        setLatestJob(jobsData[0] ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Nie udało się wczytać projektu."));
  }, [projectId]);

  function onUploaded(uploaded: UploadFileItem[]) {
    setProject((current) =>
      current ? { ...current, uploads: [...uploaded, ...current.uploads] } : current,
    );
  }

  function onJobCreated(job: Job) {
    setLatestJob(job);
    setJobs((current) => [job, ...current]);
  }

  function onMembersChange(members: ProjectMember[]) {
    setProject((current) => (current ? { ...current, members, member_count: members.length } : current));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="card rounded-[2rem] p-8">
            <p className="text-sm uppercase tracking-[0.24em] text-muted">Szczegóły projektu</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {project?.name ?? `Projekt #${projectId}`}
            </h1>
            {project ? (
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <div className="pill rounded-2xl px-4 py-3">Właściciel: {project.owner_email}</div>
                <div className="pill rounded-2xl px-4 py-3">
                  Twoja rola: {project.access_role === "owner" ? "właściciel" : "współpracownik"}
                </div>
                <div className="pill rounded-2xl px-4 py-3">Dostęp: {project.member_count} osób</div>
              </div>
            ) : null}
            <p className="mt-4 text-sm leading-7 text-muted">
              {project?.description || "Dodaj pliki wejściowe i uruchamiaj analizy w obrębie tego projektu."}
            </p>
            {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
          </div>
          <div className="space-y-6">
            <div className="card rounded-[2rem] p-6">
              <h2 className="text-lg font-semibold">Ostatnie zadanie</h2>
              {latestJob ? (
                <div className="mt-4 space-y-3 text-sm">
                  <div className={`pill rounded-2xl px-4 py-3 status-${latestJob.status}`}>
                    Status: {latestJob.status}
                  </div>
                  <div className="pill rounded-2xl px-4 py-3">Analiza: {latestJob.sample_name}</div>
                  <div className="pill rounded-2xl px-4 py-3">
                    Kroki: {latestJob.selected_steps.map((step) => step.tool_name).join(", ")}
                  </div>
                  <Link
                    href={`/jobs/${latestJob.id}`}
                    className="inline-flex rounded-full bg-accent px-4 py-2 text-white"
                  >
                    Otwórz widok zadania
                  </Link>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  W tym projekcie nie uruchomiono jeszcze żadnego zadania.
                </p>
              )}
            </div>
            <div className="card rounded-[2rem] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Historia analiz</h2>
                <span className="text-sm text-muted">{jobs.length} zadań</span>
              </div>
              <div className="mt-4 space-y-3">
                {jobs.length ? (
                  jobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="pill flex items-center justify-between rounded-2xl px-4 py-4 text-sm"
                    >
                      <span>{job.sample_name}</span>
                      <span className={`status-${job.status}`}>{job.status}</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted">W tym projekcie nie ma jeszcze żadnych zadań.</p>
                )}
              </div>
            </div>
            {project ? (
              <ProjectCollaboratorsCard
                projectId={projectId}
                members={project.members}
                canManageMembers={project.can_manage_members}
                onMembersChange={onMembersChange}
              />
            ) : null}
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <ProjectUploadForm projectId={projectId} onUploaded={onUploaded} />
            <div className="card rounded-[2rem] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Dodane pliki</h2>
                <span className="text-sm text-muted">{project?.uploads.length ?? 0} plików</span>
              </div>
              <div className="mt-4 space-y-3">
                {project?.uploads.length ? (
                  project.uploads.map((file) => (
                    <div key={file.id} className="pill rounded-2xl px-4 py-3 text-sm">
                      {file.original_name} · {file.file_type}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">Nie dodano jeszcze żadnych plików FASTQ.</p>
                )}
              </div>
            </div>
          </div>
          <section className="space-y-6">
            <JobCreateForm projectId={projectId} uploads={project?.uploads ?? []} onCreated={onJobCreated} />
          </section>
        </section>
      </div>
    </AppShell>
  );
}
