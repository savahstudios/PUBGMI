# PUBGMI Bot — Complete Deployment Guide

Step-by-step instructions to deploy, authorize, and connect everything.

---

## PREREQUISITES CHECKLIST

Before starting, have all of these ready:

- [ ] Google account for YouTube channel (PUBGMI)
- [ ] Separate Google account to use as the bot account
- [ ] Railway account — railway.app (free)
- [ ] Vercel account — vercel.com (free)
- [ ] Telegram account with @PUBGMIROBOT already created via @BotFather
- [ ] Your Telegram numeric user ID (get it from t.me/userinfobot)
- [ ] GitHub account to host the code

---

## STEP 1 — Create the Bot Google Account

This is the account that appears in your live chat when the bot posts messages.

1. Go to **accounts.google.com**
2. Click **Create account**
3. Use a name like: `pubgmibotofficial@gmail.com`
4. Complete account setup
5. Go to **youtube.com** and sign in with this new account
6. Click your avatar → **Create a channel**
7. Name it: **PUBGMI Bot** (this name shows in your chat)
8. Note down this bot account's email — you will need it in Step 4

---

## STEP 2 — Google Cloud Console Setup

### 2a. Create Project

1. Go to **console.cloud.google.com**
2. Click **Select a project** at the top → **New Project**
3. Name: `pubgmi-bot`
4. Click **Create**
5. Make sure the new project is selected

### 2b. Enable YouTube Data API v3

1. In left sidebar: **APIs & Services** → **Library**
2. Search: `YouTube Data API v3`
3. Click the result → Click **Enable**

### 2c. Configure OAuth Consent Screen

1. **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → Click **Create**
3. App name: `PUBGMI Bot`
4. User support email: your Gmail
5. Developer contact email: your Gmail
6. Click **Save and Continue** through all steps
7. On **Test users** screen — add both your Gmail accounts
8. Click **Save and Continue** → **Back to Dashboard**

### 2d. Create OAuth Credentials for Main Channel (Account 1)

1. **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `PUBGMI Main Channel`
5. Authorized redirect URIs — click **+ Add URI**:
   - `https://your-app.railway.app/auth/callback`
   - `http://localhost:3000/auth/callback`
6. Click **Create**
7. **Download the JSON** or note the Client ID and Client Secret
8. Label these: `YOUTUBE_CLIENT_ID_1` and `YOUTUBE_CLIENT_SECRET_1`

### 2e. Create OAuth Credentials for Account 2

1. Repeat Step 2d exactly
2. Name it: `PUBGMI Second Channel`
3. Same redirect URIs
4. Label these: `YOUTUBE_CLIENT_ID_2` and `YOUTUBE_CLIENT_SECRET_2`

### 2f. Create OAuth Credentials for Bot Account

1. Repeat Step 2d exactly
2. Name it: `PUBGMI Bot Account`
3. Same redirect URIs
4. Label these: `BOT_CLIENT_ID` and `BOT_CLIENT_SECRET`

### 2g. Create API Key

1. **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **API Key**
3. Copy the key — label it: `YOUTUBE_API_KEY`
4. Click **Edit API Key** (pencil icon)
5. Under **API restrictions** → select **Restrict key**
6. Choose: **YouTube Data API v3**
7. Click **Save**

---

## STEP 3 — Set Up Railway

### 3a. Create Railway Account

1. Go to **railway.app**
2. Sign up with GitHub

### 3b. Push Code to GitHub

1. Create a new repository on github.com named `pubgmi-bot`
2. In the `pubgmi-bot` folder on your computer:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/pubgmi-bot.git
   git push -u origin main
   ```

### 3c. Create Railway Project

1. In Railway → **New Project**
2. **Deploy from GitHub repo**
3. Connect GitHub → select `pubgmi-bot`
4. Set root directory to: `backend`
5. Railway will detect Node.js automatically

### 3d. Add PostgreSQL Database

1. In your Railway project → click **+ New**
2. Select **Database** → **Add PostgreSQL**
3. Click on the PostgreSQL service → **Connect** tab
4. Copy the `DATABASE_URL` value — save it

### 3e. Add Redis Database

1. In your Railway project → click **+ New**
2. Select **Database** → **Add Redis**
3. Click on the Redis service → **Connect** tab
4. Copy the `REDIS_URL` value — save it

### 3f. Set Environment Variables

1. Click on your backend service in Railway
2. Click **Variables** tab
3. Click **Raw Editor** and paste all variables:

```env
NODE_ENV=production
PORT=3000

# Generate these with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=PASTE_64_CHAR_RANDOM_STRING_HERE
SESSION_SALT=PASTE_ANOTHER_64_CHAR_RANDOM_STRING_HERE
COOKIE_SECRET=PASTE_ANOTHER_32_CHAR_RANDOM_STRING_HERE

DATABASE_URL=PASTE_FROM_RAILWAY_POSTGRESQL
REDIS_URL=PASTE_FROM_RAILWAY_REDIS

YOUTUBE_CLIENT_ID_1=PASTE_FROM_STEP_2D
YOUTUBE_CLIENT_SECRET_1=PASTE_FROM_STEP_2D
YOUTUBE_REFRESH_TOKEN_1=FILL_IN_AFTER_STEP_5

YOUTUBE_CLIENT_ID_2=PASTE_FROM_STEP_2E
YOUTUBE_CLIENT_SECRET_2=PASTE_FROM_STEP_2E
YOUTUBE_REFRESH_TOKEN_2=FILL_IN_AFTER_STEP_5

BOT_CLIENT_ID=PASTE_FROM_STEP_2F
BOT_CLIENT_SECRET=PASTE_FROM_STEP_2F
BOT_REFRESH_TOKEN=FILL_IN_AFTER_STEP_4

YOUTUBE_API_KEY=PASTE_FROM_STEP_2G

TELEGRAM_BOT_TOKEN=PASTE_FROM_BOTFATHER
AUTHORIZED_TELEGRAM_IDS=YOUR_NUMERIC_TELEGRAM_ID

FRONTEND_URL=https://pubgmi.vercel.app
BACKEND_URL=https://your-app.railway.app

WEBSUB_SECRET=PASTE_RANDOM_STRING_HERE
WEBSUB_CALLBACK_URL=https://your-app.railway.app/webhooks/youtube

MAINTENANCE_MODE=false
BOT_GUIDE_INTERVAL=600

YOUTUBE_CHANNEL_ID_1=UCxxxxxxxxxxxxxxxxxxxxxxxx
YOUTUBE_CHANNEL_ID_2=UCxxxxxxxxxxxxxxxxxxxxxxxx
```

> To get your channel IDs: go to your YouTube channel → click About → Share → Copy Channel ID

4. Click **Save**

### 3g. Get Your Railway App URL

1. Click on your backend service
2. Go to **Settings** tab → **Domains**
3. Click **Generate Domain**
4. Copy the URL (looks like: `pubgmi-bot-production.up.railway.app`)
5. Update `BACKEND_URL` in your environment variables with this URL
6. Also update the OAuth redirect URIs in Google Cloud Console (Step 2d) with this URL

---

## STEP 4 — Authorize Bot Account with OAuth

This connects the bot Google account so it can post messages in your chat.

1. Make sure your Railway backend is deployed and running
2. Open your browser and visit:
   ```
   https://your-app.railway.app/auth/bot/authorize
   ```
3. You will be redirected to Google sign-in
4. **IMPORTANT: Sign in with your BOT Google account** (pubgmibotofficial@gmail.com)
   - NOT your main channel account
5. Click **Allow** on all permission screens
6. You will see a page showing your `BOT_REFRESH_TOKEN`
7. Copy that token
8. Go to Railway → Variables → add:
   ```
   BOT_REFRESH_TOKEN=PASTE_THE_TOKEN_HERE
   ```
9. Railway will redeploy automatically

---

## STEP 5 — Authorize Main YouTube Accounts

### Authorize Account 1 (PUBGMI main channel)

1. Visit:
   ```
   https://your-app.railway.app/auth/channel/1/authorize
   ```
2. **IMPORTANT: Sign in with your MAIN PUBGMI YouTube account**
3. Grant ALL permissions when asked:
   - YouTube access
   - YouTube Force SSL (required for live chat)
4. You will see the `YOUTUBE_REFRESH_TOKEN_1` on screen
5. Copy it → Railway → Variables:
   ```
   YOUTUBE_REFRESH_TOKEN_1=PASTE_THE_TOKEN_HERE
   ```

### Authorize Account 2

1. Visit:
   ```
   https://your-app.railway.app/auth/channel/2/authorize
   ```
2. **Sign in with your SECOND YouTube account**
3. Grant all permissions
4. Copy the `YOUTUBE_REFRESH_TOKEN_2` → Railway → Variables:
   ```
   YOUTUBE_REFRESH_TOKEN_2=PASTE_THE_TOKEN_HERE
   ```

---

## STEP 6 — Add Bot as YouTube Managing Moderator

**This is required for the bot to delete messages and ban/timeout users.**
Without this, the bot can only read and post — it cannot moderate.

### Method 1 — Via YouTube Studio (Best)

1. Log in to **studio.youtube.com** with your **MAIN PUBGMI account**
2. In the left sidebar → click **Settings**
3. In the popup → click **Community**
4. Under **Moderators** section, click the search box
5. Type the name of your bot channel: **PUBGMI Bot**
6. Select it from the dropdown list
7. Click **Save**
8. Repeat this process for your second YouTube account if you have one

### Method 2 — During Live Stream

1. Start a live stream on your channel
2. Have the bot send a test message (the bot will auto-post when it detects you're live)
3. In live chat, find the bot's message
4. Click the **three-dot menu** next to the message
5. Click **Add as managing moderator**
6. Confirm

### Verify Moderator Status

- Go to YouTube Studio → Settings → Community
- You should see **PUBGMI Bot** listed under Moderators
- The bot now has permission to: delete messages, ban users, timeout users, hide users

### Important Notes

```
✓ Add bot as moderator on BOTH YouTube accounts
✓ Stream must be set to Public for the bot to function  
✓ Managing Moderator gives more permissions than standard Moderator
✓ Moderator status persists across all future streams automatically
✓ If you see "Chat is unavailable" in bot logs, check the stream is Public
```

---

## STEP 7 — Run Database Migrations

1. In Railway, click your backend service
2. Click **Deploy** tab → find the latest deployment
3. Click the three dots → **Open Shell** (or use Railway CLI)
4. Run:
   ```bash
   npm run migrate
   ```
   Wait for: `All migrations completed successfully`
5. Then run:
   ```bash
   npm run seed
   ```
   Wait for: `Seeding complete!`

This creates all 35+ database tables and fills in default commands, settings, and reward tiers.

---

## STEP 8 — Set Up Vercel Dashboard

### 8a. Create Vercel Project

1. Go to **vercel.com**
2. Click **New Project**
3. Import from GitHub → select `pubgmi-bot`
4. Set root directory to: `frontend`
5. Framework preset: **Vite**

### 8b. Add Environment Variables in Vercel

In the deployment setup (or Project Settings → Environment Variables):

```env
VITE_BACKEND_URL=https://your-app.railway.app
VITE_TELEGRAM_BOT_USERNAME=PUBGMIROBOT
VITE_APP_NAME=PUBGMI
VITE_APP_URL=https://pubgmi.vercel.app
```

### 8c. Deploy

1. Click **Deploy**
2. Wait for deployment to complete
3. Your dashboard is live at: `pubgmi.vercel.app`

---

## STEP 9 — Activate YouTube WebSub

WebSub gives instant notifications when you upload a new video or Short.

1. Make sure your backend is running on Railway
2. Visit:
   ```
   https://your-app.railway.app/webhooks/youtube/1?hub.mode=subscribe&hub.challenge=test
   ```
3. If you see `test` returned — WebSub endpoint is working
4. The bot automatically subscribes on startup and renews every 9 days

---

## STEP 10 — Configure Telegram Bot

1. Open Telegram → search **@BotFather**
2. Send: `/mybots` → select `@PUBGMIROBOT`
3. Click **Edit Bot** → **Edit Commands**
4. Paste:
   ```
   menu - Main menu
   live - Live stream control
   say - Send message to live chat
   clip - Mark stream moment
   queue - Squad queue panel
   giveaway - Giveaway controls
   stats - Channel stats
   status - Bot status
   ping - Latency check
   notifications - Recent alerts
   recap - Last stream recap
   clips - Recent moments
   rules - Post stream rules
   socials - Post social links
   slow - Toggle slow mode
   subonly - Toggle subscriber-only
   break - Toggle break mode
   hype - Trigger hype message
   ban - Ban a user
   unban - Unban a user
   timeout - Timeout a user
   account - Switch account
   help - Command reference
   ```
5. Go back → **Bot Settings** → **Group Privacy** → Turn **OFF**
   (Required for the bot to read messages in groups if needed)

---

## STEP 11 — Final Verification Checklist

### Dashboard
- [ ] Visit `pubgmi.vercel.app`
- [ ] Login page appears with Telegram button
- [ ] Click Login — Telegram opens or widget appears
- [ ] Approve in Telegram → dashboard loads
- [ ] Home page shows bot status and stats

### Telegram
- [ ] Message `@PUBGMIROBOT` → send `/ping`
- [ ] Should respond with: `Pong — Latency: XXms`
- [ ] Send `/status`
- [ ] All services show Online
- [ ] Both YouTube accounts show Connected

### Live Stream Test
- [ ] Start a test live stream (can be unlisted for testing)
- [ ] Wait up to 60 seconds
- [ ] Telegram notification arrives: `PUBGMI is now LIVE`
- [ ] Dashboard banner turns red showing LIVE
- [ ] Type `!ping` in your live chat
- [ ] Bot responds in chat
- [ ] Bot appears as PUBGMI Bot with mod badge

### Video Upload Test
- [ ] Upload a short test video
- [ ] Within a few minutes → Telegram notification arrives
- [ ] Dashboard Records → Videos shows the new video

---

## TROUBLESHOOTING

### Bot not appearing in chat
```
1. Check stream is set to Public (not Unlisted)
2. Verify bot account added as Managing Moderator (Step 6)
3. Send /status on Telegram — check YouTube shows Connected
4. Check Railway logs for error messages
5. Bot detects streams within 60 seconds — wait a full minute
```

### OAuth errors during authorization
```
1. Verify redirect URI matches EXACTLY in Google Cloud Console
2. Make sure you signed in with the CORRECT Google account
3. Check BACKEND_URL environment variable matches your Railway URL
4. Try authorization in an incognito window (no cached credentials)
```

### Telegram bot not responding
```
1. Get your exact Telegram ID from t.me/userinfobot
2. Add that ID to AUTHORIZED_TELEGRAM_IDS in Railway variables
3. Verify TELEGRAM_BOT_TOKEN is correct (no extra spaces)
4. Check Railway logs for polling errors
```

### API quota exceeded
```
1. Open dashboard → Status Monitor → API Quota
2. YouTube gives 10,000 units daily — resets midnight Pacific Time
3. Stream polling uses ~1,440 units/day (leaving 8,560 for everything else)
4. If exceeded, reduce BOT_GUIDE_INTERVAL to reduce message posting
```

### Database connection errors
```
1. Check DATABASE_URL copied correctly from Railway PostgreSQL
2. Run migrations again: npm run migrate
3. Check Railway PostgreSQL service is running
```

---

## UPDATING THE BOT

```bash
# Make your changes locally
git add .
git commit -m "Update: description of changes"
git push origin main
```

- Railway auto-deploys backend within 2 minutes
- Vercel auto-deploys frontend within 1 minute
- Zero downtime on both platforms

---

## ENVIRONMENT VARIABLE REFERENCE

### Backend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `production` or `development` | Yes |
| `PORT` | Server port (Railway sets this) | Yes |
| `JWT_SECRET` | 64+ char random string | Yes |
| `SESSION_SALT` | 64+ char random string | Yes |
| `COOKIE_SECRET` | 32+ char random string | Yes |
| `DATABASE_URL` | PostgreSQL connection URL | Yes |
| `REDIS_URL` | Redis connection URL | Yes |
| `YOUTUBE_CLIENT_ID_1` | OAuth client ID for account 1 | Yes |
| `YOUTUBE_CLIENT_SECRET_1` | OAuth secret for account 1 | Yes |
| `YOUTUBE_REFRESH_TOKEN_1` | Set after Step 5 | Yes |
| `YOUTUBE_CLIENT_ID_2` | OAuth client ID for account 2 | Yes |
| `YOUTUBE_CLIENT_SECRET_2` | OAuth secret for account 2 | Yes |
| `YOUTUBE_REFRESH_TOKEN_2` | Set after Step 5 | Yes |
| `BOT_CLIENT_ID` | OAuth client ID for bot account | Yes |
| `BOT_CLIENT_SECRET` | OAuth secret for bot account | Yes |
| `BOT_REFRESH_TOKEN` | Set after Step 4 | Yes |
| `YOUTUBE_API_KEY` | YouTube API key | Yes |
| `YOUTUBE_CHANNEL_ID_1` | Your main channel ID (UCxx...) | Yes |
| `YOUTUBE_CHANNEL_ID_2` | Your second channel ID | Yes |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather | Yes |
| `AUTHORIZED_TELEGRAM_IDS` | Comma-separated Telegram IDs | Yes |
| `FRONTEND_URL` | https://pubgmi.vercel.app | Yes |
| `BACKEND_URL` | https://your-app.railway.app | Yes |
| `WEBSUB_SECRET` | Random string for WebSub security | Yes |
| `MAINTENANCE_MODE` | `true` or `false` | No |
| `BOT_GUIDE_INTERVAL` | Seconds between guide messages | No |

### Frontend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_BACKEND_URL` | Your Railway backend URL | Yes |
| `VITE_TELEGRAM_BOT_USERNAME` | `PUBGMIROBOT` | Yes |
| `VITE_APP_NAME` | `PUBGMI` | No |
| `VITE_APP_URL` | `https://pubgmi.vercel.app` | No |
