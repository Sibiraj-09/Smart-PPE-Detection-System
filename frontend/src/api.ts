import { StatusSummary, WorkerRecord } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function processVideo(file: File): Promise<{ videoUrl: string }> {
  const formData = new FormData();
  formData.append("video", file);

  const response = await fetch(apiUrl("/api/process-video"), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to process video" }));
    throw new Error(payload.error || "Failed to process video");
  }

  return response.json();
}

export async function getWorkers(): Promise<WorkerRecord[]> {
  const response = await fetch(apiUrl("/api/workers"));
  if (!response.ok) {
    throw new Error("Failed to fetch workers");
  }
  return response.json();
}

export async function getStatus(): Promise<StatusSummary> {
  const response = await fetch(apiUrl("/api/status"));
  if (!response.ok) {
    throw new Error("Failed to fetch status");
  }
  return response.json();
}

export function absoluteVideoUrl(relativeUrl: string): string {
  return apiUrl(relativeUrl);
}
