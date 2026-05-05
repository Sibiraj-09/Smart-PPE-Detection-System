import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Users } from "lucide-react";
import { StatusSummary } from "../types";

type StatusCardsProps = {
  status: StatusSummary;
};

const cardStyles = "rounded-2xl border border-slate-700/60 bg-panelSoft p-4 shadow-neon";

export function StatusCards({ status }: StatusCardsProps) {
  const unsafeRate = status.totalWorkers === 0 ? 0 : Math.round((status.unsafeWorkers / status.totalWorkers) * 100);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cardStyles}>
        <div className="flex items-center gap-2 text-slate-300"><Users className="h-4 w-4" /> Total Workers</div>
        <p className="mt-2 text-3xl font-bold text-white">{status.totalWorkers}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={cardStyles}>
        <div className="flex items-center gap-2 text-slate-300"><ShieldCheck className="h-4 w-4 text-safe" /> Safe Workers</div>
        <p className="mt-2 text-3xl font-bold text-safe">{status.safeWorkers}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className={cardStyles}>
        <div className="flex items-center gap-2 text-slate-300"><AlertTriangle className="h-4 w-4 text-danger" /> Unsafe Workers</div>
        <p className="mt-2 text-3xl font-bold text-danger">{status.unsafeWorkers}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} className={cardStyles}>
        <div className="text-slate-300">Risk Ratio</div>
        <p className="mt-2 text-3xl font-bold text-white">{unsafeRate}%</p>
      </motion.div>
    </div>
  );
}
