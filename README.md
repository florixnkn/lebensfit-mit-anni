# Lebensfit mit Anni 🚴

Website der selbstständigen Cycling-Trainerin **Antje Kindler** aus Neufahrn b. Freising.

**Live:** https://florixnkn.github.io/lebensfit-mit-anni/

## Aufbau

- Statische Website (HTML/CSS/JS) – gehostet auf **GitHub Pages**
- Daten (Kurszeiten, Studios, Bewertungen) aus **Supabase** (PostgREST)
- Admin-Bereich unter `/admin/` – passwortgeschützt

## Sicherheitsmodell

- Im Frontend wird **nur der Publishable Key** verwendet (dafür gemacht, öffentlich zu sein).
- **Row Level Security**: Öffentlich ist nur Lesen erlaubt (Kurse, Studios, veröffentlichte Bewertungen).
- Alle Schreibzugriffe laufen über **Postgres-Funktionen (SECURITY DEFINER)**, die das
  Admin-Passwort **serverseitig** gegen einen bcrypt-Hash prüfen – inkl. Sperre nach
  5 Fehlversuchen (15 Minuten).
- Der Passwort-Hash liegt in `admin_settings` und ist über die API **nicht lesbar**.
- ⚠️ Der **Secret Key** gehört niemals in dieses Repository oder in den Frontend-Code.

## Einrichtung (einmalig)

1. In Supabase den **SQL Editor** öffnen.
2. Den Inhalt von [`supabase/setup.sql`](supabase/setup.sql) einfügen und ausführen.
3. `https://…/admin/` öffnen, mit dem Startpasswort `lebensfit-start` anmelden
   und **sofort unter „🔑 Passwort" ein eigenes Passwort setzen**.

## Offene Punkte vor Go-Live

- [ ] USt-Hinweis im Impressum prüfen (Kleinunternehmerregelung ja/nein)
- [ ] Startpasswort ändern
