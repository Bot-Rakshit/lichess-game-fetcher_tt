# Lichess Game Fetcher

A service that fetches and stores chess games from Lichess broadcasts in a PostgreSQL database.

## Features

- Automatically fetches active broadcasts from Lichess on startup
- Periodically checks for new broadcasts every 5 minutes
- Stores tournament, round, and game data
- Provides endpoints to delete specific games or all games in a round
- Parses and stores PGN data with metadata

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a PostgreSQL database named `lichess_games`
4. Update the `.env` file with your database connection string if needed
5. Run Prisma migrations:
   ```bash
   npx prisma migrate dev
   ```

## Running the Service

The service will automatically start fetching broadcasts as soon as it starts, and will continue to check for new broadcasts every 5 minutes.

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## API Endpoints

### DELETE /api/games/:id
Deletes a specific game by ID.

### DELETE /api/rounds/:roundId/games
Deletes all games in a specific round.

Note: The `/api/fetch-broadcasts` endpoint is still available but not required for normal operation, as the service automatically fetches broadcasts on startup and periodically.

## Database Schema

### Tour
- Represents a chess tournament/broadcast
- Contains metadata about the tournament
- Has many rounds

### Round
- Represents a round within a tournament
- Contains timing and status information
- Has many games
- Belongs to a tour

### Game
- Represents a single chess game
- Contains PGN data and game metadata
- Belongs to a round 