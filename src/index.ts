import app from './app';
import { syncHistoricalReactions } from './utils/channel';

(async () => {
  await app.start();
  console.log('⚡️ Slack Bolt app is running!');
  
  // Scan historical messages
  await syncHistoricalReactions(app.client);
})(); 