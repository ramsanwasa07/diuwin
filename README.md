# 🎰 DiuWin Style Games Lobby - Full-Stack Pro Edition

A modern, high-standard games lobby built with a complete **Node.js Express backend**, interactive casino games arena (Lucky Spin, 777 Slots, Rocket Crash, Win Go Lottery), real wallet recharge/withdrawal system, authenticated sessions, live winners broadcast, and mobile/desktop responsive design.

---

## ⚡ Quick Start & Run Commands

Run these commands in the project directory:

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
> The server starts on **http://localhost:3000** and serves the full client frontend and backend API simultaneously.

### 3. Open in Browser
```bash
npm run open
```
*Or simply open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or any modern browser.*

### 4. Run Automated Tests
```bash
npm test
```
*Executes full integration tests verifying Auth, Wallet Deposits, Balance integrity, Game Bets, and Payout calculations.*

### 5. Development Mode (Watch Mode)
```bash
npm run dev
```

---

## 🚀 Key Features

### 🛡️ 1. Solid Backend Engine (`server.js`)
- **Authentication**:
  - `POST /api/auth/register`: Phone & password registration with ₹500 welcome bonus.
  - `POST /api/auth/login`: Session token authentication.
  - `POST /api/auth/guest`: Instant 1-click guest play with ₹1,000 demo funds.
  - `GET /api/user/profile`: Real-time user stats, VIP level, bet history counts.
- **Wallet & Transactions**:
  - `POST /api/wallet/deposit`: Instant demo recharge simulator (₹200, ₹500, ₹1,000, etc.).
  - `POST /api/wallet/withdraw`: Withdrawal processor with balance validation.
  - `GET /api/wallet/transactions`: Live transaction audit history.
- **Casino Game Engine**:
  - `POST /api/games/play`: Handles real bets, mathematical RNG payouts, dynamic multipliers, and balance settlements.
  - `GET /api/games/list`: Game configurations & certified RTPs.
  - `GET /api/games/live-wins`: Rolling live player winning activity stream.

### 🎮 2. Interactive Playable Games Arena
- **🎡 Lucky Spin Wheel**: Canvas-rendered 8-segment wheel with spin physics, needle bounce, and multiplier landing (up to 5x Mega).
- **🎰 Golden 777 Slots**: 3-reel casino slot spinner with animated reel tumbling, 10x-25x Jackpot payouts.
- **🚀 Rocket Dash (Crash)**: Rising multiplier rocket game with cashout mechanics.
- **🎟️ Win Go Lottery**: 30-second countdown color prediction (Green, Violet, Red) with 2x to 4.5x payouts.

### 💎 3. Premium Aesthetic Standard
- Rich DiuWin signature royal purple & gold neon styling.
- Glassmorphic navigation, sticky balance counter with quick recharge `+` button.
- Live winning ticker, animated notice banner, VIP tier tags.
- Full mobile-app frame shell for seamless mobile & desktop experience.
