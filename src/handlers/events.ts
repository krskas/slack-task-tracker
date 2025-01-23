import { SlackEventMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { getDB, getTaskStates } from '../db';
import { scanChannelHistory } from '../utils/channel';
import { DBTask, TaskState } from '../types';

export async function handleReactionAdded({ event, say, client }: SlackEventMiddlewareArgs<'reaction_added'> & AllMiddlewareArgs): Promise<void> {
  try {
    const db = await getDB();
    const { reaction, user, item } = event;

    const states = await getTaskStates();
    const stateByEmoji = new Map(states.map(s => [s.emoji, s]));
    const targetState = reaction ? stateByEmoji.get(reaction) : undefined;
    
    if (!targetState) {
      console.log('❌ No matching state found for reaction:', reaction);
      return;
    }

    // Verify channel access
    try {
      await client.conversations.info({ channel: item.channel });
    } catch (error: any) {
      if (error.code === 'not_in_channel') {
        await say({
          text: '⚠️ I need to be invited to this channel first. Please use `/invite @Task Tracker`',
          thread_ts: item.ts
        });
        return;
      }
      throw error;
    }

    const now = new Date().toISOString();
    const existingTask = await db.get<DBTask>(
      'SELECT * FROM tasks WHERE messageTs = ? AND channel = ?',
      [item.ts, item.channel]
    );

    if (!existingTask) {
      // Get message reactions to find highest state
      const result = await client.reactions.get({
        channel: item.channel,
        timestamp: item.ts
      });
      
      const message = result.message;
      const reactions = message?.reactions || [];
      
      const highestState = reactions
        .map(r => r.name ? stateByEmoji.get(r.name) : undefined)
        .filter((s): s is TaskState => s !== undefined)
        .reduce<TaskState | null>((highest, current) => 
          !highest || current.order_num > highest.order_num ? current : highest
        , null);

      if (highestState) {
        const messageText = message?.text || '';
        const truncatedText = messageText.length > 50 ? `${messageText.slice(0, 47)}...` : messageText;
        const authInfo = await client.auth.test();
        const messageLink = `slack://channel?team=${authInfo.team_id}&id=${item.channel}&message=${item.ts}`;
        
        const task: Omit<DBTask, 'id'> = {
          user,
          messageTs: item.ts,
          channel: item.channel,
          status: highestState.name,
          createdAt: now,
          stateChangedAt: now,
          stateChangedBy: user
        };
        
        await db.run(
          `INSERT INTO tasks (user, messageTs, channel, status, createdAt, stateChangedAt, stateChangedBy) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [task.user, task.messageTs, task.channel, task.status, task.createdAt, task.stateChangedAt, task.stateChangedBy]
        );
        
        await say({
          text: `Task created by <@${user}> with status *${highestState.name}*\n>${truncatedText}\n<${messageLink}|Jump to task>`,
          thread_ts: item.ts
        });
      }
      return;
    }

    // Update existing task to highest state
    const result = await client.reactions.get({
      channel: item.channel,
      timestamp: item.ts
    });
    
    const message = result.message;
    const reactions = message?.reactions || [];
    
    const highestState = reactions
      .map(r => r.name ? stateByEmoji.get(r.name) : undefined)
      .filter((s): s is TaskState => s !== undefined)
      .reduce<TaskState | null>((highest, current) => 
        !highest || current.order_num > highest.order_num ? current : highest
      , null);

    if (highestState && highestState.name !== existingTask.status) {
      await db.run(
        `UPDATE tasks 
         SET status = ?, stateChangedAt = ?, stateChangedBy = ?,
             completedAt = CASE WHEN ? = 1 THEN ? ELSE completedAt END,
             completedBy = CASE WHEN ? = 1 THEN ? ELSE completedBy END
         WHERE messageTs = ? AND channel = ?`,
        [
          highestState.name,
          now,
          user,
          highestState.isTerminal ? 1 : 0,
          highestState.isTerminal ? now : null,
          highestState.isTerminal ? 1 : 0,
          highestState.isTerminal ? user : null,
          item.ts,
          item.channel
        ]
      );
      
      await say({
        text: `Task status changed to *${highestState.name}* by <@${user}>`,
        thread_ts: item.ts
      });
    }
  } catch (error) {
    console.error('Reaction Handler Error:', error);
    await say({
      text: '⚠️ An error occurred while processing the reaction. Please try again or contact an administrator.',
      thread_ts: event.item.ts
    });
  }
}

export async function handleReactionRemoved({ event, say, client }: SlackEventMiddlewareArgs<'reaction_removed'> & AllMiddlewareArgs): Promise<void> {
  try {
    const db = await getDB();
    const { reaction, user, item } = event;

    const states = await getTaskStates();
    const stateByEmoji = new Map(states.map(s => [s.emoji, s]));
    const removedState = reaction ? stateByEmoji.get(reaction) : undefined;
    
    if (!removedState) {
      console.log('❌ No matching state found for removed reaction:', reaction);
      return;
    }

    // Verify channel access
    try {
      await client.conversations.info({ channel: item.channel });
    } catch (error: any) {
      if (error.code === 'not_in_channel') {
        await say({
          text: '⚠️ I need to be invited to this channel first. Please use `/invite @Task Tracker`',
          thread_ts: item.ts
        });
        return;
      }
      throw error;
    }

    const task = await db.get<DBTask>(
      'SELECT * FROM tasks WHERE messageTs = ? AND channel = ?',
      [item.ts, item.channel]
    );

    if (task) {
      const result = await client.reactions.get({
        channel: item.channel,
        timestamp: item.ts
      });
      
      const message = result.message;
      const reactions = message?.reactions || [];
      
      const highestState = reactions
        .map(r => r.name ? stateByEmoji.get(r.name) : undefined)
        .filter((s): s is TaskState => s !== undefined)
        .reduce<TaskState | null>((highest, current) => 
          !highest || current.order_num > highest.order_num ? current : highest
        , null);

      if (!highestState) {
        await db.run(
          'DELETE FROM tasks WHERE messageTs = ? AND channel = ?',
          [item.ts, item.channel]
        );
        
        await say({
          text: `Task deleted by <@${user}>`,
          thread_ts: item.ts
        });
      } else if (highestState.name !== task.status) {
        const now = new Date().toISOString();
        await db.run(
          `UPDATE tasks 
           SET status = ?, stateChangedAt = ?, stateChangedBy = ?,
               completedAt = CASE WHEN ? = 1 THEN ? ELSE completedAt END,
               completedBy = CASE WHEN ? = 1 THEN ? ELSE completedBy END
           WHERE messageTs = ? AND channel = ?`,
          [
            highestState.name,
            now,
            user,
            highestState.isTerminal ? 1 : 0,
            highestState.isTerminal ? now : null,
            highestState.isTerminal ? 1 : 0,
            highestState.isTerminal ? user : null,
            item.ts,
            item.channel
          ]
        );

        await say({
          text: `Task reverted to *${highestState.name}* by <@${user}>`,
          thread_ts: item.ts
        });
      }
    }
  } catch (error) {
    console.error('Reaction Removed Handler Error:', error);
    await say({
      text: '⚠️ An error occurred while processing the removed reaction. Please try again or contact an administrator.',
      thread_ts: event.item.ts
    });
  }
}

export async function handleMemberJoinedChannel({ event, client }: SlackEventMiddlewareArgs<'member_joined_channel'> & AllMiddlewareArgs) {
  try {
    console.log('\n=== Member Joined Channel Event ===');
    console.log('Event details:', {
      user: event.user,
      channel: event.channel,
      channelType: event.channel_type,
      inviter: event.inviter
    });

    // Only process when our bot is the one joining
    const authTest = await client.auth.test();
    console.log('Bot identity:', {
      botUserId: authTest.user_id,
      isBot: event.user === authTest.user_id
    });

    if (event.user === authTest.user_id) {
      console.log(`Bot added to channel <#${event.channel}>`);
      await scanChannelHistory(event.channel, client);
    } else {
      console.log('Event was for a different user, ignoring');
    }
  } catch (error) {
    console.error('Error handling channel join:', error);
  }
} 