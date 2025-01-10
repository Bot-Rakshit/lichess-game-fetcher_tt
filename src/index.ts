import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.use(express.json());

// Function to fetch and store broadcasts
async function fetchAndStoreBroadcasts() {
  try {
    console.log('Fetching broadcasts...');
    const response = await axios.get('https://lichess.org/api/broadcast/top');
    const broadcasts = response.data.active;

    for (const broadcast of broadcasts) {
      const { tour } = broadcast;
      
      // Check if tour exists and needs update
      const existingTour = await prisma.tour.findUnique({
        where: { id: tour.id }
      });

      // Only update if tour doesn't exist or has different data
      if (!existingTour || 
          existingTour.name !== tour.name || 
          existingTour.slug !== tour.slug || 
          existingTour.url !== tour.url || 
          existingTour.tier !== tour.tier) {
        await prisma.tour.upsert({
          where: { id: tour.id },
          update: {
            name: tour.name,
            slug: tour.slug,
            info: tour.info,
            createdAt: new Date(tour.createdAt),
            url: tour.url,
            tier: tour.tier,
            dates: tour.dates,
            image: tour.image
          },
          create: {
            id: tour.id,
            name: tour.name,
            slug: tour.slug,
            info: tour.info,
            createdAt: new Date(tour.createdAt),
            url: tour.url,
            tier: tour.tier,
            dates: tour.dates,
            image: tour.image
          }
        });
      }

      // Fetch tour details to get all rounds
      const tourDetails = await axios.get(`https://lichess.org/api/broadcast/${tour.id}`);
      
      for (const round of tourDetails.data.rounds) {
        // Skip rounds that are not finished
        if (!round.finished) {
          console.log(`Skipping round ${round.id} as it's not finished yet`);
          continue;
        }

        // Check if round exists and needs update
        const existingRound = await prisma.round.findUnique({
          where: { id: round.id },
          include: { games: true }
        });

        // Only update if round doesn't exist or has different data
        if (!existingRound || 
            existingRound.name !== round.name || 
            existingRound.slug !== round.slug || 
            existingRound.finished !== round.finished ||
            (round.finishedAt && existingRound.finishedAt?.getTime() !== new Date(round.finishedAt).getTime())) {
          
          await prisma.round.upsert({
            where: { id: round.id },
            update: {
              name: round.name,
              slug: round.slug,
              createdAt: new Date(round.createdAt),
              startsAt: new Date(round.startsAt),
              finishedAt: round.finishedAt ? new Date(round.finishedAt) : null,
              finished: round.finished,
              url: round.url,
              tourId: tour.id
            },
            create: {
              id: round.id,
              name: round.name,
              slug: round.slug,
              createdAt: new Date(round.createdAt),
              startsAt: new Date(round.startsAt),
              finishedAt: round.finishedAt ? new Date(round.finishedAt) : null,
              finished: round.finished,
              url: round.url,
              tourId: tour.id
            }
          });

          // Only fetch and store PGNs if round is finished and we haven't stored its games yet
          if (round.finished && (!existingRound || existingRound.games.length === 0)) {
            console.log(`Fetching PGNs for round ${round.id}`);
            // Fetch PGNs for the round
            const pgnResponse = await axios.get(`https://lichess.org/api/broadcast/round/${round.id}.pgn`);
            const pgns = pgnResponse.data.split('\n\n[Event').filter(Boolean);

            for (const pgn of pgns) {
              const formattedPgn = pgn.startsWith('[Event') ? pgn : '[Event' + pgn;
              const headers = parsePgnHeaders(formattedPgn);

              // Check if game already exists
              const existingGame = await prisma.game.findFirst({
                where: {
                  roundId: round.id,
                  white: headers.White,
                  black: headers.Black,
                  date: headers.Date,
                  round: headers.Round
                }
              });

              if (!existingGame) {
                console.log(`Storing new game: ${headers.White} vs ${headers.Black}`);
                await prisma.game.create({
                  data: {
                    event: headers.Event,
                    site: headers.Site,
                    date: headers.Date,
                    round: headers.Round,
                    white: headers.White,
                    black: headers.Black,
                    result: headers.Result,
                    whiteTeam: headers.WhiteTeam,
                    blackTeam: headers.BlackTeam,
                    whiteFideId: headers.WhiteFideId,
                    blackFideId: headers.BlackFideId,
                    whiteTitle: headers.WhiteTitle,
                    blackTitle: headers.BlackTitle,
                    whiteElo: headers.WhiteElo ? parseInt(headers.WhiteElo) : null,
                    blackElo: headers.BlackElo ? parseInt(headers.BlackElo) : null,
                    variant: headers.Variant,
                    eco: headers.ECO,
                    opening: headers.Opening,
                    pgn: formattedPgn,
                    roundId: round.id
                  }
                });
              }
            }
          }
        }
      }
    }

    console.log('Finished fetching and storing broadcasts');
  } catch (error) {
    console.error('Error fetching broadcasts:', error);
  }
}

// Delete specific game by ID
app.delete('/api/games/:id', async (req: Request, res: Response) => {
  try {
    await prisma.game.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

// Delete all games in a round
app.delete('/api/rounds/:roundId/games', async (req: Request, res: Response) => {
  try {
    await prisma.game.deleteMany({
      where: { roundId: req.params.roundId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete games' });
  }
});

// Helper function to parse PGN headers
function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]+)"\]/g;
  let match;

  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }

  return headers;
}

// Start fetching games immediately when server starts
fetchAndStoreBroadcasts();

// Set up periodic fetching (every 5 minutes)
const FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
setInterval(fetchAndStoreBroadcasts, FETCH_INTERVAL);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 