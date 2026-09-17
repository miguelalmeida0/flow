import { useEffect, useState } from "react";
import { getStudioMedia, mediaObjectUrl, subscribeStudioMedia } from "./mediaRepository";

export type MediaReadState = "recording" | "finalizing" | "persisted" | "recovering" | "missing" | "failed";

export function useStudioMediaUrl(assetId?: string, activeState?: "recording" | "finalizing") {
  const [url, setUrl] = useState<string>();
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState<MediaReadState>("recovering");
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    let generation = 0;
    setUrl(undefined); setMissing(false); setState(activeState ?? "recovering");
    if (!assetId) return;
    const refresh = () => {
      const request = ++generation;
      if (activeState) return; // In-flight chunks are not a missing persisted file.
      void getStudioMedia(assetId).then((blob) => {
        if (!active || request !== generation) return;
        if (!blob) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = undefined; setUrl(undefined); setMissing(true); setState("missing"); return;
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = mediaObjectUrl(blob); setUrl(objectUrl); setMissing(false); setState("persisted");
      }).catch(() => { if (active && request === generation) { setMissing(false); setState("failed"); } });
    };
    const unsubscribe = subscribeStudioMedia(assetId, refresh);
    refresh();
    return () => { active = false; unsubscribe(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId, activeState]);
  return { url, missing, state };
}
