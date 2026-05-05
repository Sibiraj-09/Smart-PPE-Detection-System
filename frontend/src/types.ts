export type WorkerRecord = {
  worker_id: string;
  helmet: "Yes" | "No";
  vest: "Yes" | "No";
  time: string;
  status?: "Safe" | "Unsafe";
};

export type StatusSummary = {
  totalWorkers: number;
  safeWorkers: number;
  unsafeWorkers: number;
};
