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

export function JobCreateForm({ projectId, uploads, onCreated }: JobCreateFormProps) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć zadania.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card rounded-[2rem] p-6">
      <h2 className="text-lg font-semibold">Uruchom zadanie pipeline&apos;u</h2>
      <label className="mt-4 block">
        <span className="mb-2 block text-sm text-muted">Nazwa analizy</span>
        <input
          className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
          value={sampleName}
          onChange={(event) => setSampleName(event.target.value)}
          placeholder="np. analiza_fastqc_seria_1"
          required
        />
      </label>
      <div className="mt-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Konstruktor pipeline&apos;u</p>
          <p className="text-sm text-muted">Wybierz narzędzie dla każdego kroku i przypisz pliki projektu.</p>
          <p className="mt-1 text-xs text-muted">
            `fastqc`, `multiqc`, `trimmomatic` i `samtools` uruchamiają się już realnie w kontenerze. `bwa` i `bcftools` mają pełną konfigurację flag, ale nadal działają w trybie demonstracyjnym.
          </p>
        </div>
        <button
          type="button"
          onClick={addStep}
          className="rounded-full bg-accent-strong px-4 py-2 text-sm text-white"
        >
          Dodaj krok
        </button>
      </div>
      <div className="mt-4 space-y-4">
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
            <div key={`${step.step_name}-${index}`} className="rounded-[1.5rem] border border-line bg-white/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-muted">{step.step_name}</p>
                  <p className="text-sm text-muted">Wybierz narzędzie i pasujące pliki wejściowe.</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  className="text-sm text-danger"
                >
                  Usuń
                </button>
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm text-muted">Narzędzie</span>
                <select
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-accent"
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
                <div className="mt-4 rounded-2xl border border-line bg-[#f6faf4] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{toolSpec.name}</p>
                      <p className="mt-1 text-sm text-muted">{toolSpec.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="pill rounded-full px-3 py-1 text-xs">
                        tryb wejścia: {toolSpec.input_mode === "job" ? "wyniki joba" : "pliki projektu"}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs ${toolSpec.runner_mode === "real" ? "bg-[#e7f7ea] text-[#24613a]" : "bg-[#fff1d8] text-[#8a5a00]"}`}>
                        {toolSpec.runner_mode === "real" ? "wykonywane realnie" : "tryb demonstracyjny"}
                      </span>
                      {acceptedFileTypes.length ? (
                        <p className="text-xs text-muted">
                          Obsługiwane typy plików: {acceptedFileTypes.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {primaryChoiceOptions.length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {primaryChoiceOptions.map((definition) => {
                        const selectedValue =
                          step.options.find((item) => item.key === definition.key)?.value ??
                          definition.choices[0] ??
                          "";
                        return (
                          <label key={definition.key} className="block">
                            <span className="mb-2 block text-sm text-muted">{definition.label}</span>
                            <select
                              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-accent"
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
                            <span className="mt-2 block text-xs text-muted">{definition.description}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  {toolSpec.option_definitions.length ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm font-medium">Dostępne flagi i parametry</p>
                      {extraOptions.map((definition) => {
                        const selected = step.options.find((item) => item.key === definition.key);
                        return (
                          <div key={definition.key} className="rounded-2xl border border-line bg-white p-4">
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={Boolean(selected)}
                                onChange={() =>
                                  updateStep(index, {
                                    ...step,
                                    options: toggleOption(step, definition),
                                  })
                                }
                              />
                              <span className="flex-1">
                                <span className="block font-medium">
                                  {definition.flag} · {definition.label}
                                </span>
                                <span className="mt-1 block text-xs text-muted">
                                  {definition.description}
                                </span>
                              </span>
                            </label>
                            {selected && definition.value_type !== "boolean" ? (
                              definition.choices.length ? (
                                <select
                                  className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-accent"
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
                                  className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-accent"
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
                        <p className="text-sm text-muted">
                          Dla tego narzędzia nie wystawiono jeszcze dodatkowych flag poza wyborem wariantu działania.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">Dla tego narzędzia nie wystawiono jeszcze konfigurowalnych flag.</p>
                  )}
                </div>
              ) : null}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <span className="block text-sm text-muted">Pliki wejściowe</span>
                    <span className="text-xs text-muted">
                      {requiresProjectInputs
                        ? step.input_source === "step"
                          ? step.input_from_step_order
                            ? `wejście z kroku ${step.input_from_step_order}`
                            : "wybierz wcześniejszy krok jako źródło wejścia"
                          : `${step.input_file_ids.length} zaznaczono dla tego kroku`
                        : "To narzędzie korzysta z wyników wcześniejszych kroków tego samego joba"}
                    </span>
                  </div>
                  {requiresProjectInputs && step.input_source === "project" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="pill rounded-full px-3 py-1.5 text-xs"
                        onClick={() => updateStep(index, selectAllCompatible(step))}
                        disabled={compatibleUploads.length === 0}
                      >
                        Zaznacz wszystkie
                      </button>
                      <button
                        type="button"
                        className="pill rounded-full px-3 py-1.5 text-xs"
                        onClick={() => updateStep(index, clearSelectedFiles(step))}
                        disabled={step.input_file_ids.length === 0}
                      >
                        Wyczyść
                      </button>
                    </div>
                  ) : null}
                </div>
                {requiresProjectInputs ? (
                  <div className="mb-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm ${step.input_source === "project" ? "bg-accent text-white" : "pill"}`}
                      onClick={() =>
                        updateStep(index, {
                          ...step,
                          input_source: "project",
                          input_from_step_order: null,
                        })
                      }
                    >
                      Pliki projektu
                    </button>
                    <button
                      type="button"
                      disabled={!compatibleUpstreamSteps.length}
                      className={`rounded-full px-4 py-2 text-sm ${
                        step.input_source === "step" ? "bg-accent text-white" : "pill"
                      } disabled:opacity-50`}
                      onClick={() =>
                        updateStep(index, {
                          ...step,
                          input_source: "step",
                          input_from_step_order: compatibleUpstreamSteps[0]?.stepOrder ?? null,
                          input_file_ids: [],
                        })
                      }
                    >
                      Wynik wcześniejszego kroku
                    </button>
                  </div>
                ) : null}
                {requiresProjectInputs ? (
                  step.input_source === "step" ? (
                    compatibleUpstreamSteps.length ? (
                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-2 block text-sm text-muted">Źródło wejścia z wcześniejszego kroku</span>
                          <select
                            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-accent"
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
                        <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
                          Ten krok pobierze kompatybilne pliki wyjściowe z wybranego wcześniejszego kroku. To jest opcjonalne:
                          możesz wrócić do ręcznego wyboru plików projektu w dowolnym momencie.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">
                        Nie ma jeszcze wcześniejszego kroku, który produkuje pliki zgodne z tym narzędziem.
                      </p>
                    )
                  ) : (
                    <div className="grid gap-3">
                      {compatibleUploads.length ? (
                        compatibleUploads.map((file) => {
                          const checked = step.input_file_ids.includes(file.id);
                          return (
                            <label
                              key={file.id}
                              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                                checked
                                  ? "border-accent bg-[#eef7f0]"
                                  : "border-line bg-white/80"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  updateStep(index, {
                                    ...step,
                                    input_file_ids: toggleFile(step, file.id),
                                  });
                                }}
                              />
                              <span className="flex-1">
                                <span className="block font-medium">{file.original_name}</span>
                                <span className="block text-xs text-muted">{file.file_type}</span>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted">
                          Brak zgodnych plików w projekcie dla tego narzędzia. Dodaj odpowiednie dane wejściowe i spróbuj ponownie.
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
                    Tutaj nie wybierasz plików ręcznie. Ten krok agreguje wyniki wygenerowane wcześniej w tym samym jobie, na przykład raporty FastQC dla MultiQC.
                  </p>
                )}
              </div>
            </div>
            );
          })
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
            Nie dodano jeszcze żadnych kroków. Zacznij od dodania kroku, wyboru narzędzia i zaznaczenia plików do przetworzenia.
          </p>
        )}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 rounded-2xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Uruchamianie..." : "Utwórz zadanie"}
      </button>
    </form>
  );
}
