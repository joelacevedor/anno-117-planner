import { useState } from "react";
import { disablePush, enablePush, needsInstall, pushEnabled, pushSupported } from "../sync/push";
import { useApp } from "./context";

/** Activar o desactivar los avisos del chat en este móvil. */
export function PushToggle() {
  const { state, t } = useApp();
  const code = state.session?.code;
  const [on, setOn] = useState(() => !!code && pushEnabled(code));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!code || !state.session) return null;
  if (!pushSupported()) return needsInstall() ? <p className="fine">{t("pushInstallFirst")}</p> : null;
  if (needsInstall()) return <p className="fine">{t("pushInstallFirst")}</p>;

  const toggle = async () => {
    setBusy(true); setMsg(null);
    if (on) { await disablePush(code); setOn(false); }
    else {
      const r = await enablePush(code, state.session!.player);
      setOn(r === "ok");
      if (r === "denied") setMsg(t("pushDenied"));
      if (r === "error") setMsg(t("pushError"));
    }
    setBusy(false);
  };

  return (
    <div className="push-toggle">
      <label className="switch-row">
        <span><b>{t("pushTitle")}</b><small>{t("pushHelp")}</small></span>
        <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={toggle} />
      </label>
      {msg && <p className="msg error" role="alert">{msg}</p>}
    </div>
  );
}
