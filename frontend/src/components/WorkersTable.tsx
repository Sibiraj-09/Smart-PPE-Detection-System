import { WorkerRecord } from "../types";

type WorkersTableProps = {
  workers: WorkerRecord[];
};

export function WorkersTable({ workers }: WorkersTableProps) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-5 shadow-neon">
      <h2 className="text-xl font-semibold text-white">Worker PPE Logs</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700 text-left text-sm">
          <thead>
            <tr className="text-slate-300">
              <th className="px-3 py-2">Worker ID</th>
              <th className="px-3 py-2">Helmet</th>
              <th className="px-3 py-2">Vest</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-100">
            {workers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  No records yet. Upload and process a video first.
                </td>
              </tr>
            )}

            {workers.map((worker, index) => {
              const unsafe = worker.helmet === "No" || worker.vest === "No";
              const status = worker.status ?? (unsafe ? "Unsafe" : "Safe");
              return (
                <tr key={`${worker.worker_id}-${worker.time}-${index}`}>
                  <td className="px-3 py-2 font-medium">{worker.worker_id}</td>
                  <td className={`px-3 py-2 ${worker.helmet === "Yes" ? "text-safe" : "text-danger"}`}>{worker.helmet}</td>
                  <td className={`px-3 py-2 ${worker.vest === "Yes" ? "text-safe" : "text-danger"}`}>{worker.vest}</td>
                  <td className={`px-3 py-2 ${status === "Safe" ? "text-safe" : "text-danger"}`}>{status}</td>
                  <td className={`px-3 py-2 ${unsafe ? "text-danger" : "text-slate-200"}`}>{worker.time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
