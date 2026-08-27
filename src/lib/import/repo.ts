import { createAdminClient } from "@/utils/supabase/admin";
import type { StagedItem } from "./schema";

export type ImportJobStatus = "processing" | "review" | "committed" | "failed";

export interface ImportJob {
  id: string;
  operatorId: string;
  createdAt: string;
  status: ImportJobStatus;
  sourceName: string | null;
  sourceCsv: string;
  totalChunks: number;
  doneChunks: number;
  staged: StagedItem[];
  warnings: string[];
  error: string | null;
}

type Row = {
  id: string;
  operator_id: string;
  created_at: string;
  status: ImportJobStatus;
  source_name: string | null;
  source_csv: string;
  total_chunks: number;
  done_chunks: number;
  staged: StagedItem[];
  warnings: string[];
  error: string | null;
};

const rowToJob = (r: Row): ImportJob => ({
  id: r.id,
  operatorId: r.operator_id,
  createdAt: r.created_at,
  status: r.status,
  sourceName: r.source_name,
  sourceCsv: r.source_csv,
  totalChunks: r.total_chunks,
  doneChunks: r.done_chunks,
  staged: r.staged ?? [],
  warnings: r.warnings ?? [],
  error: r.error,
});

export async function createImportJob(input: {
  operatorId: string;
  sourceName: string | null;
  sourceCsv: string;
  totalChunks: number;
}): Promise<ImportJob> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      operator_id: input.operatorId,
      source_name: input.sourceName,
      source_csv: input.sourceCsv,
      total_chunks: input.totalChunks,
    })
    .select()
    .single();
  if (error) throw new Error(`createImportJob failed: ${error.message}`);
  return rowToJob(data as Row);
}

/** Fetch a job, scoped to its operator (an operator can't touch another's). */
export async function getImportJob(operatorId: string, id: string): Promise<ImportJob | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .select()
    .eq("id", id)
    .eq("operator_id", operatorId)
    .maybeSingle();
  if (error) throw new Error(`getImportJob failed: ${error.message}`);
  return data ? rowToJob(data as Row) : null;
}

export async function updateImportJob(
  operatorId: string,
  id: string,
  patch: Partial<{
    status: ImportJobStatus;
    doneChunks: number;
    staged: StagedItem[];
    warnings: string[];
    error: string | null;
  }>,
): Promise<void> {
  const supabase = createAdminClient();
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.doneChunks !== undefined) row.done_chunks = patch.doneChunks;
  if (patch.staged !== undefined) row.staged = patch.staged;
  if (patch.warnings !== undefined) row.warnings = patch.warnings;
  if (patch.error !== undefined) row.error = patch.error;
  const { error } = await supabase
    .from("import_jobs")
    .update(row)
    .eq("id", id)
    .eq("operator_id", operatorId);
  if (error) throw new Error(`updateImportJob failed: ${error.message}`);
}
