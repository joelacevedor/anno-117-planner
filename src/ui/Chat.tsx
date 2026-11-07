import { useEffect, useRef, useState } from "react";
import { useChat } from "../sync/useChat";
import { previewBuild, syncAvailable } from "../sync/config";
import { useApp } from "./context";

/** Botón flotante y hoja de chat. Solo aparece en una partida compartida. */
export function Chat({ raised }: { raised: boolean }) {
  const { state } = useApp();
  if (!state.session || !syncAvailable) return null;
  return <ChatInner raised={raised} key={state.session.code} />;
}

function ChatInner({ raised }: { raised: boolean }) {
  const { state, sync, t, lang } = useApp();
  // En la versión de prueba, el chat solo se abre cuando la partida ya se ha comprobado como de prueba.
  const ready = !previewBuild || sync.status === "live" || sync.status === "offline";
  const chat = useChat(ready ? state.session?.code ?? null : null, state.session?.player ?? null);
  const sheet = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);

  // Pantalla completa: la página de detrás no se mueve, y el campo de escribir
  // sigue al teclado (en iPhone el teclado tapa la ventana en vez de encogerla).
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    Object.assign(body, { position: "fixed", top: `-${y}px`, width: "100%", overflow: "hidden" });
    const vv = window.visualViewport;
    const fit = () => {
      const d = sheet.current;
      if (!d || !vv) return;
      d.style.height = `${vv.height}px`;
      d.style.transform = `translateY(${vv.offsetTop}px)`;
      list.current?.scrollTo({ top: list.current.scrollHeight });
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      Object.assign(body, prev);
      window.scrollTo(0, y);
    };
  }, [open]);

  // Al tocar un aviso del chat, se abre directamente.
  useEffect(() => {
    const openIt = () => { sheet.current?.showModal(); setOpen(true); };
    if (new URLSearchParams(location.search).has("chat")) {
      history.replaceState(history.state, "", location.pathname);
      openIt();
    }
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "open-chat") openIt(); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);

  // Al abrir y con cada mensaje nuevo: abajo del todo y marcado como leído.
  useEffect(() => {
    if (!open) return;
    list.current?.scrollTo({ top: list.current.scrollHeight });
    chat.markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chat.messages.length]);

  const time = (at: number | null) =>
    at ? new Date(at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) : "…";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = text;
    if (!v.trim()) return;
    setText("");
    const ok = await chat.send(v);
    setFailed(!ok);
    if (!ok) setText(v);
  };

  return (
    <>
      <button type="button" className={`chat-fab${raised ? " raised" : ""}`} aria-label={chat.unread ? t("chatUnread", { n: chat.unread }) : t("chat")}
        onClick={() => { sheet.current?.showModal(); setOpen(true); }}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5h16v10H9l-4.5 3.5V15.5H4z" />
        </svg>
        {chat.unread > 0 && <span className="chat-badge" key={chat.unread}>{chat.unread > 9 ? "9+" : chat.unread}</span>}
      </button>

      <dialog ref={sheet} className="chat-screen" aria-label={t("chat")} onClose={() => setOpen(false)}>
        <div className="chat-head">
          <div>
            <h2>{t("chat")}</h2>
            {state.session && <small>{t("chatAs", { name: state.session.player })}</small>}
          </div>
          <button type="button" className="chat-close" onClick={() => sheet.current?.close()} aria-label={t("close")}>✕</button>
        </div>
        <div className="chat-list" ref={list} aria-live="polite">
          {chat.messages.length === 0 && <p className="chat-empty">{t("chatEmpty")}</p>}
          {chat.messages.map((m, i) => {
            const mine = m.uid === chat.me;
            const showName = !mine && chat.messages[i - 1]?.uid !== m.uid;
            return (
              <div key={m.id} className={`msg-row${mine ? " mine" : ""}`}>
                {showName && <span className="msg-name">{m.name}</span>}
                <p className="bubble">{m.text}<time>{time(m.at)}</time></p>
              </div>
            );
          })}
        </div>
        <form className="chat-form" onSubmit={submit}>
          <label className="sr" htmlFor="chat-input">{t("chatWrite")}</label>
          <input id="chat-input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={t("chatWrite")} autoComplete="off" enterKeyHint="send" />
          <button type="submit" className="primary" disabled={!text.trim()} aria-label={t("chatSend")}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 20.5 21 12 3 3.5l1.8 7.1L14 12l-9.2 1.4z" /></svg>
          </button>
        </form>
        {failed && <p className="msg error chat-error" role="alert">{t("chatFailed")}</p>}
      </dialog>
    </>
  );
}
