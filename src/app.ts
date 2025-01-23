import { App } from '@slack/bolt';
import dotenv from 'dotenv';
import { handleReactionAdded, handleReactionRemoved, handleMemberJoinedChannel } from './handlers/events';
import { handleTasksCommand, handleTaskStatesCommand } from './handlers/commands';

dotenv.config();

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Global error handler
app.error(async (error: Error) => {
  console.error('App Error:', {
    name: error.name,
    message: error.message,
    code: (error as any).code,
    stack: error.stack
  });
});

// Event handlers
app.event('reaction_added', handleReactionAdded);
app.event('reaction_removed', handleReactionRemoved);
app.event('member_joined_channel', handleMemberJoinedChannel);

// Command handlers
app.command('/tasks', handleTasksCommand);
app.command('/task_states', handleTaskStatesCommand);

export default app; 