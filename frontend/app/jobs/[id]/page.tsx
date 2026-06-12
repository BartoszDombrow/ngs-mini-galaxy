"use client";

import { useParams } from "next/navigation";
import { type FormEvent } from "react";
import { useEffect, useState, useRef } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { API_URL, apiRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Job, JobComment, JobFile, JobLogs, JobStep } from "@/types";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);
  const [job, setJob] = useState<Job | null>(null);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [logs, setLogs] = useState<JobLogs | null>(null);
  const [files, setFiles] = useState<JobFile[]>([]);
  const [comments, setComments] = useState<JobComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewModalRef = useRef<HTMLDialogElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");

  async function openJobFile(file: JobFile, action: "download" | "open" | "preview" = "open") {
    const token = getToken();
    if (!token) {
      setError("Brak tokenu uwierzytelniającego.");
      return;
    }

    const url = new URL(`${API_URL}/jobs/${jobId}/file`);
    url.searchParams.set("path", file.path);
    if (action === "download") {
      url.searchParams.set("download", "true");
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setError(`Nie udało się otworzyć pliku: ${file.name}`);
      return;
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    if (action === "download") {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } else if (action === "preview") {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(objectUrl);
      setPreviewName(file.name);
      previewModalRef.current?.showModal();
    } else {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    }
  }

  function closePreview() {
    previewModalRef.current?.close();
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const dialog = e.currentTarget;
    if (e.target === dialog) {
      closePreview();
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = commentText.trim();
    if (!content) {
      setCommentError("Wpisz treść komentarza.");
      return;
    }

    setIsPostingComment(true);
    setCommentError(null);
    try {
      const comment = await apiRequest<JobComment>(`/jobs/${jobId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setComments((current) => [...current, comment]);
      setCommentText("");
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Nie udało się dodać komentarza.");
    } finally {
      setIsPostingComment(false);
    }
  }

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let active = true;

    async function load() {
      try {
        const [jobData, stepData, logData, fileData, commentData] = await Promise.all([
          apiRequest<Job>(`/jobs/${jobId}`),
          apiRequest<JobStep[]>(`/jobs/${jobId}/steps`),
          apiRequest<JobLogs>(`/jobs/${jobId}/logs`),
          apiRequest<JobFile[]>(`/jobs/${jobId}/files`),
          apiRequest<JobComment[]>(`/jobs/${jobId}/comments`),
        ]);
        if (!active) {
          return;
        }
        setJob(jobData);
        setSteps(stepData);
        setLogs(logData);
        setFiles(fileData);
        setComments(commentData);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : "Nie udało się wczytać szczegółów zadania.");
      }
    }

    void load();
    const timer =
      job?.status === "completed" || job?.status === "failed"
        ? null
        : setInterval(() => {
            void load();
          }, 2000);

    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [jobId, job?.status]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="card rounded-[2rem] p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-muted">Monitor zadania</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {job ? job.sample_name : `Zadanie #${jobId}`}
          </h1>
          {job ? (
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className={`pill rounded-2xl px-4 py-3 text-sm status-${job.status}`}>{job.status}</div>
              <div className="pill rounded-2xl px-4 py-3 text-sm">Projekt #{job.project_id}</div>
              <div className="pill rounded-2xl px-4 py-3 text-sm">
                Kroki: {job.selected_steps.length}
              </div>
              <div className="pill rounded-2xl px-4 py-3 text-sm">
                Utworzono: {new Date(job.created_at).toLocaleTimeString()}
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        </section>
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="card rounded-[2rem] p-6">
            <h2 className="text-lg font-semibold">Kroki pipeline&apos;u</h2>
            <div className="mt-4 space-y-3">
              {steps.length ? (
                steps.map((step) => (
                  <details
                    key={step.id}
                    open={step.status === "running" || step.status === "failed"}
                    className="pill rounded-2xl px-4 py-4 text-sm"
                  >
                    <summary className="cursor-pointer select-none">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {step.step_name} · {step.tool_name}
                        </span>
                        <span className={`status-${step.status}`}>{step.status}</span>
                      </div>
                    </summary>
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-xs text-muted">
                        Pliki:{" "}
                        {step.input_files.length
                          ? step.input_files.map((file) => file.original_name).join(", ")
                          : "Brak plików wejściowych"}
                      </p>
                      {step.tool_options.length ? (
                        <p className="mt-2 text-xs text-muted">
                          Opcje:{" "}
                          {step.tool_options
                            .map((option) => (option.value ? `${option.key}=${option.value}` : option.key))
                            .join(", ")}
                        </p>
                      ) : null}
                      <code className="mt-2 block overflow-x-auto text-xs text-muted">{step.command}</code>
                    </div>
                  </details>
                ))
              ) : (
                <p className="text-sm text-muted">Kroki pojawią się tutaj po uruchomieniu zadania.</p>
              )}
            </div>
          </div>
          <div className="space-y-6">
            <div className="card rounded-[2rem] p-6">
              <h2 className="text-lg font-semibold">Logi</h2>
              <div className="mt-4 space-y-4">
                {logs
                  ? Object.entries(logs.logs).map(([stepName, content]) => (
                      <div key={stepName} className="rounded-2xl border border-line bg-[#172118] p-4 text-xs text-[#d9f0d4]">
                        <p className="mb-2 font-semibold text-white">{stepName}</p>
                        <div className="max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words">{content.stdout || "Brak danych stdout."}</pre>
                          {content.stderr ? (
                            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words border-t border-white/10 pt-3 text-[#ffcbcb]">
                              {content.stderr}
                            </pre>
                          ) : null}
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            </div>
            <div className="card rounded-[2rem] p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Komentarze</h2>
                  <p className="mt-1 text-sm text-muted">
                    Widoczne dla osób mających dostęp do projektu.
                  </p>
                </div>
                <span className="w-fit rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
                  {comments.length} wpisów
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {comments.length ? (
                  comments.map((comment) => (
                    <article key={comment.id} className="pill rounded-2xl px-4 py-3 text-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium text-foreground">{comment.author_email}</span>
                        <time className="text-xs text-muted" dateTime={comment.created_at}>
                          {new Date(comment.created_at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-muted">{comment.content}</p>
                    </article>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
                    Brak komentarzy dla tej analizy.
                  </p>
                )}
              </div>
              <form className="mt-4" onSubmit={(event) => void submitComment(event)}>
                <label className="block">
                  <span className="mb-2 block text-sm text-muted">Dodaj komentarz</span>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm outline-none focus:border-accent"
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Np. interpretacja wyniku, uwagi do parametrów albo dalsze kroki."
                    maxLength={2000}
                  />
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-5 text-sm">
                    {commentError ? <span className="text-danger">{commentError}</span> : null}
                  </div>
                  <button
                    type="submit"
                    disabled={isPostingComment || !commentText.trim()}
                    className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {isPostingComment ? "Dodawanie..." : "Dodaj komentarz"}
                  </button>
                </div>
              </form>
            </div>
            <div className="card rounded-[2rem] p-6">
              <h2 className="text-lg font-semibold">Wygenerowane pliki</h2>
              <div className="mt-4 space-y-3">
                {files.length ? (
                  files.map((file) => (
                    <div
                      key={`${file.kind}-${file.path}`}
                      className="pill flex flex-col gap-3 rounded-2xl px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 break-words">
                        {file.name} · {file.kind}
                      </span>
                      <span className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-accent px-3 py-1 text-xs text-white"
                          onClick={() => void openJobFile(file, "preview")}
                        >
                          Podgląd
                        </button>
                        <button
                          type="button"
                          className="pill rounded-full px-3 py-1 text-xs"
                          onClick={() => void openJobFile(file, "open")}
                        >
                          Karta
                        </button>
                        <button
                          type="button"
                          className="pill rounded-full px-3 py-1 text-xs"
                          onClick={() => void openJobFile(file, "download")}
                        >
                          Pobierz
                        </button>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">Pliki pojawią się tutaj w miarę postępu analizy.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Preview Modal */}
      <dialog
        ref={previewModalRef}
        onClick={handleDialogClick}
        className="h-[95vh] max-h-[1200px] w-[95vw] max-w-6xl rounded-[2rem] border border-line/50 bg-card p-0 shadow-[0_0_50px_rgba(0,0,0,0.35)]"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line/40 p-4">
            <h2 className="min-w-0 truncate text-lg font-bold">{previewName}</h2>
            <button
              type="button"
              onClick={closePreview}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-line/50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="relative min-h-0 w-full flex-1 bg-white">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="absolute inset-0 h-full w-full border-none"
                title="Preview"
              />
            ) : null}
          </div>
        </div>
      </dialog>
    </AppShell>
  );
}
