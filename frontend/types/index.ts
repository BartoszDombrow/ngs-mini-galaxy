export type User = {
  id: number;
  email: string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type UploadFileItem = {
  id: number;
  project_id: number;
  original_name: string;
  stored_path: string;
  file_type: string;
  created_at: string;
};

export type UploadSession = {
  id: number;
  project_id: number;
  created_by_user_id: number;
  original_name: string;
  file_type: string;
  size_bytes: number;
  uploaded_bytes: number;
  status: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  uploaded_file: UploadFileItem | null;
};

export type ImportJob = {
  id: number;
  project_id: number;
  requested_by_user_id: number;
  tool_name: string;
  accessions: string[];
  status: string;
  log: string;
  error_message: string | null;
  imported_files: UploadFileItem[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type Project = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  owner_email: string;
  access_role: "owner" | "collaborator";
  can_manage_members: boolean;
  member_count: number;
};

export type ProjectMember = {
  user_id: number;
  email: string;
  role: "owner" | "collaborator";
  created_at: string;
};

export type ProjectDetail = Project & {
  uploads: UploadFileItem[];
  members: ProjectMember[];
};

export type ToolStatus = {
  name: string;
  installed: boolean;
  executable: string | null;
  version: string | null;
  notes: string | null;
};

export type ToolOptionDefinition = {
  key: string;
  flag: string;
  label: string;
  description: string;
  value_type: string;
  placeholder: string | null;
  choices: string[];
  applies_to: string[];
};

export type ToolSpec = {
  name: string;
  description: string;
  input_mode: string;
  runner_mode: string;
  accepted_file_types: string[];
  option_definitions: ToolOptionDefinition[];
};

export type PipelineOptionValue = {
  key: string;
  enabled: boolean;
  value: string | null;
};

export type PipelineStepConfig = {
  step_name: string;
  tool_name: string;
  input_source: "project" | "step";
  input_from_step_order: number | null;
  input_file_ids: number[];
  options: PipelineOptionValue[];
};

export type PipelineInputFile = {
  id: number;
  original_name: string;
  file_type: string;
};

export type Job = {
  id: number;
  project_id: number;
  sample_name: string;
  status: string;
  selected_steps: PipelineStepConfig[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  working_dir: string;
};

export type JobStep = {
  id: number;
  job_id: number;
  step_name: string;
  tool_name: string;
  step_order: number;
  input_files: PipelineInputFile[];
  tool_options: PipelineOptionValue[];
  status: string;
  command: string;
  stdout_path: string;
  stderr_path: string;
  started_at: string | null;
  finished_at: string | null;
};

export type JobLogs = {
  job_id: number;
  logs: Record<string, { stdout: string; stderr: string }>;
};

export type JobFile = {
  name: string;
  path: string;
  kind: string;
};
