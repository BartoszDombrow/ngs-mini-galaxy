"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/app/_components/app-shell";
import { API_URL, apiRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Job, JobFile, JobLogs, JobStep } from "@/types";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);
  const [job, setJob] = useState<Job | null>(null);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [logs, setLogs] = useState<JobLogs | null>(null);
  const [files, setFiles] = useState<JobFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function openJobFile(file: JobFile, download = false) {
    const token = getToken();
    if (!token) {
      setError("Brak tokenu uwierzytelniającego.");
      return;
    }

    const url = new URL(`${API_URL}/jobs/${jobId}/file`);
    url.searchParams.set("path", file.path);
    if (download) {
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
    if (download) {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.click();
    } else {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
  }

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let active = true;

    async function load() {
      try {
        const [jobData, stepData, logData, fileData] = await Promise.all([
          apiRequest<Job>(`/jobs/${jobId}`),
          apiRequest<JobStep[]>(`/jobs/${jobId}/steps`),
          apiRequest<JobLogs>(`/jobs/${jobId}/logs`),
          apiRequest<JobFile[]>(`/jobs/${jobId}/files`),
        ]);
        if (!active) {
          return;
        }
        setJob(jobData);
        setSteps(stepData);
        setLogs(logData);
        setFiles(fileData);
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
                        <pre className="overflow-x-auto whitespace-pre-wrap">{content.stdout || "Brak danych stdout."}</pre>
                        {content.stderr ? (
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border-t border-white/10 pt-3 text-[#ffcbcb]">
                            {content.stderr}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  : null}
              </div>
            </div>
            <div className="card rounded-[2rem] p-6">
              <h2 className="text-lg font-semibold">Wygenerowane pliki</h2>
              <div className="mt-4 space-y-3">
                {files.length ? (
                  files.map((file) => (
                    <div
                      key={`${file.kind}-${file.path}`}
                      className="pill flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm"
                    >
                      <span>
                        {file.name} · {file.kind}
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-accent px-3 py-1 text-xs text-white"
                          onClick={() => void openJobFile(file, false)}
                        >
                          Otwórz
                        </button>
                        <button
                          type="button"
                          className="pill rounded-full px-3 py-1 text-xs"
                          onClick={() => void openJobFile(file, true)}
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
    </AppShell>
  );
}
