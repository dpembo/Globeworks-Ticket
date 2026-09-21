# GlobeWorks Ticket Bot

A complete, production-oriented **Discord-only** multi-server ticket system built with **Node.js**, **discord.js v14**, **SQLite**, and **dotenv**.

Everything is configured through Discord slash commands, buttons, select menus, and modals. There is **no website**, web dashboard, or external admin panel.

## Features

- **Single command namespace:** `/globeworks-ticket`
- **Interactive control panel** when run with no subcommand
- **Ticket panels** with optional multi-step forms (modals) **before** ticket creation
- Form answers stored in SQLite and survive restarts, closes, archives, and restores
- **Channels or private threads**
- Claim / unclaim, close / reopen, add / remove users, rename, info, delete
- **Transcripts** on close (configurable)
- **Application system** with forms, review, accept, deny
- **Role-based permissions** configured via Discord role selectors
- **Per-action logging channels**
- **21-day archive system** (configurable) with forum posts and recovery
- **Archived ticket browser** and admin-only recovery channel
- **Custom commands** under the same namespace with embed builders
- **Multi-guild isolation** — every setting scoped by `guild_id`
- Shared service layer for slash commands and buttons (no duplicated business logic)

## Requirements

- Node.js **18+**
- A Discord bot application with:
  - Bot token
  - Application (Client) ID
  - Privileged intents as needed (Server Members Intent recommended)
  - Bot invited with permissions: Manage Channels, Manage Roles, Manage Threads, Send Messages, Embed Links, Attach Files, Read Message History, Use Application Commands

## Installation

```bash
# 1. Clone / copy the project
cd globeworks-ticket

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and set:
#   DISCORD_TOKEN=your_bot_token
#   CLIENT_ID=your_application_client_id
# Optional for faster command updates during development:
#   DEV_GUILD_ID=your_test_guild_id

# 4. Start the bot
npm start
```

On first start the bot will:

1. Load environment variables  
2. Create / migrate the SQLite database (`data/globeworks.db`)  
3. Register slash commands (global, or guild-scoped if `DEV_GUILD_ID` is set)  
4. Process any expired archives  
5. Start hourly maintenance jobs  

## First-time setup (all inside Discord)

1. Run `/globeworks-ticket` to open the control panel.  
2. **Configuration** → set:
   - Ticket category  
   - Support role  
   - Archive forum channel (Forum type)  
   - Recovery channel (admin-only)  
   - Transcript channel  
   - Recovery days (default 21)  
3. **Permissions** → select staff roles and toggle permissions.  
4. **Logging** → assign log channels per event type.  
5. **Panels** → create a panel, edit embed/button/questions, then send it.  
6. Users click the panel button → fill the form (if any) → ticket is created.

## Command overview

| Command | Description |
|---------|-------------|
| `/globeworks-ticket` | Main interactive control panel |
| `/globeworks-ticket close` | Close current ticket |
| `/globeworks-ticket claim` / `unclaim` | Claim system |
| `/globeworks-ticket add` / `remove` | Manage ticket members |
| `/globeworks-ticket rename` | Rename channel |
| `/globeworks-ticket info` | Ticket details + form answers |
| `/globeworks-ticket transcript` | Generate transcript |
| `/globeworks-ticket archived` | Browse archives |
| `/globeworks-ticket reopen-archived` | Restore (recovery channel only) |
| `/globeworks-ticket panel create/edit/delete/list/send` | Panels |
| `/globeworks-ticket application ...` | Applications |
| `/globeworks-ticket config view/reset` | Settings |
| `/globeworks-ticket permissions` | Role permissions |
| `/globeworks-ticket logging` | Log channels |
| `/globeworks-ticket command create/edit/...` | Custom commands |

## Project structure

```
src/
  index.js              # Entry point
  config/constants.js
  commands/globeworks-ticket.js
  events/ready.js
  events/interactionCreate.js
  components/buttons/
  components/selects/
  modals/
  services/             # Shared business logic
    ticketService.js
    panelService.js
    applicationService.js
    customCommandService.js
    guildSettings.js
    loggingService.js
    transcriptService.js
  database/
    db.js
    schema.js           # Migrations
  builders/controlPanel.js
  utils/
data/                   # SQLite file (created at runtime)
.env.example
package.json
README.md
```

## Important design rules

- **Forms before tickets:** If a panel has questions, a Discord Modal opens first. The ticket is only created after the form is completed and validated.  
- **Ticket numbers are never reused.** Restored tickets keep their original number.  
- **No leaderboards, rankings, or statistics dashboards.**  
- All normal configuration is done through Discord UI — no source, JSON, or manual SQLite edits required for day-to-day use.

## Security

Every action performs server-side checks (Discord permissions + role permission table). Custom IDs, modal data, and database IDs are never trusted blindly. All guild-specific queries are scoped by `guild_id`.

## License

MIT
