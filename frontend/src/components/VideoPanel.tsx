import { useEffect, useState } from "react";

type VideoPanelProps = {
  videoUrl: string | null;
};

export function VideoPanel({ videoUrl }: VideoPanelProps) {
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    setPlaybackError(null);
  }, [videoUrl]);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-panelSoft p-5 shadow-neon">
      <h2 className="text-xl font-semibold text-white">Processed Output</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-black">
        {videoUrl ? (
          <video
            key={videoUrl}
            controls
            preload="auto"
            className="max-h-[420px] w-full"
            onError={() => setPlaybackError("Unable to play processed video. Please upload again.")}
          >
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support MP4 playback.
          </video>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-slate-400">
            Processed video appears here after upload.
          </div>
        )}
      </div>
      {playbackError && <p className="mt-2 text-sm text-danger">{playbackError}</p>}
    </div>
  );
}
