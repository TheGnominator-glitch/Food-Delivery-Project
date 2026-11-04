# Foodie

A food delivery web app. Users sign up, find restaurants near them, browse menus, pay with an internal credit system and follow a simulated delivery on a live map.

Customer's perspective only.

## Tech stack

- **Next.js 16** (App Router) with **React 19** and **TypeScript**
- **Tailwind CSS 4**
- **Oracle Database XE**, accessed with **node-oracledb** in thin mode
- **bcrypt** for password hashing
- Planned: **OSRM** (road routes), **Leaflet** (maps), **Nodemailer** with Gmail SMTP (email notifications)

## Prerequisites

- Windows with **WSL2** running Ubuntu
- **Node.js 24**, installed inside Ubuntu through nvm
- **Oracle Database XE** and **SQL Developer**, installed on Windows

## Setup

### 1. Clone and install

In Ubuntu:

```bash
git clone git@github.com:TheGnominator-glitch/Food-Delivery-Project.git foodie
cd foodie
npm install
```

### 2. Create the Oracle user

Connected as `SYSTEM`:

```sql
CREATE USER C##foodie IDENTIFIED BY "your_password";
GRANT CONNECT, RESOURCE TO C##foodie;
ALTER USER C##foodie QUOTA UNLIMITED ON USERS;
```

### 3. Create the tables

In SQL Developer, connect as `C##foodie`, open `database/foodie_schema.sql` and run it as a script. It should creates 18 tables.

### 4. Let WSL reach Oracle (Optional step)

Ubuntu reaches Oracle on Windows over port 1521, which Windows Firewall blocks by default. To bypass this run as an Admin:

```powershell
New-NetFirewallRule -DisplayName "Oracle WSL Access" -Direction Inbound -Protocol TCP -LocalPort 1521 -Action Allow -Profile Any
```

### 5. Configure the environment

```bash
cp .env.example .env.local
```

Put the Oracle password in `.env.local`. Then fill in the Windows host IP:

```bash
npx tsx scripts/ip_update.ts
```

WSL can change that IP after a reboot so one might have to re-run this multiple times

### 6. Check the connection

```bash
npx tsx scripts/connection_test.ts
```

It should print `Connected` and the 18 table names.

### 7. Load the seed data

```bash
npx tsx scripts/seed.ts
```

It adds 6 categories, 8 restaurants and 33 menu items. 

### 8. Run the app

```bash
npm run dev
```

Open http://localhost:3000 and sign up.

## Scripts

Run every script from the project root.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server |
| `npx tsx scripts/ip_update.ts` | Writes the Windows host IP into `.env.local` |
| `npx tsx scripts/connection_test.ts` | Checks the Oracle connection and lists the tables |
| `npx tsx scripts/seed.ts` | Loads the development seed data |
| `npx tsx scripts/session_test.ts` | Tests the session helpers |
| `npx tsx scripts/login_test.ts` | Tests login |
| `npx tsx scripts/me_logout_test.ts` | Tests the session check and logout |
| `npx tsx scripts/restaurants_test.ts` | Tests restaurant discovery |
| `npx tsx scripts/signup_test.ts` | Black-box tests for signup |
| `npx tsx scripts/whitebox_test.ts` | White-box tests for signup |

The tests create accounts whose IDs start with `TST` and delete them when they finish.

## Project structure

```
app/          pages (page.tsx) and API endpoints (api/**/route.ts)
lib/          database access, sessions and rate limiting
hooks/        shared React hooks
database/     schema and seed data
scripts/      tests and utilities
diagrams/     design diagrams
```