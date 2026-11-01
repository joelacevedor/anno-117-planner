import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "./controller";
import { syncAvailable } from "./config";
import { getBackend } from "./useSync";
import { notifyOthers } from "./push";

const readKey = (code: string) => `anno117-chat-read:${code}`;

/** Chat de la partida compartida: mensajes, enviar y cuántos hay sin leer. */
export function useChat(code: string | null, player: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState("");
  const [lastRead, setLastRead] = useState(0);

  useEffect(() => {
    setMessages([]);
    if (!code || !syncAvailable) return;
    try { setLastRead(Number(localStorage.getItem(readKey(code))) || 0); } catch { setLastRead(0); }
    let off: (() => void) | undefined;
    let alive = true;
    void getBackend().then(async (b) => {
      const id = await b.uid();
      if (!alive || !b.chatSubscribe) return;
      setMe(id);
      off = b.chatSubscribe(code, setMessages);
    }).catch(() => {});
    return () => { alive = false; off?.(); };
  }, [code]);

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!code || !player || !clean) return false;
    try {
      const b = await getBackend();
      await b.chatSend?.(code, { uid: await b.uid(), name: player, text: clean });
      void notifyOthers(code, player, clean);
      return true;
    } catch { return false; }
  }, [code, player]);

  const markRead = useCallback(() => {
    if (!code) return;
    const now = Date.now();
    setLastRead(now);
    try { localStorage.setItem(readKey(code), String(now)); } catch { /* opcional */ }
  }, [code]);

  const unread = useMemo(
    () => messages.filter((m) => m.uid !== me && (m.at ?? Date.now()) > lastRead).length,
    [messages, me, lastRead],
  );

  return { available: !!code && syncAvailable, messages, me, send, unread, markRead };
}
