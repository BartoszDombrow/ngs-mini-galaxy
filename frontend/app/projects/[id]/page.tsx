"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { JobCreateForm } from "@/app/_components/job-create-form";
import { ProjectCollaboratorsCard } from "@/app/_components/project-collaborators-card";
import { ProjectUploadForm } from "@/app/_components/project-upload-form";
import { apiRequest } from "@/lib/api";
import { Job, ProjectDetail, ProjectMember, UploadFileItem } from "@/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(params.id);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [latestJob, setLatestJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const jobModalRef = useRef<HTMLDialogElement>(null);
  const filesModalRef = useRef<HTMLDialogElement>(null);

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

  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const dialog = e.currentTarget;
    if (e.target === dialog) {
      dialog.close();
    }
  }

  async function deleteProject() {
    if (!confirm("Czy na pewno chcesz usunąć cały projekt wraz ze wszystkimi plikami i analizami? Tego działania nie można cofnąć!")) return;
    try {
      await apiRequest(`/projects/${projectId}`, { method: "DELETE" });
      router.push("/");
    } catch {
      alert("Błąd podczas usuwania projektu.");
    }
  }

  async function deleteJob(e: React.MouseEvent, jobId: number) {
    e.preventDefault();
    if (!confirm("Czy na pewno chcesz usunąć tę analizę i jej wyniki?")) return;
    try {
      await apiRequest(`/jobs/${jobId}`, { method: "DELETE" });
      setJobs((current) => current.filter((j) => j.id !== jobId));
      if (latestJob?.id === jobId) setLatestJob(null);
    } catch {
      alert("Błąd podczas usuwania analizy.");
    }
  }

  async function deleteUpload(fileId: number) {
    if (!confirm("Czy na pewno chcesz usunąć ten plik z serwera?")) return;
    try {
      await apiRequest(`/projects/${projectId}/uploads/${fileId}`, { method: "DELETE" });
      setProject((current) =>
        current
          ? { ...current, uploads: current.uploads.filter((u) => u.id !== fileId) }
          : current
      );
    } catch {
      alert("Błąd podczas usuwania pliku.");
    }
  }

  return (
    <AppShell>
      <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
        {/* Header Section */}
        <section className="card relative overflow-hidden rounded-[2rem] p-8 transition-all duration-500 border-t-4 border-t-accent">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>

          <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent/80">Obszar roboczy</p>
              <h1 className="mt-3 break-words text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-muted bg-clip-text text-transparent">
                {project?.name ?? `Projekt #${projectId}`}
              </h1>

              <p className="mt-4 text-base leading-relaxed text-muted/90 max-w-2xl">
                {project?.description || "Zarządzaj plikami sekwencjonowania i uruchamiaj bioinformatyczne pipeline'y analityczne w mgnieniu oka."}
              </p>

              {project ? (
                <div className="mt-6 flex flex-wrap gap-3 text-sm">
                  <div className="pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 shadow-sm">
                    <span className="text-muted/70 text-xs">Właściciel:</span> <span className="font-medium">{project.owner_email}</span>
                  </div>
                  <div className="pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 shadow-sm">
                    <span className="text-muted/70 text-xs">Twoja rola:</span> <span className="font-medium text-accent">{project.access_role === "owner" ? "właściciel" : "współpracownik"}</span>
                  </div>
                </div>
              ) : null}
              {error ? <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}
              {project?.access_role === "owner" && (
                <button
                  onClick={deleteProject}
                  className="mt-4 text-xs font-medium text-danger hover:underline inline-flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  Usuń projekt
                </button>
              )}
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 md:w-[220px]">
              <button
                onClick={() => jobModalRef.current?.showModal()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-strong px-6 py-3.5 text-sm font-bold text-background shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Nowa analiza
              </button>
              <button
                onClick={() => filesModalRef.current?.showModal()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-6 py-3.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-300 hover:bg-line/50 hover:border-line/80 active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                Zarządzaj plikami ({project?.uploads.length ?? 0})
              </button>
            </div>
          </div>
        </section>

        {/* Main Content: Jobs and Collaborators */}
        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            {/* Latest Job Highlight */}
            {latestJob ? (
              <div className="card relative overflow-hidden rounded-[2rem] p-6 transition-all duration-300">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent/50" />
                <h2 className="text-xl font-bold text-foreground">Ostatnio uruchomione</h2>
                <div className="mt-5 flex flex-col items-start gap-4 text-sm">
                  <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
                    <span className="min-w-0 break-words text-lg font-semibold">{latestJob.sample_name}</span>
                    <div className={`pill flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider status-${latestJob.status}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                      {latestJob.status}
                    </div>
                  </div>
                  <div className="pill flex w-full min-w-0 flex-col gap-1 rounded-2xl border-line/40 px-4 py-3 shadow-sm">
                    <span className="text-muted/70 text-[10px] uppercase tracking-wider font-bold">Kroki pipeline&apos;u:</span>
                    <span className="break-words font-mono text-xs text-foreground/90">{latestJob.selected_steps.map((step) => step.tool_name).join(" -> ")}</span>
                  </div>
                  <Link
                    href={`/jobs/${latestJob.id}`}
                    className="mt-2 text-accent font-semibold text-sm hover:underline flex items-center gap-1"
                  >
                    Przejdź do wyników zadania <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Jobs History Card */}
            <div className="card rounded-[2rem] p-6 transition-all duration-300">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold text-foreground">Historia wszystkich analiz</h2>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">{jobs.length} zadań</span>
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {jobs.length ? (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      className="pill group flex items-center gap-3 rounded-2xl px-5 py-4 text-sm transition-all duration-300 hover:-translate-y-1 hover:border-line hover:bg-background hover:shadow-lg"
                    >
                      <Link href={`/jobs/${job.id}`} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="min-w-0 break-words font-semibold text-foreground transition-colors group-hover:text-accent">{job.sample_name}</span>
                        <span className={`status-${job.status} flex w-fit items-center gap-1.5 rounded-full border border-line/50 bg-background px-3 py-1 text-xs font-bold uppercase tracking-wider shadow-sm`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {job.status}
                          </span>
                      </Link>
                      <button
                        onClick={(e) => deleteJob(e, job.id)}
                        className="shrink-0 rounded-full p-2 text-muted opacity-100 transition-colors hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                        title="Usuń analizę"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line/40 bg-background p-12 text-center">
                    <div className="mb-4 rounded-full bg-accent/10 p-4 text-accent">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    </div>
                    <p className="text-base font-semibold text-foreground">Brak uruchomionych analiz</p>
                    <p className="text-sm text-muted mt-2 max-w-sm">Rozpocznij pracę klikając przycisk &quot;Nowa analiza&quot; na górze strony.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
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
      </div>

      {/* MODALS */}

      {/* Job Create Modal */}
      <dialog
        ref={jobModalRef}
        onClick={handleDialogClick}
        className="max-h-[92vh] w-[95vw] max-w-4xl rounded-[2rem] border border-line/50 bg-card p-0 shadow-[0_0_50px_rgba(0,0,0,0.35)]"
      >
        <div className="min-h-0 overflow-hidden p-4 sm:p-8">
          <JobCreateForm
            projectId={projectId}
            uploads={project?.uploads ?? []}
            onCreated={(job) => {
              onJobCreated(job);
              jobModalRef.current?.close();
            }}
            onCancel={() => jobModalRef.current?.close()}
          />
        </div>
      </dialog>

      {/* Files Management Modal */}
      <dialog
        ref={filesModalRef}
        onClick={handleDialogClick}
        className="max-h-[92vh] w-[95vw] max-w-2xl rounded-[2rem] border border-line/50 bg-card p-0 shadow-[0_0_50px_rgba(0,0,0,0.35)]"
      >
        <div className="flex max-h-[92vh] min-h-0 flex-col p-4 sm:p-8">
          <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
            <h2 className="min-w-0 break-words text-2xl font-bold bg-gradient-to-br from-foreground to-muted bg-clip-text text-transparent">Zarządzanie plikami</h2>
            <button
              type="button"
              onClick={() => filesModalRef.current?.close()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-line/50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div className="min-h-0 space-y-6 overflow-y-auto pr-1 custom-scrollbar">
            <div className="rounded-[1.5rem] border border-line/60 bg-background p-4 sm:p-5">
              <ProjectUploadForm projectId={projectId} onUploaded={onUploaded} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Pliki w projekcie</h3>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">{project?.uploads.length ?? 0} plików</span>
              </div>
              <div className="space-y-2">
                {project?.uploads.length ? (
                  project.uploads.map((file) => (
                    <div key={file.id} className="pill flex items-center gap-3 rounded-2xl border border-line/50 px-4 py-3 text-sm transition-all hover:bg-background sm:px-5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold text-foreground">{file.original_name}</span>
                        <span className="text-[10px] text-muted uppercase tracking-wider">{file.file_type}</span>
                      </div>
                      <div className="ml-auto flex items-center">
                        <button
                          type="button"
                          onClick={() => deleteUpload(file.id)}
                          className="p-2 text-muted hover:text-danger transition-colors rounded-full hover:bg-line/50"
                          title="Usuń plik"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line/40 bg-background p-8 text-center">
                    <p className="text-sm font-medium text-muted">Nie wgrano jeszcze żadnych plików sekwencjonowania.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </AppShell>
  );
}
