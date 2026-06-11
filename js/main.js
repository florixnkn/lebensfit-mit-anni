// Startseite: Daten laden, Kalender rendern, Animationen

document.getElementById("year").textContent = new Date().getFullYear();

// --- Navigation ---
const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 30);
});

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => navLinks.classList.remove("open"))
);

// --- Scroll-Reveal ---
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// --- Kursplan ---
async function loadSchedule() {
  const calendar = document.getElementById("calendar");
  try {
    const courses = await sbSelect(
      "courses?select=*,studios(name,website)&active=is.true&order=weekday.asc,start_time.asc"
    );
    // JS: getDay() => 0 = Sonntag; unsere Daten: 1 = Montag … 7 = Sonntag
    const todayWeekday = ((new Date().getDay() + 6) % 7) + 1;

    calendar.innerHTML = WEEKDAYS.map((name, i) => {
      const day = i + 1;
      const dayCourses = courses.filter((c) => c.weekday === day);
      const cards = dayCourses.length
        ? dayCourses
            .map(
              (c) => `
        <div class="course-card">
          <span class="time">${formatTime(c.start_time)} Uhr · ${c.duration_minutes} Min</span>
          ${escapeHtml(c.title)}
          ${c.studios ? `<span class="studio">📍 ${escapeHtml(c.studios.name)}</span>` : ""}
          ${c.note ? `<span class="note">${escapeHtml(c.note)}</span>` : ""}
        </div>`
            )
            .join("")
        : `<p class="calendar-empty">–</p>`;
      return `
        <div class="calendar-day${day === todayWeekday ? " today" : ""}">
          <h3>${name}</h3>
          <div class="day-courses">${cards}</div>
        </div>`;
    }).join("");
  } catch (err) {
    calendar.innerHTML = `<p>Der Kursplan konnte gerade nicht geladen werden. Bitte versuche es später erneut.</p>`;
    console.error(err);
  }
}

// --- Studios ---
async function loadStudios() {
  const grid = document.getElementById("studioGrid");
  try {
    const studios = await sbSelect("studios?select=*&order=name.asc");
    grid.innerHTML = studios
      .map(
        (s) => `
      <div class="studio-card">
        <span class="icon">🏋️</span>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.address || "")}</p>
        ${
          s.website
            ? `<a class="btn btn-ghost btn-small" href="${escapeHtml(s.website)}" target="_blank" rel="noopener noreferrer">Zur Studio-Website →</a>`
            : ""
        }
      </div>`
      )
      .join("");
  } catch (err) {
    grid.innerHTML = "<p>Studios konnten nicht geladen werden.</p>";
    console.error(err);
  }
}

// --- Bewertungen ---
async function loadReviews() {
  const grid = document.getElementById("reviewGrid");
  try {
    const reviews = await sbSelect(
      "reviews?select=author,rating,text&published=is.true&order=created_at.desc&limit=9"
    );
    if (!reviews.length) {
      grid.innerHTML = `<div class="review-card"><p class="review-text">Bald findest du hier die ersten Stimmen aus meinen Kursen!</p></div>`;
      return;
    }
    grid.innerHTML = reviews
      .map(
        (r) => `
      <div class="review-card">
        <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        <p class="review-text">„${escapeHtml(r.text)}“</p>
        <span class="review-author">– ${escapeHtml(r.author)}</span>
      </div>`
      )
      .join("");
  } catch (err) {
    grid.innerHTML = "<p>Bewertungen konnten nicht geladen werden.</p>";
    console.error(err);
  }
}

loadSchedule();
loadStudios();
loadReviews();
