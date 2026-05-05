import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type LEDStatus = "safe" | "unsafe" | "idle" | "scanning";

export function LEDStatusDisplay() {
  const [ledStatus, setLedStatus] = useState<LEDStatus>("idle");
  const [lastWorkerID, setLastWorkerID] = useState<string>("");
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    // Poll for real-time status every 500ms
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/led-status`);
        if (response.ok) {
          const data = await response.json();
          setLedStatus(data.status || "idle");
          setLastWorkerID(data.worker_id || "");
          
          // Add pulse effect for SAFE/UNSAFE
          if (data.status === "safe" || data.status === "unsafe") {
            setPulsing(true);
            setTimeout(() => setPulsing(false), 3000);
          }
        }
      } catch (err) {
        console.error("Failed to fetch LED status:", err);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (ledStatus) {
      case "safe":
        return "from-green-400 to-green-600";
      case "unsafe":
        return "from-red-400 to-red-600";
      case "scanning":
        return "from-yellow-400 to-yellow-600";
      default:
        return "from-slate-600 to-slate-800";
    }
  };

  const getStatusText = () => {
    switch (ledStatus) {
      case "safe":
        return "✓ SAFE";
      case "unsafe":
        return "⚠ UNSAFE";
      case "scanning":
        return "🔍 SCANNING RFID";
      default:
        return "⚪ IDLE";
    }
  };

  const getStatusLabel = () => {
    switch (ledStatus) {
      case "safe":
        return "Worker has full PPE";
      case "unsafe":
        return "Missing PPE or incomplete";
      case "scanning":
        return "Waiting for RFID card...";
      default:
        return "No active detection";
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-6 shadow-neon">
      <h2 className="text-xl font-semibold text-white mb-4">Live Status</h2>
      
      {/* LED Display */}
      <div className="flex flex-col items-center space-y-4">
        {/* LED Glow */}
        <motion.div
          className={`w-24 h-24 rounded-full bg-gradient-to-br ${getStatusColor()} shadow-lg`}
          animate={pulsing ? { scale: [1, 1.1, 1], boxShadow: ["0 0 20px currentColor", "0 0 40px currentColor", "0 0 20px currentColor"] } : {}}
          transition={{ duration: 0.8, repeat: pulsing ? Infinity : 0 }}
        />

        {/* Status Text */}
        <div className="text-center">
          <p className="text-2xl font-bold text-white mb-2">{getStatusText()}</p>
          <p className="text-slate-300 text-sm">{getStatusLabel()}</p>
          
          {lastWorkerID && (
            <p className="text-slate-400 text-xs mt-2">
              Worker: <span className="text-cyan-300 font-mono">{lastWorkerID}</span>
            </p>
          )}
        </div>

        {/* Status Indicator Bar */}
        <div className="w-full mt-4 space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Status</span>
            <span className="capitalize">{ledStatus}</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              className={`h-full bg-gradient-to-r ${getStatusColor()}`}
              initial={{ width: 0 }}
              animate={{ width: ledStatus === "idle" ? "20%" : "100%" }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* LED Indicators (Visual representation) */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {/* Red LED */}
        <div className="flex flex-col items-center">
          <div
            className={`w-6 h-6 rounded-full ${
              ledStatus === "unsafe" ? "bg-red-500 shadow-lg shadow-red-500" : "bg-slate-700"
            }`}
          />
          <p className="text-xs text-slate-400 mt-1">Red</p>
        </div>

        {/* Green LED */}
        <div className="flex flex-col items-center">
          <div
            className={`w-6 h-6 rounded-full ${
              ledStatus === "safe" ? "bg-green-500 shadow-lg shadow-green-500" : "bg-slate-700"
            }`}
          />
          <p className="text-xs text-slate-400 mt-1">Green</p>
        </div>

        {/* Yellow LED (Scanning) */}
        <div className="flex flex-col items-center">
          <div
            className={`w-6 h-6 rounded-full ${
              ledStatus === "scanning" ? "bg-yellow-500 shadow-lg shadow-yellow-500" : "bg-slate-700"
            }`}
          />
          <p className="text-xs text-slate-400 mt-1">Scanning</p>
        </div>
      </div>
    </div>
  );
}
