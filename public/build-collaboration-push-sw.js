self.addEventListener("push", (event) => {
  const fallback = {
    actionHref: "/backoffice",
    body: "A Build collaboration update is ready.",
    title: "DrawFlow Build update",
  };
  let payload = fallback;
  try {
    payload = { ...fallback, ...(event.data?.json() ?? {}) };
  } catch {
    payload = fallback;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { actionHref: payload.actionHref },
      icon: "/favicon.ico",
      tag: payload.tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const actionHref = event.notification.data?.actionHref ?? "/backoffice";
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.includes(actionHref)
        );
        return existing
          ? existing.focus()
          : self.clients.openWindow(new URL(actionHref, self.location.origin));
      })
  );
});
