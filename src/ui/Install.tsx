import { useEffect, useState } from "react";
import { useApp } from "./context";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined")
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    listeners.forEach((f) => f());
  });

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    window.addEventListener("appinstalled", f);
    return () => { listeners.delete(f); window.removeEventListener("appinstalled", f); };
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIOS(),
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      force((n) => n + 1);
    },
  };
}

/** Tarjeta "Instalar en el móvil": botón en Android/Chrome, pasos en iPhone y en el resto. */
export function InstallCard({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const { t } = useApp();
  const inst = useInstall();
  if (inst.installed || import.meta.env.MODE === "single") return null;
  return (
    <div className={`card install${compact ? " compact" : ""}`}>
      <div className="install-head">
        <img src="./icon-192.png" alt="" width={40} height={40} />
        <div>
          <b>{t("installTitle")}</b>
          <small>{t("installWhy")}</small>
        </div>
        {onClose && <button type="button" className="x" onClick={onClose} aria-label={t("close")}>×</button>}
      </div>
      {inst.canPrompt ? (
        <button type="button" className="primary" onClick={inst.prompt}>{t("installNow")}</button>
      ) : inst.ios ? (
        <ol className="steps">
          <li>{t("iosStep1")} <span className="share-ico" aria-hidden="true">⬆︎</span></li>
          <li>{t("iosStep2")}</li>
          <li>{t("iosStep3")}</li>
        </ol>
      ) : (
        <p className="fine">{t("installOther")}</p>
      )}
    </div>
  );
}
