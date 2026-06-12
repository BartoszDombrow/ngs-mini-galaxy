"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import {
  Job,
  PipelineStepConfig,
  ToolOptionDefinition,
  ToolSpec,
  UploadFileItem,
} from "@/types";

type JobCreateFormProps = {
  projectId: number;
  uploads: UploadFileItem[];
  onCreated: (job: Job) => void;
  onCancel?: () => void;
};

const tools = [
  "fastqc",
  "multiqc",
  "trimmomatic",
  "bwa",
  "samtools",
  "bcftools",
];

const makeStep = (index: number): PipelineStepConfig => ({
  step_name: `Krok ${index + 1}`,
  tool_name: "fastqc",
  input_source: "project",
  input_from_step_order: null,
  input_file_ids: [],
  options: [],
});

function isPrimaryChoiceOption(definition: ToolOptionDefinition) {
  return definition.flag.startsWith("__") && definition.value_type === "choice";
}

function getPrimaryChoiceDefaults(toolSpec: ToolSpec | null) {
  if (!toolSpec) {
    return [];
  }

  return toolSpec.option_definitions
    .filter(isPrimaryChoiceOption)
    .map((definition) => ({
      key: definition.key,
      enabled: true,
      value: definition.choices[0] ?? "",
    }));
}

function getSelectedPrimaryChoiceValues(step: PipelineStepConfig, toolSpec: ToolSpec | null) {
  if (!toolSpec) {
    return [];
  }

  return toolSpec.option_definitions
    .filter(isPrimaryChoiceOption)
    .map((definition) => step.options.find((item) => item.key === definition.key)?.value ?? definition.choices[0] ?? "")
    .filter(Boolean);
}

function isOptionApplicable(step: PipelineStepConfig, toolSpec: ToolSpec | null, definition: ToolOptionDefinition) {
  if (!definition.applies_to.length) {
    return true;
  }

  const selectedValues = getSelectedPrimaryChoiceValues(step, toolSpec);
  return selectedValues.some((value) => definition.applies_to.includes(value));
}

function getAcceptedFileTypes(step: PipelineStepConfig, toolSpec: ToolSpec | null) {
  if (!toolSpec) {
    return [];
  }

  let acceptedFileTypes = toolSpec.accepted_file_types;
  if (toolSpec.name === "samtools") {
    const subcommand = step.options.find((item) => item.key === "subcommand")?.value ?? "sort";
    if (subcommand === "faidx" || subcommand === "dict") {
      acceptedFileTypes = ["fasta"];
    } else if (
      ["sort", "index", "flagstat", "stats", "idxstats", "depth", "view", "coverage", "quickcheck", "fasta", "fastq"].includes(subcommand)
    ) {
      acceptedFileTypes = ["bam", "sam", "cram"];
    }
  }

  return acceptedFileTypes;
}

function getCompatibleUploads(step: PipelineStepConfig, toolSpec: ToolSpec | null, uploads: UploadFileItem[]) {
  if (!toolSpec || toolSpec.input_mode === "job") {
    return [];
  }

  const acceptedFileTypes = getAcceptedFileTypes(step, toolSpec);

  if (!acceptedFileTypes.length) {
    return uploads;
  }

  return uploads.filter((file) => acceptedFileTypes.includes(file.file_type));
}

function getStepOutputFileTypes(step: PipelineStepConfig, toolSpec: ToolSpec | null) {
  if (!toolSpec) {
    return [];
  }

  if (toolSpec.name === "trimmomatic") {
    return ["fastq.gz"];
  }
  if (toolSpec.name === "bwa") {
    return ["bam"];
  }
  if (toolSpec.name === "bcftools") {
    return ["vcf"];
  }
  if (toolSpec.name === "samtools") {
    const subcommand = step.options.find((item) => item.key === "subcommand")?.value ?? "sort";
    if (subcommand === "sort") {
      const outputFormat = step.options.find((item) => item.key === "output_format")?.value ?? "BAM";
      return [outputFormat.toLowerCase()];
    }
    if (subcommand === "view") {
      const outputFormat = step.options.find((item) => item.key === "output_format")?.value ?? "BAM";
      return [outputFormat.toLowerCase()];
    }
    if (subcommand === "index") {
      return ["bai"];
    }
    if (subcommand === "faidx") {
      return ["fai"];
    }
  }

  return [];
}

function getCompatibleUpstreamSteps(
  currentIndex: number,
  currentStep: PipelineStepConfig,
  selectedSteps: PipelineStepConfig[],
  toolSpecs: ToolSpec[],
) {
  const currentToolSpec = toolSpecs.find((item) => item.name === currentStep.tool_name) ?? null;
  const acceptedFileTypes = getAcceptedFileTypes(currentStep, currentToolSpec);

  return selectedSteps.slice(0, currentIndex).flatMap((step, index) => {
    const upstreamToolSpec = toolSpecs.find((item) => item.name === step.tool_name) ?? null;
    const outputTypes = getStepOutputFileTypes(step, upstreamToolSpec);
    const compatibleOutputTypes = outputTypes.filter((fileType) => acceptedFileTypes.includes(fileType));
    if (!compatibleOutputTypes.length) {
      return [];
    }

    return [
      {
        stepOrder: index + 1,
        stepName: step.step_name,
        toolName: step.tool_name,
        outputTypes: compatibleOutputTypes,
      },
    ];
  });
}

function sanitizeStepOptions(step: PipelineStepConfig, toolSpec: ToolSpec | null, nextOptions: PipelineStepConfig["options"]) {
  if (!toolSpec) {
    return nextOptions;
  }

  const primaryKeys = new Set(toolSpec.option_definitions.filter(isPrimaryChoiceOption).map((definition) => definition.key));
  const temporaryStep = { ...step, options: nextOptions };

  return nextOptions.filter((option) => {
    if (primaryKeys.has(option.key)) {
      return true;
    }

    const definition = toolSpec.option_definitions.find((item) => item.key === option.key);
    if (!definition) {
      return false;
    }

    return isOptionApplicable(temporaryStep, toolSpec, definition);
  });
}

export function JobCreateForm({ projectId, uploads, onCreated, onCancel }: JobCreateFormProps) {
  const [sampleName, setSampleName] = useState("");
  const [selectedSteps, setSelectedSteps] = useState<PipelineStepConfig[]>([makeStep(0)]);
  const [toolSpecs, setToolSpecs] = useState<ToolSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    apiRequest<ToolSpec[]>("/system/tool-specs")
      .then(setToolSpecs)
      .catch(() => setToolSpecs([]));
  }, []);

  function getToolSpec(toolName: string) {
    return toolSpecs.find((item) => item.name === toolName) ?? null;
  }

  function addStep() {
    setSelectedSteps((current) => [...current, makeStep(current.length)]);
  }

  function updateStep(index: number, nextStep: PipelineStepConfig) {
    setSelectedSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? nextStep : step)));
  }

  function removeStep(index: number) {
    setSelectedSteps((current) =>
      current
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({ ...step, step_name: `Krok ${stepIndex + 1}` })),
    );
  }

  function toggleFile(step: PipelineStepConfig, fileId: number) {
    const checked = step.input_file_ids.includes(fileId);
    return checked
      ? step.input_file_ids.filter((item) => item !== fileId)
      : [...step.input_file_ids, fileId];
  }

  function selectAllCompatible(step: PipelineStepConfig) {
    const toolSpec = getToolSpec(step.tool_name);
    const compatibleUploads = getCompatibleUploads(step, toolSpec, uploads);
    return {
      ...step,
      input_file_ids: compatibleUploads.map((file) => file.id),
    };
  }

  function clearSelectedFiles(step: PipelineStepConfig) {
    return {
      ...step,
      input_file_ids: [],
    };
  }

  function toggleOption(step: PipelineStepConfig, definition: ToolOptionDefinition) {
    const exists = step.options.find((item) => item.key === definition.key);
    if (exists) {
      return step.options.filter((item) => item.key !== definition.key);
    }
    return [
      ...step.options,
      {
        key: definition.key,
        enabled: true,
        value: definition.value_type === "boolean" ? null : "",
      },
    ];
  }

  function updateOptionValue(step: PipelineStepConfig, key: string, value: string) {
    return step.options.map((item) => (item.key === key ? { ...item, value } : item));
  }

  function upsertOptionValue(step: PipelineStepConfig, key: string, value: string) {
    const exists = step.options.some((item) => item.key === key);
    if (!exists) {
      return [
        ...step.options,
        {
          key,
          enabled: true,
          value,
        },
      ];
    }

    return updateOptionValue(step, key, value);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSteps.length) {
      setError("Dodaj przynajmniej jeden krok pipeline'u.");
      return;
    }
    if (
      selectedSteps.some((step) => {
        const toolSpec = getToolSpec(step.tool_name);
        if (toolSpec?.input_mode === "job") {
          return false;
        }
        if (step.input_source === "step") {
          return step.input_from_step_order == null;
        }
        return step.input_file_ids.length === 0;
      })
    ) {
      setError("Każdy krok musi mieć określone źródło wejścia: pliki projektu albo wynik wcześniejszego kroku.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const job = await apiRequest<Job>(`/projects/${projectId}/jobs`, {
        method: "POST",
        body: JSON.stringify({ sample_name: sampleName, selected_steps: selectedSteps }),
      });
      onCreated(job);
      setSampleName("");
      setSelectedSteps([makeStep(0)]);
      if (onCancel) onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć zadania.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-h-[calc(92vh-2rem)] w-full flex-col sm:max-h-[calc(92vh-4rem)]">
      <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
        <h2 className="min-w-0 break-words text-2xl font-bold bg-gradient-to-br from-foreground to-muted bg-clip-text text-transparent">Uruchom analizę</h2>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-line/50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">Nazwa analizy</span>
          <input
            className="w-full rounded-2xl border border-line bg-background px-4 py-3 text-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent"
            value={sampleName}
            onChange={(event) => setSampleName(event.target.value)}
            placeholder="np. analiza_fastqc_seria_1"
            required
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Konstruktor pipeline&apos;u</p>
            <p className="mt-1 max-w-2xl text-xs text-muted/70">
              Wybierz narzędzie dla każdego kroku i przypisz pliki projektu.
              Dostępne narzędzia: `fastqc`, `multiqc`, `trimmomatic`, `samtools`, `bwa`, `bcftools`.
            </p>
          </div>
          <button
            type="button"
            onClick={addStep}
            className="w-full rounded-full bg-line/50 px-4 py-2 text-sm transition-colors hover:bg-line sm:w-auto sm:whitespace-nowrap"
          >
            Dodaj krok
          </button>
        </div>

        <div className="space-y-4">
          {selectedSteps.length ? (
            selectedSteps.map((step, index) => {
              const toolSpec = getToolSpec(step.tool_name);
              const primaryChoiceOptions = toolSpec?.option_definitions.filter(isPrimaryChoiceOption) ?? [];
              const extraOptions =
                toolSpec?.option_definitions.filter(
                  (definition) => !isPrimaryChoiceOption(definition) && isOptionApplicable(step, toolSpec, definition),
                ) ?? [];
              const requiresProjectInputs = toolSpec?.input_mode !== "job";
              const acceptedFileTypes = getAcceptedFileTypes(step, toolSpec);
              const compatibleUploads = getCompatibleUploads(step, toolSpec, uploads);
              const compatibleUpstreamSteps = getCompatibleUpstreamSteps(index, step, selectedSteps, toolSpecs);
              return (
              <div key={`${step.step_name}-${index}`} className="rounded-[1.5rem] border border-line/40 bg-background/50 p-4 shadow-inner sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{step.step_name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    className="text-xs text-danger hover:underline font-medium"
                  >
                    Usuń krok
                  </button>
                </div>
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm text-muted">Narzędzie</span>
                  <select
                    className="w-full rounded-2xl border border-line bg-background px-4 py-3 text-sm outline-none transition-all focus:border-accent"
                    value={step.tool_name}
                    onChange={(event) =>
                      updateStep(index, {
                        ...step,
                        tool_name: event.target.value,
                        input_source: "project",
                        input_from_step_order: null,
                        input_file_ids: [],
                        options: getPrimaryChoiceDefaults(getToolSpec(event.target.value)),
                      })
                    }
                  >
                    {tools.map((tool) => (
                      <option key={tool} value={tool}>
                        {tool}
                      </option>
                    ))}
                  </select>
                </label>
                {toolSpec ? (
                  <div className="mt-4 rounded-2xl border border-line/30 bg-card/80 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{toolSpec.name}</p>
                        <p className="mt-1 text-xs text-muted leading-relaxed">{toolSpec.description}</p>
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                        <span className="pill rounded-full px-3 py-1 text-[10px] uppercase font-bold tracking-wider">
                          wejście: {toolSpec.input_mode === "job" ? "wyniki joba" : "pliki"}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[10px] uppercase font-bold tracking-wider ${toolSpec.runner_mode === "real" ? "bg-accent/20 text-accent-strong" : "bg-orange-500/20 text-orange-400"}`}>
                          {toolSpec.runner_mode === "real" ? "real" : "demo"}
                        </span>
                        {acceptedFileTypes.length ? (
                          <p className="text-[10px] text-muted">
                            Typy: {acceptedFileTypes.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {primaryChoiceOptions.length ? (
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        {primaryChoiceOptions.map((definition) => {
                          const selectedValue =
                            step.options.find((item) => item.key === definition.key)?.value ??
                            definition.choices[0] ??
                            "";
                          return (
                            <label key={definition.key} className="block">
                              <span className="mb-2 block text-xs font-medium text-muted">{definition.label}</span>
                              <select
                                className="w-full rounded-2xl border border-line bg-background px-4 py-3 text-sm outline-none focus:border-accent transition-all"
                                value={selectedValue}
                                onChange={(event) =>
                                  updateStep(index, {
                                    ...step,
                                    options: sanitizeStepOptions(
                                      step,
                                      toolSpec,
                                      upsertOptionValue(step, definition.key, event.target.value),
                                    ),
                                    input_source:
                                      step.input_source === "step" && compatibleUpstreamSteps.length === 0
                                        ? "project"
                                        : step.input_source,
                                    input_from_step_order:
                                      step.input_source === "step" &&
                                      !compatibleUpstreamSteps.some((candidate) => candidate.stepOrder === step.input_from_step_order)
                                        ? null
                                        : step.input_from_step_order,
                                    input_file_ids: [],
                                  })
                                }
                              >
                                {definition.choices.map((choice) => (
                                  <option key={choice} value={choice}>
                                    {choice}
                                  </option>
                                ))}
                              </select>
                              <span className="mt-2 block text-[10px] text-muted/70">{definition.description}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                    {toolSpec.option_definitions.length ? (
                      <div className="mt-5 space-y-3 border-t border-line/30 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Flagi dodatkowe</p>
                        {extraOptions.map((definition) => {
                          const selected = step.options.find((item) => item.key === definition.key);
                          return (
                            <div key={definition.key} className="rounded-2xl border border-line/50 bg-background/70 p-4 transition-colors hover:border-line">
                              <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 accent-accent"
                                  checked={Boolean(selected)}
                                  onChange={() =>
                                    updateStep(index, {
                                      ...step,
                                      options: toggleOption(step, definition),
                                    })
                                  }
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium">
                                    <span className="mr-1 break-all font-mono text-accent">{definition.flag}</span>
                                    {definition.label}
                                  </span>
                                  <span className="mt-1 block text-xs text-muted/80">
                                    {definition.description}
                                  </span>
                                </span>
                              </label>
                              {selected && definition.value_type !== "boolean" ? (
                                definition.choices.length ? (
                                  <select
                                    className="mt-3 w-full rounded-2xl border border-line bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
                                    value={selected.value ?? ""}
                                    onChange={(event) =>
                                      updateStep(index, {
                                        ...step,
                                        options: updateOptionValue(step, definition.key, event.target.value),
                                      })
                                    }
                                  >
                                    <option value="">Wybierz wartość</option>
                                    {definition.choices.map((choice) => (
                                      <option key={choice} value={choice}>
                                        {choice}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    className="mt-3 w-full rounded-2xl border border-line bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
                                    value={selected.value ?? ""}
                                    onChange={(event) =>
                                      updateStep(index, {
                                        ...step,
                                        options: updateOptionValue(step, definition.key, event.target.value),
                                      })
                                    }
                                    placeholder={definition.placeholder ?? "Wpisz wartość"}
                                  />
                                )
                              ) : null}
                            </div>
                          );
                        })}
                        {!extraOptions.length ? (
                          <p className="text-xs text-muted italic">
                            Dla wybranego wariantu brak dodatkowych flag.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-5 border-t border-line/30 pt-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold">Dane wejściowe</span>
                      <span className="block text-[10px] text-muted">
                        {requiresProjectInputs
                          ? step.input_source === "step"
                            ? step.input_from_step_order
                              ? `Z kroku ${step.input_from_step_order}`
                              : "Wybierz krok źródłowy"
                            : `${step.input_file_ids.length} wybranych plików`
                          : "Używa wyników z poprzednich kroków"}
                      </span>
                    </div>
                    {requiresProjectInputs && step.input_source === "project" ? (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="pill rounded-full px-3 py-1 text-[10px] font-medium transition-colors hover:bg-white/10"
                          onClick={() => updateStep(index, selectAllCompatible(step))}
                          disabled={compatibleUploads.length === 0}
                        >
                          Wszystkie
                        </button>
                        <button
                          type="button"
                          className="pill rounded-full px-3 py-1 text-[10px] font-medium transition-colors hover:bg-white/10"
                          onClick={() => updateStep(index, clearSelectedFiles(step))}
                          disabled={step.input_file_ids.length === 0}
                        >
                          Wyczyść
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {requiresProjectInputs ? (
                    <div className="mb-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${step.input_source === "project" ? "bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "border border-line/50 hover:bg-white/5 text-muted"}`}
                        onClick={() =>
                          updateStep(index, {
                            ...step,
                            input_source: "project",
                            input_from_step_order: null,
                          })
                        }
                      >
                        Pliki z projektu
                      </button>
                      <button
                        type="button"
                        disabled={!compatibleUpstreamSteps.length}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                          step.input_source === "step" ? "bg-accent/20 text-accent border border-accent/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]" : "border border-line/50 hover:bg-white/5 text-muted"
                        } disabled:opacity-30 disabled:hover:bg-transparent`}
                        onClick={() =>
                          updateStep(index, {
                            ...step,
                            input_source: "step",
                            input_from_step_order: compatibleUpstreamSteps[0]?.stepOrder ?? null,
                            input_file_ids: [],
                          })
                        }
                      >
                        Wyjście z innego kroku
                      </button>
                    </div>
                  ) : null}
                  {requiresProjectInputs ? (
                    step.input_source === "step" ? (
                      compatibleUpstreamSteps.length ? (
                        <div className="space-y-3 mt-3">
                          <label className="block">
                            <span className="mb-1 block text-xs text-muted">Krok generujący dane</span>
                            <select
                              className="w-full rounded-2xl border border-line bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
                              value={step.input_from_step_order ?? ""}
                              onChange={(event) =>
                                updateStep(index, {
                                  ...step,
                                  input_from_step_order: Number(event.target.value),
                                  input_file_ids: [],
                                })
                              }
                            >
                              {compatibleUpstreamSteps.map((candidate) => (
                                <option key={candidate.stepOrder} value={candidate.stepOrder}>
                                  {`Krok ${candidate.stepOrder}: ${candidate.stepName} (${candidate.toolName}) -> ${candidate.outputTypes.join(", ")}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <p className="text-xs italic text-muted mt-3">
                          Brak wcześniejszych kroków generujących pliki pasujące do {toolSpec?.name}.
                        </p>
                      )
                    ) : (
                      <div className="grid gap-2 mt-3">
                        {compatibleUploads.length ? (
                          compatibleUploads.map((file) => {
                            const checked = step.input_file_ids.includes(file.id);
                            return (
                              <label
                                key={file.id}
                                className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm cursor-pointer transition-all ${
                                  checked
                                    ? "border-accent/50 bg-accent/10"
                                    : "border-line/40 bg-white/5 hover:border-line"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-accent"
                                  checked={checked}
                                  onChange={() => {
                                    updateStep(index, {
                                      ...step,
                                      input_file_ids: toggleFile(step, file.id),
                                    });
                                  }}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block break-words font-medium">{file.original_name}</span>
                                  <span className="block text-[10px] uppercase tracking-widest text-muted">{file.file_type}</span>
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="text-xs italic text-muted/70 mt-1">
                            Brak pasujących plików w projekcie. Zmień typ danych wejściowych w opcjach, lub wgraj nowe pliki.
                          </p>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="rounded-2xl border border-dashed border-line/40 px-4 py-3 text-xs italic text-muted/70 mt-3">
                      To narzędzie pobierze automatycznie wyniki z poprzednich zadań.
                    </p>
                  )}
                </div>
              </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-line/30 bg-white/5 p-8 text-center">
              <p className="text-sm font-medium text-muted">Nie dodano żadnych kroków do pipeline&apos;u.</p>
              <p className="text-xs text-muted/60 mt-1">Kliknij &quot;Dodaj krok&quot;, aby rozpocząć budowę analizy.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex shrink-0 flex-col gap-3 border-t border-line/30 pt-5 sm:flex-row sm:items-center sm:justify-end">
        {error ? <p className="min-w-0 rounded-xl bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger sm:mr-auto">{error}</p> : null}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Anuluj
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-gradient-to-r from-accent to-accent-strong px-6 py-2.5 text-sm font-bold text-background shadow-lg shadow-accent/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isSubmitting ? "Tworzenie..." : "Uruchom zadanie"}
        </button>
      </div>
    </form>
  );
}
