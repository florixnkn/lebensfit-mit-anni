// Admin-Bereich: Login + Verwaltung von Terminen, Bewertungen, Studios
// Das Passwort wird nur im sessionStorage des Browsers gehalten und bei
// jeder Schreibaktion serverseitig (bcrypt, mit Sperre) geprüft.

const SESSION_KEY = "lebensfit_admin_pw";

const loginView = document.getElementById("loginView");
const dashView = document.getElementById("dashView");
const loginMsg = document.getElementById("loginMsg");
const dashMsg = document.getElementById("dashMsg");

let studiosCache = [];

function getPw() {
  return sessionStorage.getItem(SESSION_KEY) || "";
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = "admin-msg " + (ok ? "ok" : "err");
  if (ok) setTimeout(() => (el.className = "admin-msg"), 3500);
}

// ---------- Login ----------

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("loginBtn");
  const pw = document.getElementById("loginPassword").value.trim();
  btn.disabled = true;
  btn.textContent = "Prüfe …";
  try {
    await sbAdminRpc("admin_verify", { p_password: pw });
    sessionStorage.setItem(SESSION_KEY, pw);
    enterDashboard();
  } catch (err) {
    showMsg(loginMsg, err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Anmelden";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

async function enterDashboard() {
  loginView.hidden = true;
  dashView.hidden = false;
  await loadStudiosAdmin();
  await Promise.all([loadCoursesAdmin(), loadReviewsAdmin()]);
}

// Auto-Login, wenn Passwort noch in der Session liegt
if (getPw()) {
  sbAdminRpc("admin_verify", { p_password: getPw() })
    .then(enterDashboard)
    .catch(() => sessionStorage.removeItem(SESSION_KEY));
}

// ---------- Tabs ----------

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
  });
});

// ---------- Termine ----------

const weekdaySelect = document.getElementById("courseWeekday");
weekdaySelect.innerHTML = WEEKDAYS.map((d, i) => `<option value="${i + 1}">${d}</option>`).join("");

async function loadCoursesAdmin() {
  const list = document.getElementById("courseList");
  list.innerHTML = '<span class="spin"></span>';
  try {
    const courses = await sbSelect("courses?select=*,studios(name)&order=weekday.asc,start_time.asc");
    list.innerHTML = courses.length
      ? courses
          .map(
            (c) => `
      <div class="admin-item${c.active ? "" : " inactive"}">
        <div class="meta">
          <strong>${WEEKDAYS[c.weekday - 1]}, ${formatTime(c.start_time)} Uhr</strong> – ${escapeHtml(c.title)} (${c.duration_minutes} Min)
          <small>${c.studios ? escapeHtml(c.studios.name) : "Kein Studio"}${c.note ? " · " + escapeHtml(c.note) : ""}${c.active ? "" : " · PAUSIERT"}</small>
        </div>
        <div class="admin-actions">
          <button class="btn btn-ghost btn-small" data-edit-course="${c.id}">Bearbeiten</button>
          <button class="btn btn-danger btn-small" data-del-course="${c.id}">Löschen</button>
        </div>
      </div>`
          )
          .join("")
      : "<p>Noch keine Termine angelegt.</p>";

    list.querySelectorAll("[data-edit-course]").forEach((b) =>
      b.addEventListener("click", () => fillCourseForm(courses.find((c) => c.id === b.dataset.editCourse)))
    );
    list.querySelectorAll("[data-del-course]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Diesen Termin wirklich löschen?")) return;
        try {
          await sbAdminRpc("admin_delete_course", { p_password: getPw(), p_id: b.dataset.delCourse });
          showMsg(dashMsg, "Termin gelöscht.", true);
          loadCoursesAdmin();
        } catch (err) {
          showMsg(dashMsg, err.message, false);
        }
      })
    );
  } catch (err) {
    list.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}

function fillCourseForm(c) {
  document.getElementById("courseFormTitle").textContent = "Termin bearbeiten";
  document.getElementById("courseId").value = c.id;
  document.getElementById("courseTitle").value = c.title;
  document.getElementById("courseWeekday").value = c.weekday;
  document.getElementById("courseTime").value = formatTime(c.start_time);
  document.getElementById("courseDuration").value = c.duration_minutes;
  document.getElementById("courseStudio").value = c.studio_id || "";
  document.getElementById("courseNote").value = c.note || "";
  document.getElementById("courseActive").value = String(c.active);
  document.getElementById("panel-courses").scrollIntoView({ behavior: "smooth" });
}

function resetCourseForm() {
  document.getElementById("courseForm").reset();
  document.getElementById("courseId").value = "";
  document.getElementById("courseTitle").value = "Indoor Cycling";
  document.getElementById("courseDuration").value = 60;
  document.getElementById("courseFormTitle").textContent = "Neuer Termin";
}
document.getElementById("courseReset").addEventListener("click", resetCourseForm);

document.getElementById("courseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await sbAdminRpc("admin_save_course", {
      p_password: getPw(),
      p_id: document.getElementById("courseId").value || null,
      p_title: document.getElementById("courseTitle").value.trim(),
      p_weekday: Number(document.getElementById("courseWeekday").value),
      p_start_time: document.getElementById("courseTime").value,
      p_duration: Number(document.getElementById("courseDuration").value),
      p_studio_id: document.getElementById("courseStudio").value || null,
      p_note: document.getElementById("courseNote").value.trim() || null,
      p_active: document.getElementById("courseActive").value === "true",
    });
    showMsg(dashMsg, "Termin gespeichert.", true);
    resetCourseForm();
    loadCoursesAdmin();
  } catch (err) {
    showMsg(dashMsg, err.message, false);
  }
});

// ---------- Bewertungen ----------

async function loadReviewsAdmin() {
  const list = document.getElementById("reviewList");
  list.innerHTML = '<span class="spin"></span>';
  try {
    const reviews = await sbAdminRpc("admin_list_reviews", { p_password: getPw() });
    list.innerHTML = reviews.length
      ? reviews
          .map(
            (r) => `
      <div class="admin-item${r.published ? "" : " inactive"}">
        <div class="meta">
          <strong>${escapeHtml(r.author)}</strong> – ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}
          <small>${escapeHtml(r.text)}</small>
        </div>
        <div class="admin-actions">
          <button class="btn btn-ghost btn-small" data-edit-review="${r.id}">Bearbeiten</button>
          <button class="btn btn-danger btn-small" data-del-review="${r.id}">Löschen</button>
        </div>
      </div>`
          )
          .join("")
      : "<p>Noch keine Bewertungen angelegt.</p>";

    list.querySelectorAll("[data-edit-review]").forEach((b) =>
      b.addEventListener("click", () => fillReviewForm(reviews.find((r) => r.id === b.dataset.editReview)))
    );
    list.querySelectorAll("[data-del-review]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Diese Bewertung wirklich löschen?")) return;
        try {
          await sbAdminRpc("admin_delete_review", { p_password: getPw(), p_id: b.dataset.delReview });
          showMsg(dashMsg, "Bewertung gelöscht.", true);
          loadReviewsAdmin();
        } catch (err) {
          showMsg(dashMsg, err.message, false);
        }
      })
    );
  } catch (err) {
    list.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}

function fillReviewForm(r) {
  document.getElementById("reviewFormTitle").textContent = "Bewertung bearbeiten";
  document.getElementById("reviewId").value = r.id;
  document.getElementById("reviewAuthor").value = r.author;
  document.getElementById("reviewRating").value = r.rating;
  document.getElementById("reviewText").value = r.text;
  document.getElementById("reviewPublished").value = String(r.published);
}

function resetReviewForm() {
  document.getElementById("reviewForm").reset();
  document.getElementById("reviewId").value = "";
  document.getElementById("reviewFormTitle").textContent = "Neue Bewertung";
}
document.getElementById("reviewReset").addEventListener("click", resetReviewForm);

document.getElementById("reviewForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await sbAdminRpc("admin_save_review", {
      p_password: getPw(),
      p_id: document.getElementById("reviewId").value || null,
      p_author: document.getElementById("reviewAuthor").value.trim(),
      p_rating: Number(document.getElementById("reviewRating").value),
      p_text: document.getElementById("reviewText").value.trim(),
      p_published: document.getElementById("reviewPublished").value === "true",
    });
    showMsg(dashMsg, "Bewertung gespeichert.", true);
    resetReviewForm();
    loadReviewsAdmin();
  } catch (err) {
    showMsg(dashMsg, err.message, false);
  }
});

// ---------- Studios ----------

async function loadStudiosAdmin() {
  const list = document.getElementById("studioList");
  const select = document.getElementById("courseStudio");
  try {
    studiosCache = await sbSelect("studios?select=*&order=name.asc");
    select.innerHTML =
      '<option value="">– Kein Studio –</option>' +
      studiosCache.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

    list.innerHTML = studiosCache.length
      ? studiosCache
          .map(
            (s) => `
      <div class="admin-item">
        <div class="meta">
          <strong>${escapeHtml(s.name)}</strong>
          <small>${escapeHtml(s.address || "")}${s.website ? " · " + escapeHtml(s.website) : ""}</small>
        </div>
        <div class="admin-actions">
          <button class="btn btn-ghost btn-small" data-edit-studio="${s.id}">Bearbeiten</button>
          <button class="btn btn-danger btn-small" data-del-studio="${s.id}">Löschen</button>
        </div>
      </div>`
          )
          .join("")
      : "<p>Noch keine Studios angelegt.</p>";

    list.querySelectorAll("[data-edit-studio]").forEach((b) =>
      b.addEventListener("click", () => fillStudioForm(studiosCache.find((s) => s.id === b.dataset.editStudio)))
    );
    list.querySelectorAll("[data-del-studio]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Dieses Studio wirklich löschen? Termine behalten dann kein Studio.")) return;
        try {
          await sbAdminRpc("admin_delete_studio", { p_password: getPw(), p_id: b.dataset.delStudio });
          showMsg(dashMsg, "Studio gelöscht.", true);
          loadStudiosAdmin();
          loadCoursesAdmin();
        } catch (err) {
          showMsg(dashMsg, err.message, false);
        }
      })
    );
  } catch (err) {
    list.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}

function fillStudioForm(s) {
  document.getElementById("studioFormTitle").textContent = "Studio bearbeiten";
  document.getElementById("studioId").value = s.id;
  document.getElementById("studioName").value = s.name;
  document.getElementById("studioAddress").value = s.address || "";
  document.getElementById("studioWebsite").value = s.website || "";
}

function resetStudioForm() {
  document.getElementById("studioForm").reset();
  document.getElementById("studioId").value = "";
  document.getElementById("studioFormTitle").textContent = "Neues Studio";
}
document.getElementById("studioReset").addEventListener("click", resetStudioForm);

document.getElementById("studioForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await sbAdminRpc("admin_save_studio", {
      p_password: getPw(),
      p_id: document.getElementById("studioId").value || null,
      p_name: document.getElementById("studioName").value.trim(),
      p_address: document.getElementById("studioAddress").value.trim() || null,
      p_website: document.getElementById("studioWebsite").value.trim() || null,
    });
    showMsg(dashMsg, "Studio gespeichert.", true);
    resetStudioForm();
    loadStudiosAdmin();
  } catch (err) {
    showMsg(dashMsg, err.message, false);
  }
});

// ---------- Passwort ----------

document.getElementById("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pwNew = document.getElementById("pwNew").value.trim();
  if (pwNew !== document.getElementById("pwNew2").value.trim()) {
    showMsg(dashMsg, "Die neuen Passwörter stimmen nicht überein.", false);
    return;
  }
  try {
    await sbAdminRpc("admin_change_password", {
      p_old: document.getElementById("pwOld").value.trim(),
      p_new: pwNew,
    });
    sessionStorage.setItem(SESSION_KEY, pwNew);
    document.getElementById("passwordForm").reset();
    showMsg(dashMsg, "Passwort geändert. Es gilt ab sofort.", true);
  } catch (err) {
    showMsg(dashMsg, err.message, false);
  }
});
