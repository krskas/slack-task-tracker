import { getDB, getTaskStates } from '../db';
import { DBTask, SlackMessage, SlackChannel, TaskState } from '../types';

export async function scanChannelHistory(channelId: string, client: any) {
  try {
    console.log('\n=== Scanning Channel History ===');
    const db = await getDB();
    const states = await getTaskStates();
    const stateByEmoji = new Map(states.map((s: TaskState) => [s.emoji, s]));

    // Calculate timestamp for 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const oldest = (ninetyDaysAgo.getTime() / 1000).toString();

    // Get messages with reactions
    const result = await client.conversations.history({
      channel: channelId,
      limit: 1000,
      oldest
    });

    const messagesWithReactions = (result.messages as SlackMessage[])?.filter(m => m.reactions && m.ts && m.user) || [];
    console.log(`Found ${messagesWithReactions.length} messages with reactions`);

    for (const message of messagesWithReactions) {
      // Check if message already tracked
      const existingTask = await db.get<DBTask>(
        'SELECT * FROM tasks WHERE messageTs = ? AND channel = ?',
        [message.ts, channelId]
      );

      if (!existingTask && message.reactions) {
        // Find the earliest task state reaction
        const taskReactions = message.reactions
          .filter(r => r.name && stateByEmoji.has(r.name))
          .sort((a, b) => (a.count - b.count));

        const firstTaskReaction = taskReactions[0];
        if (firstTaskReaction?.name) {
          const state = stateByEmoji.get(firstTaskReaction.name);
          if (state?.order_num === 1) {
            console.log(`Creating task for message ${message.ts}`);
            const now = new Date().toISOString();
            const task: Omit<DBTask, 'id'> = {
              user: message.user,
              messageTs: message.ts,
              channel: channelId,
              status: state.name,
              createdAt: now,
              stateChangedAt: now,
              stateChangedBy: message.user
            };

            await db.run(
              `INSERT INTO tasks (user, messageTs, channel, status, createdAt, stateChangedAt, stateChangedBy) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [task.user, task.messageTs, task.channel, task.status, task.createdAt, task.stateChangedAt, task.stateChangedBy]
            );
          }
        }
      }
    }
    console.log('=== Channel Scan Complete ===\n');
  } catch (error) {
    console.error('Error scanning channel:', error);
  }
}

export async function syncHistoricalReactions(client: any) {
  try {
    console.log('\n=== Scanning Historical Messages ===');
    
    // Get all channels the bot is in
    const channelsResult = await client.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 1000
    });
    
    const channels = (channelsResult.channels as SlackChannel[])?.filter(c => c.is_member && c.id && c.name) || [];
    console.log(`Found ${channels.length} channels to scan`);

    for (const channel of channels) {
      console.log(`\nScanning channel: ${channel.name}`);
      try {
        await scanChannelHistory(channel.id, client);
      } catch (error) {
        console.error(`Error scanning channel ${channel.name}:`, error);
      }
    }
    console.log('\n=== Historical Scan Complete ===');
  } catch (error) {
    console.error('Error during historical scan:', error);
  }
} 