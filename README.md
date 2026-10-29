# PUBGMI Bot

> Private YouTube Stream Management Bot for the PUBGMI channel.

A full-stack bot system that manages live chat, viewer loyalty, squad queues, giveaways, analytics, stream alerts, and more — controlled from a professional web dashboard and Telegram.

---

## What This Bot Does

- Manages YouTube live chat moderation in real time across 2 accounts
- Tracks viewer loyalty with SP/XP rank system (official PUBG Mobile ranks: Bronze → Conqueror)
- Runs chat games, giveaways, predictions, squad queues, and mini-games
- Controls everything remotely from Telegram @PUBGMIROBOT
- Stores all stream data, subscribers, donators, chat history, and clips
- Auto-detects streams and new videos — always online, zero manual startup
- Provides a dark/light glassmorphism dashboard at pubgmi.vercel.app
- Sends auto-guide messages to viewers every X minutes explaining bot commands
- Translates non-English messages instantly using MyMemory (free, no key)
- Marks stream moments from dashboard, Telegram, keyboard, chat, or viewer votes

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Backend     | Node.js + Express (Railway)         |
| Frontend    | React + TailwindCSS (Vercel)        |
| Database    | PostgreSQL + Redis (Railway)        |
| Real-time   | Socket.io WebSockets                |
| Auth        | Telegram OAuth + JWT + httpOnly cookies |
| YouTube     | YouTube Data API v3 (free)          |
| Translation | MyMemory API (free, no key needed)  |
| Telegram    | node-telegram-bot-api               |
| Push        | YouTube WebSub (PubSubHubbub)       |

**Total monthly cost: $0**

---

## Project Structure

```
pubgmi-bot/
├── backend/
│   ├── src/
│   │   ├── config/          # Database, Redis, YouTube OAuth clients
│   │   ├── controllers/     # Request handlers
│   │   ├── middleware/      # Auth, session manager, maintenance
│   │   ├── models/          # Data models
│   │   ├── routes/          # All API routes
│   │   ├── services/        # Core business logic
│   │   │   ├── youtubeService.js     # Stream polling, chat reading
│   │   │   ├── chatService.js        # Moderation, commands, SP awards
│   │   │   ├── spService.js          # Full rank and SP/XP system
│   │   │   ├── notificationService.js
│   │   │   ├── translationService.js # MyMemory integration
│   │   │   ├── botGuideService.js    # Auto usage guide messages
│   │   │   ├── websubService.js      # YouTube push notifications
│   │   │   └── watchdogService.js    # Auto-recovery
│   │   ├── telegram/
│   │   │   └── bot.js               # Full @PUBGMIROBOT implementation
│   │   └── utils/
│   │       └── logger.js
│   ├── migrations/
│   │   ├── run.js           # Creates all 35+ database tables
│   │   └── seed.js          # Default commands, settings, rewards
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── layout/      # DashboardLayout, sidebar, topbar
│   │   ├── pages/
│   │   │   ├── auth/        # LoginPage (Telegram OAuth)
│   │   │   ├── errors/      # 403, 404, 500, session pages
│   │   │   ├── Home.jsx     # Main dashboard overview
│   │   │   └── ...          # All 20+ dashboard pages
│   │   ├── styles/
│   │   │   └── globals.css  # Glassmorphism, animations, rank colors
│   │   └── App.jsx          # Router, auth context, socket
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── docs/
│   └── DEPLOYMENT.md
└── README.md
```

---

## Key Features

### SP & Rank System
- Official PUBG Mobile ranks: Bronze V → Conqueror
- Conqueror is reserved for top 10 viewers at all times
- SP (Stream Points) — spendable currency
- XP (Experience Points) — permanent rank progression
- Season resets (full or soft) with champion rewards

### Security
- Telegram OAuth login — no passwords
- Unique session per login (UUID + fingerprint + timestamp)
- One active session per user — new login kills old session
- Unauthorized Telegram users receive zero response
- JWT stored in httpOnly cookies
- Full audit trail

### Always Online
- 3-layer crash protection (Railway + watchdog + process handlers)
- YouTube stream detected within 60 seconds of going live
- New videos detected instantly via WebSub push notifications
- API quota managed automatically — self-heals when low

---

## Quick Start

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete setup instructions.

```bash
# Backend
cd backend
cp .env.example .env
# Fill in all values in .env
npm install
npm run migrate
npm run seed
npm start

# Frontend
cd frontend
cp .env.example .env
# Fill in all values in .env
npm install
npm run dev
```

---

## Telegram Bot

Bot name: **PUBGMI**
Username: **@PUBGMIROBOT**

Only users whose Telegram IDs are in `AUTHORIZED_TELEGRAM_IDS` can interact with the bot.
All other users are completely ignored — no response, no acknowledgement.

Key commands: `/menu` `/live` `/queue` `/giveaway` `/clip` `/stats` `/status` `/ping`

---

## Dashboard

URL: `https://pubgmi.vercel.app`

Login with Telegram — one click, no password.
Secured by authorized Telegram ID check + unique session tokens.

---

## License

Private — PUBGMI channel use only.
