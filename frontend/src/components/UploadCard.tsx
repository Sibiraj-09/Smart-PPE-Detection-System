import { motion } from "framer-motion";
import { UploadCloud } from "lucide-react";

type UploadCardProps = {
  onFileSelect: (file: File) => void;
  loading: boolean;
};

export function UploadCard({ onFileSelect, loading }: UploadCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-700/60 bg-panelSoft p-5 shadow-neon"
    >
      <h2 className="text-xl font-semibold text-white">Upload Video</h2>
      <p className="mt-1 text-sm text-slate-400">MP4 recommended. Processing starts immediately after upload.</p>

      <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-accent/50 bg-black/20 p-6 text-slate-200 transition hover:border-accent hover:bg-black/30">
        <UploadCloud className="h-5 w-5 text-accent" />
        <span>{loading ? "Processing..." : "Choose CCTV video"}</span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onFileSelect(file);
            }
          }}
        />
      </label>
    </motion.div>
  );
}
