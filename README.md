# Foodie

A food delivery web app. Users sign up, find restaurants near them, browse menus, pay with an internal credit system and follow a simulated delivery on a live map.

Customer's perspective only.

## Tech stack

- **Next.js 16** with **React 19** and **TypeScript**
- **Tailwind CSS 4**
- **Oracle Database XE**, accessed with **node-oracledb** in thin mode
- **bcrypt** 
- Planned: **OSRM**, **Leaflet**, **Nodemailer** with Gmail SMTP 

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

**Schema changes.** Later changes to the tables come as numbered files in `database/` (for example `002_cart_quantity_check.sql`). A database created from the current `foodie_schema.sql` already includes them all. A database created earlier needs each new file run once, as `C##foodie`, in number order.

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
| `npx tsx scripts/hash_test.ts` | Checks that bcrypt works |
| `npx tsx scripts/seed.ts` | Loads the development seed data |

## Tests

Each module has a black box suite and a white box suite. Both need the dev server running, and the restaurant and menu suites also need the seed loaded. The control flow graph for each white box suite is in `diagrams/cfg/`.

| Module | Black box | White box |
|---|---|---|---|
| Signup | `npx tsx scripts/signup_blackbox.ts` | `npx tsx scripts/signup_whitebox.ts` |
| Login | `npx tsx scripts/login_blackbox.ts` | `npx tsx scripts/login_whitebox.ts` |
| Session and logout | `npx tsx scripts/session_blackbox.ts` | `npx tsx scripts/session_whitebox.ts` |
| Restaurant discovery | `npx tsx scripts/restaurants_blackbox.ts` | `npx tsx scripts/restaurants_whitebox.ts` |
| Menu | `npx tsx scripts/menu_blackbox.ts` | `npx tsx scripts/menu_whitebox.ts` |
| Cart | `npx tsx scripts/cart_blackbox.ts` | `npx tsx scripts/cart_whitebox.ts` |
| Credits | `npx tsx scripts/credits_blackbox.ts` | `npx tsx scripts/credits_whitebox.ts` |

White box paths that only a database failure can reach are checked separately: stop the `OracleServiceXE` service in Windows, run `npx tsx scripts/outage_check.ts` with the dev server running, then start the service again.

The tests create accounts whose IDs start with `TST` (and, for the menu, a temporary restaurant named `TST…`) and delete them, with their carts, when they finish. 

## Project structure

```
app/          pages and API endpoints 
lib/          database access, sessions and rate limiting
hooks/        shared React hooks
database/     schema and seed data
scripts/      tests and utilities
diagrams/     design diagrams, and control flow graphs in diagrams/cfg/
```