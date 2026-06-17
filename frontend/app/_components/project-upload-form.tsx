"use client";

import { FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";

import { apiRequest } from "@/lib/api";
import { ImportJob, UploadFileItem, UploadSession } from "@/types";

const CHUNK_SIZE = 8 * 1024 * 1024;

type ProjectUploadFormProps = {
  projectId: number;
  onUploaded: (files: UploadFileItem[]) => void;
};

type GenomeSearchResult = {
  id: string;
  accession: string;
  title: string;
  organism: string;
  source: string;
  length: number | null;
};

type LocalUploadSnapshot = {
  fingerprint: string;
  sessionId: number | null;
  originalName: string;
  sizeBytes: number;
  lastModified: number;
  uploadedBytes: number;
  status: "pending" | "uploading" | "completed";
};

type UploadSessionSnapshot = {
  mode: "local" | "sra" | "genomes";
  toolName: "fastq-dump" | "fasterq-dump";
  accessions: string;
  activityLog: string[];
  startedAt: number | null;
  selectedFileNames: string[];
  pendingLocalUploads: LocalUploadSnapshot[];
  activeImportJobId: number | null;
};

function buildFingerprint(file: { name: string; size: number; lastModified: number }) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ProjectUploadForm({ projectId, onUploaded }: ProjectUploadFormProps) {
  const [mode, setMode] = useState<"local" | "sra" | "genomes">("local");
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [toolName, setToolName] = useState<"fastq-dump" | "fasterq-dump">("fasterq-dump");
  const [accessions, setAccessions] = useState("");
  const [genomeSource, setGenomeSource] = useState<"ncbi" | "ensembl">("ncbi");
  const [genomeQuery, setGenomeQuery] = useState("");
  const [genomeResults, setGenomeResults] = useState<GenomeSearchResult[]>([]);
  const [isSearchingGenomes, setIsSearchingGenomes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [inputResetKey, setInputResetKey] = useState(0);
  const [pendingLocalUploads, setPendingLocalUploads] = useState<LocalUploadSnapshot[]>([]);
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);
  const [activeImportJob, setActiveImportJob] = useState<ImportJob | null>(null);
  const appliedImportJobsRef = useRef<Set<number>>(new Set());

  const storageKey = `project-upload-session:${projectId}`;
  const isImportRunning = activeImportJob ? ["queued", "running"].includes(activeImportJob.status) : false;
  const isSubmitting = isUploadingLocal || isImportRunning;

  const loadExistingImportJob = useEffectEvent(async () => {
    try {
      const jobs = await apiRequest<ImportJob[]>(`/projects/${projectId}/import-jobs`);
      const current = jobs.find((job) => ["queued", "running"].includes(job.status)) ?? null;
      setActiveImportJob(current);
    } catch {
      // Ignore background status bootstrap failures in the form itself.
    }
  });

  const loadImportJob = useEffectEvent(async (importJobId: number) => {
    const job = await apiRequest<ImportJob>(`/projects/import-jobs/${importJobId}`);
    setActiveImportJob(job);

    if (job.status === "completed" && !appliedImportJobsRef.current.has(job.id)) {
      appliedImportJobsRef.current.add(job.id);
      if (job.imported_files.length) {
        onUploaded(job.imported_files);
      }
      appendLog(`Import w tle zakończony. Dodano ${job.imported_files.length} plik(ów).`);
      endActivity();
    }

    if (job.status === "failed") {
      setError(job.error_message || "Import SRA nie powiódł się.");
      endActivity();
    }
  });

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey);
    if (!saved) {
      void loadExistingImportJob();
      return;
    }

    try {
      const snapshot = JSON.parse(saved) as UploadSessionSnapshot;
      setMode(snapshot.mode);
      setToolName(snapshot.toolName);
      setAccessions(snapshot.accessions);
      setActivityLog(snapshot.activityLog);
      setStartedAt(snapshot.startedAt);
      setSelectedFileNames(snapshot.selectedFileNames);
      setPendingLocalUploads(snapshot.pendingLocalUploads);

      if (snapshot.pendingLocalUploads.some((item) => item.status !== "completed")) {
        setError("Wznawianie lokalnego uploadu wymaga ponownego wskazania tych samych plików.");
      }

      if (snapshot.activeImportJobId) {
        void loadImportJob(snapshot.activeImportJobId);
      } else {
        void loadExistingImportJob();
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
      void loadExistingImportJob();
    }
  }, [storageKey]);

  useEffect(() => {
    if (!startedAt || !isSubmitting) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [startedAt, isSubmitting]);

  useEffect(() => {
    const snapshot: UploadSessionSnapshot = {
      mode,
      toolName,
      accessions,
      activityLog,
      startedAt,
      selectedFileNames,
      pendingLocalUploads,
      activeImportJobId: activeImportJob?.id ?? null,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, [accessions, activeImportJob?.id, activityLog, mode, pendingLocalUploads, selectedFileNames, startedAt, storageKey, toolName]);

  useEffect(() => {
    if (!isUploadingLocal) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isUploadingLocal]);

  useEffect(() => {
    if (!activeImportJob || !["queued", "running"].includes(activeImportJob.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadImportJob(activeImportJob.id);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeImportJob]);

  function appendLog(message: string) {
    setActivityLog((current) => [...current, message]);
  }

  function beginActivity(messages: string[]) {
    setActivityLog(messages);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
  }

  function endActivity() {
    setStartedAt(null);
  }

  function resetLocalSelection() {
    setFiles([]);
    setSelectedFileNames([]);
    setInputResetKey((current) => current + 1);
  }

  function updatePendingSnapshot(snapshot: LocalUploadSnapshot) {
    setPendingLocalUploads((current) => {
      const next = current.filter((item) => item.fingerprint !== snapshot.fingerprint);
      next.push(snapshot);
      return next.sort((left, right) => left.originalName.localeCompare(right.originalName));
    });
  }

  function clearCompletedSnapshots() {
    setPendingLocalUploads((current) => current.filter((item) => item.status !== "completed"));
  }

  async function ensureUploadSession(file: File, existingSnapshot?: LocalUploadSnapshot) {
    if (existingSnapshot?.sessionId) {
      try {
        return await apiRequest<UploadSession>(`/projects/upload-sessions/${existingSnapshot.sessionId}`);
      } catch {
        // Fall through and create a new session when the old one is missing.
      }
    }

    return apiRequest<UploadSession>(`/projects/${projectId}/upload-sessions`, {
      method: "POST",
      body: JSON.stringify({ original_name: file.name, size_bytes: file.size }),
    });
  }

  async function uploadSingleFile(file: File) {
    const fingerprint = buildFingerprint(file);
    const existingSnapshot = pendingLocalUploads.find((item) => item.fingerprint === fingerprint);
    let session = await ensureUploadSession(file, existingSnapshot);

    if (session.status === "completed" && session.uploaded_file) {
      updatePendingSnapshot({
        fingerprint,
        sessionId: session.id,
        originalName: file.name,
        sizeBytes: file.size,
        lastModified: file.lastModified,
        uploadedBytes: file.size,
        status: "completed",
      });
      return session.uploaded_file;
    }

    let uploadedBytes = session.uploaded_bytes;
    updatePendingSnapshot({
      fingerprint,
      sessionId: session.id,
      originalName: file.name,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      uploadedBytes,
      status: "uploading",
    });

    while (uploadedBytes < file.size) {
      const chunk = file.slice(uploadedBytes, uploadedBytes + CHUNK_SIZE);
      session = await apiRequest<UploadSession>(`/projects/upload-sessions/${session.id}/chunk?offset=${uploadedBytes}`, {
        method: "PUT",
        body: chunk,
        headers: { "Content-Type": "application/octet-stream" },
      });
      uploadedBytes = session.uploaded_bytes;
      updatePendingSnapshot({
        fingerprint,
        sessionId: session.id,
        originalName: file.name,
        sizeBytes: file.size,
        lastModified: file.lastModified,
        uploadedBytes,
        status: "uploading",
      });
    }

    const uploaded = await apiRequest<UploadFileItem>(`/projects/upload-sessions/${session.id}/complete`, {
      method: "POST",
    });
    updatePendingSnapshot({
      fingerprint,
      sessionId: session.id,
      originalName: file.name,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      uploadedBytes: file.size,
      status: "completed",
    });
    return uploaded;
  }

  async function onLocalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length) {
      setError("Wybierz co najmniej jeden plik.");
      return;
    }

    const selectedFingerprints = new Set(files.map((file) => buildFingerprint(file)));
    const resumableFingerprints = pendingLocalUploads
      .filter((item) => item.status !== "completed")
      .map((item) => item.fingerprint);
    const missingPending = resumableFingerprints.filter((fingerprint) => !selectedFingerprints.has(fingerprint));
    if (missingPending.length) {
      setError("Aby wznowić przerwany upload, wybierz ponownie te same pliki.");
      return;
    }

    setIsUploadingLocal(true);
    setError(null);
    beginActivity([
      "Przygotowuję sesje uploadu chunków.",
      `Wybrano ${files.length} plik(ów).`,
      "Transfer mogę wznowić po ponownym wybraniu tych samych plików.",
    ]);

    try {
      const uploadedFiles: UploadFileItem[] = [];
      for (const file of files) {
        appendLog(`Wysyłam ${file.name} (${formatBytes(file.size)}).`);
        const uploaded = await uploadSingleFile(file);
        uploadedFiles.push(uploaded);
        appendLog(`Zakończono ${file.name}.`);
      }

      onUploaded(uploadedFiles);
      appendLog(`Upload zakończony. Dodano ${uploadedFiles.length} plik(ów) do projektu.`);
      clearCompletedSnapshots();
      resetLocalSelection();
    } catch (err) {
      appendLog("Upload nie powiódł się.");
      setError(err instanceof Error ? err.message : "Upload nie powiódł się");
    } finally {
      setIsUploadingLocal(false);
      endActivity();
    }
  }

  async function onSraSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessionList = accessions
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!accessionList.length) {
      setError("Podaj co najmniej jeden accession.");
      return;
    }

    setError(null);
    beginActivity([
      `Tworzę backendowe zadanie importu przez ${toolName}.`,
      `Accessiony: ${accessionList.join(", ")}`,
      "Import będzie działał dalej po odświeżeniu strony.",
    ]);

    try {
      const job = await apiRequest<ImportJob>(`/projects/${projectId}/import-jobs`, {
        method: "POST",
        body: JSON.stringify({ tool_name: toolName, accessions: accessionList }),
      });
      setActiveImportJob(job);
      appendLog(`Utworzono zadanie importu #${job.id}.`);
      setAccessions("");
    } catch (err) {
      appendLog("Nie udało się utworzyć zadania importu.");
      setError(err instanceof Error ? err.message : "Import nie powiódł się");
      endActivity();
    }
  }

  async function onGenomeSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!genomeQuery.trim()) return;
    setIsSearchingGenomes(true);
    try {
      const results = await apiRequest<GenomeSearchResult[]>(
        `/system/genomes/search?query=${encodeURIComponent(genomeQuery)}&source=${genomeSource}`
      );
      setGenomeResults(results);
      if (results.length === 0) {
        setError("Nic nie znaleziono.");
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd wyszukiwania genomów");
      setGenomeResults([]);
    } finally {
      setIsSearchingGenomes(false);
    }
  }

  async function importGenome(genome: GenomeSearchResult) {
    setError(null);
    const tool = genome.source === "ncbi" ? "ncbi-genome-fetch" : "ensembl-genome-fetch";
    beginActivity([
      `Rozpoczynam pobieranie genomu (${genome.source.toUpperCase()}).`,
      `Accession: ${genome.accession}`,
      "Pobieranie działa w tle po stronie serwera.",
    ]);

    try {
      const job = await apiRequest<ImportJob>(`/projects/${projectId}/import-jobs`, {
        method: "POST",
        body: JSON.stringify({ tool_name: tool, accessions: [genome.accession] }),
      });
      setActiveImportJob(job);
      appendLog(`Utworzono zadanie importu #${job.id} dla ${genome.accession}.`);
    } catch (err) {
      appendLog("Nie udało się utworzyć zadania importu.");
      setError(err instanceof Error ? err.message : "Import nie powiódł się");
      endActivity();
    }
  }

  return (
    <div className="rounded-[1.5rem]">
      <h2 className="text-lg font-semibold">Dodawanie plików projektu</h2>
      <p className="mt-1 text-sm text-muted">
        Lokalny upload działa chunkami i można go wznowić po ponownym wskazaniu tych samych plików. Import SRA działa w tle po stronie backendu.
      </p>
      {(activityLog.length > 0 || isSubmitting || error || pendingLocalUploads.length || activeImportJob) ? (
        <div className="mt-4 rounded-[1.5rem] border border-line bg-[#172118] p-4 text-xs text-[#d9f0d4]">
          <div className="flex items-center justify-between gap-4">
            <p className="font-semibold text-white">
              {isSubmitting ? "Aktywność transferu" : error ? "Status ostatniego transferu" : "Podsumowanie transferu"}
            </p>
            <span className="text-[#9dd49d]">
              {isSubmitting ? `trwa · ${elapsedSeconds}s` : "bezczynny"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {activityLog.map((message, index) => (
              <p key={`${message}-${index}`}>{message}</p>
            ))}
            {pendingLocalUploads.map((item) => (
              <p key={item.fingerprint}>
                {item.originalName}: {formatBytes(item.uploadedBytes)} / {formatBytes(item.sizeBytes)} (
                {Math.floor((item.uploadedBytes / item.sizeBytes) * 100)}%)
              </p>
            ))}
            {activeImportJob ? (
              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <p className="font-semibold text-white">
                  Import #{activeImportJob.id} · {activeImportJob.tool_name} · {activeImportJob.status}
                </p>
                <p className="mt-1 text-[#9dd49d]">{activeImportJob.accessions.join(", ")}</p>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-[#d9f0d4]">
                  {activeImportJob.log || "Brak logów."}
                </pre>
              </div>
            ) : null}
            {error ? <p className="text-[#ffb7aa]">Błąd: {error}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm ${mode === "local" ? "bg-accent text-white" : "pill"}`}
          onClick={() => setMode("local")}
        >
          Upload lokalny
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm ${mode === "sra" ? "bg-accent text-white" : "pill"}`}
          onClick={() => setMode("sra")}
        >
          SRA import
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-2 text-sm ${mode === "genomes" ? "bg-accent text-white" : "pill"}`}
          onClick={() => setMode("genomes")}
        >
          Genomy referencyjne
        </button>
      </div>
      {mode === "local" ? (
        <form onSubmit={onLocalSubmit}>
          <p className="mt-4 text-sm text-muted">Przykładowe formaty: `*.fastq`, `*.fq`, `*.fastq.gz`, `*.fq.gz`, `*.bam`, `*.sam`, `*.cram`, `*.fasta`, `*.fa`.</p>
          <input
            key={inputResetKey}
            type="file"
            multiple
            className="mt-4 block w-full max-w-full text-sm"
            onChange={(event) => {
              const nextFiles = Array.from(event.target.files ?? []);
              setFiles(nextFiles);
              setSelectedFileNames(nextFiles.map((file) => file.name));
            }}
          />
          {selectedFileNames.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted">Wybrane pliki:</p>
              {selectedFileNames.map((fileName) => (
                <div key={fileName} className="pill min-w-0 break-words rounded-2xl px-4 py-2 text-sm">
                  {fileName}
                </div>
              ))}
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={isUploadingLocal}
            className="mt-4 rounded-2xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-60"
          >
            {isUploadingLocal ? "Wysyłanie..." : "Wyślij pliki"}
          </button>
        </form>
      ) : mode === "sra" ? (
        <form onSubmit={onSraSubmit}>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-muted">Narzędzie importu</span>
            <select
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
              value={toolName}
              onChange={(event) => setToolName(event.target.value as "fastq-dump" | "fasterq-dump")}
            >
              <option value="fasterq-dump">fasterq-dump</option>
              <option value="fastq-dump">fastq-dump (legacy)</option>
            </select>
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm text-muted">Accessiony</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
              value={accessions}
              onChange={(event) => setAccessions(event.target.value)}
              placeholder="SRR12345678&#10;SRR12345679"
            />
          </label>
          <p className="mt-2 text-sm text-muted">
            Rozdziel accessiony przecinkami, spacjami albo nowymi liniami. `fastq-dump` zostawiłem tylko jako tryb kompatybilności.
          </p>
          {error && mode === "sra" ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={isImportRunning}
            className="mt-4 rounded-2xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-60"
          >
            {isImportRunning ? "Import działa w tle..." : "Uruchom import"}
          </button>
        </form>
      ) : mode === "genomes" ? (
        <div className="mt-4">
          <form onSubmit={onGenomeSearch}>
            <div className="flex gap-4">
              <label className="flex-1 block">
                <span className="mb-2 block text-sm text-muted">Wyszukaj organizm lub ID</span>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
                  value={genomeQuery}
                  onChange={(event) => setGenomeQuery(event.target.value)}
                  placeholder={genomeSource === "ncbi" ? "np. E. coli, SARS-CoV-2, NC_000913.3" : "np. human, sars_cov_2, ENSG00000139618"}
                />
              </label>
              <label className="block w-40">
                <span className="mb-2 block text-sm text-muted">Źródło</span>
                <select
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
                  value={genomeSource}
                  onChange={(event) => setGenomeSource(event.target.value as "ncbi" | "ensembl")}
                >
                  <option value="ncbi">NCBI</option>
                  <option value="ensembl">Ensembl</option>
                </select>
              </label>
            </div>
            {error && mode === "genomes" ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={isSearchingGenomes || isImportRunning}
              className="mt-4 rounded-2xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-60"
            >
              {isSearchingGenomes ? "Wyszukiwanie..." : "Szukaj genomu"}
            </button>
          </form>

          {genomeResults.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Wyniki wyszukiwania:</h3>
              {genomeResults.map((result) => (
                <div key={result.id} className="pill flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
                  <div>
                    <p className="font-medium">{result.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      Organizm: {result.organism} | ID: {result.accession}
                      {result.length ? ` | Długość: ${(result.length / 1000000).toFixed(2)} Mbps` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => importGenome(result)}
                    disabled={isImportRunning}
                    className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Pobierz
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
