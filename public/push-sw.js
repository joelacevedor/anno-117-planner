/* Avisos del chat (Web Push). Lo carga el service worker de la app. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Praefectus";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || "chat",
    renotify: true,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: self.registration.scope + "?chat=1" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { c.postMessage({ type: "open-chat" }); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
