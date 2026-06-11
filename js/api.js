// Kleine Hilfsschicht für die Supabase REST-API (PostgREST)

async function sbRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `Fehler ${res.status}`;
    try {
      const body = await res.json();
      if (body.message) msg = body.message;
    } catch (_) { /* Body war kein JSON */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function sbSelect(query) {
  return sbRequest(query, { method: "GET" });
}

function sbRpc(fn, args) {
  return sbRequest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
}

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function formatTime(t) {
  // "18:30:00" -> "18:30"
  return t ? t.slice(0, 5) : "";
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}
