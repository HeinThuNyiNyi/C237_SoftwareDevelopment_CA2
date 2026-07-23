# CampusCycle_2

A lesson-aligned C237 CA2 marketplace built with one `app.js`, EJS, Bootstrap, Express and MySQL.

## Setup

1. Create or select an empty MySQL database.
2. Import `campuscycle_2.sql`.
3. Install dependencies:

   ```powershell
   npm install
   ```

4. Copy `.env.example` to `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and replace the example values with your private database
   credentials:

   ```dotenv
   DB_HOST=your_database_host
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password
   DB_NAME=your_database_name
   ```

   The `.env` file is ignored by Git. Do not commit or share it.

6. Start the application:

   ```powershell
   npm start
   ```

7. Open `http://localhost:3000`.

## Seed accounts

- Admin: `admin@myrp.edu.sg` / `Admin123`
- Student: `student@myrp.edu.sg` / `Student123`

Register a second student account to test buyer/seller transactions.

## Architecture

- `app.js`: Express setup, MySQL connection, middleware, validation and routes.
- `views/`: EJS pages and reusable partials.
- `public/`: Bootstrap theme adjustments and uploaded images.
- `campuscycle_2.sql`: exactly seven application tables plus seed data.
- `.env.example`: safe database configuration template.

## Contribution areas

- Hein Thu Nyi Nyi: users, authentication and profiles
- Thiha Aung: products and administrator approval
- Denna Joy: wishlist and cart
- Zhen Cheng Chao: reservations and completed purchase/sales history
- Feng Kaiduo: ratings
- Ei Htet Htet Tun: reports and resolution messages

Completed reservations provide purchase and sales history. Resolved reports provide user-facing updates, so separate purchase and notification tables are not required.

The private `.env`, `node_modules` and uploaded user files are excluded from Git.

## Existing database update

If the database was imported before administrator rating moderation was added, run this statement once:

```sql
ALTER TABLE reservations
ADD COLUMN rating_admin_delete_count INT NOT NULL DEFAULT 0
AFTER stock_restored;
```
