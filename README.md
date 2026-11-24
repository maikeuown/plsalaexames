# Exam Room Booking — Escola Secundária José Falcão

🇵🇹 [Versão portuguesa e guia completo de deploy](README.pt.md)

A small web app built for Escola Secundária José Falcão (Coimbra, Portugal). During exam season, rooms become free once the day's last exam ends. Teachers use this app to book one of 6 rooms in 1-hour slots for those free periods.

Teachers see every free slot in one place and book on a first-come, first-served basis, with no login needed. Staff manage bookings from an admin panel.

## Features

- **Booking page:** shows each exam day, which rooms are free after the last exam, and the 1-hour slots left until the end of the day.
- **Editable schedule:** exam days, rooms and end times live in `exam-schedule.json`. The file is reloaded on each request, so edits apply without a restart.
- **Admin panel** (`/admin`): list all bookings, delete one or all, and view statistics (total, per day, per room).
- **Zero cloud dependencies:** one Node.js process and one SQLite file, deployable on any small VPS or cPanel host.

## Tech stack

- **Back-end:** Node.js, Express, REST API
- **Database:** SQLite (`better-sqlite3`)
- **Front-end:** plain HTML, CSS and JavaScript (no framework)

## API

**Public**
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/schedule` | Exam calendar and rooms |
| GET | `/api/reservations` | List bookings |
| POST | `/api/reservations` | Create a booking |

**Admin** (requires the `x-admin-password` header)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/login` | Validate the password |
| GET | `/api/admin/reservations` | All bookings |
| DELETE | `/api/admin/reservations/:id` | Delete one booking |
| DELETE | `/api/admin/reservations` | Delete all bookings |
| GET | `/api/admin/stats` | Totals per day and per room |

The admin password is only accepted in the request header or body, never in the URL, so it can't leak into browser history or server logs. It is compared in constant time.

## Run locally

```bash
npm install
ADMIN_PASSWORD=change-me npm start
# booking page: http://localhost:3000
# admin panel:  http://localhost:3000/admin
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data.db` | SQLite file path |
| `ADMIN_PASSWORD` | (empty) | Admin password. If unset, `/admin` is disabled. |

## Deployment

Runs on a cPanel/AlmaLinux VPS using cPanel's built-in Node.js app support, with AutoSSL (Let's Encrypt) for HTTPS. The step-by-step guide (in Portuguese, for school staff) is in [README.pt.md](README.pt.md).
