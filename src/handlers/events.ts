import { SlackEventMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { getDB, getTaskStates, isValidStateTransition } from '../db';
import { scanChannelHistory } from '../utils/channel';
import { DBTask, TaskState } from '../types';

export async function handleReactionAdded({ event, say, client }: SlackEventMiddlewareArgs<'reaction_added'> & AllMiddlewareArgs) {
  try {
    console.log('\n=== New Reaction Event ===');
    console.log('Reaction event received:', {
      reaction: event.reaction,
      user: event.user,
      item: event.item,
      eventTs: event.event_ts
    });

    const db = await getDB();
    const { reaction, user, item } = event;

    // Get all states and their emojis
    const states = await getTaskStates();
    console.log('\n=== Available States ===');
    console.log(states);
    
    const stateByEmoji = new Map(states.map(s => [s.emoji, s]));
    const targetState = stateByEmoji.get(reaction);
    
    console.log('\n=== State Matching ===');
    console.log('Target state for reaction:', {
      reaction,
      targetState: targetState ? targetState.name : 'not found'
    });
    
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
          text: `⚠️ I need to be invited to this channel first. Please use \`/invite @Task Tracker\``,
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
    
    console.log('\n=== Task Lookup ===');
    console.log('Existing task check:', {
      exists: !!existingTask,
      messageTs: item.ts,
      channel: item.channel
    });

    if (!existingTask) {
      console.log('\n=== Task Creation Check ===');
      console.log('Can create new task?', {
        targetStateOrder: targetState.order_num,
        canCreate: targetState.order_num === 1,
        result: targetState.order_num === 1 ? '✅ Yes' : '❌ No'
      });
      
      // Only allow task creation with the first ordered state
      if (targetState.order_num === 1) {
        // Fetch message content
        const result = await client.conversations.history({
          channel: item.channel,
          latest: item.ts,
          limit: 1,
          inclusive: true
        });
        
        const message = result.messages?.[0];
        const messageText = message?.text || '';
        const truncatedText = messageText.length > 50 ? `${messageText.slice(0, 47)}...` : messageText;
        const authInfo = await client.auth.test();
        const messageLink = `slack://channel?team=${authInfo.team_id}&id=${item.channel}&message=${item.ts}`;
        
        const task: Omit<DBTask, 'id'> = {
          user,
          messageTs: item.ts,
          channel: item.channel,
          status: targetState.name,
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
          text: `Task created by <@${user}> with status *${targetState.name}*\n>${truncatedText}\n<${messageLink}|Jump to task>`,
          thread_ts: item.ts
        });
        console.log('✅ Task created successfully');
      }
      return;
    }

    // Check if the state transition is allowed
    if (await isValidStateTransition(existingTask.status, targetState.name)) {
      await db.run(
        `UPDATE tasks 
         SET status = ?, stateChangedAt = ?, stateChangedBy = ?,
             completedAt = CASE WHEN ? = 1 THEN ? ELSE completedAt END,
             completedBy = CASE WHEN ? = 1 THEN ? ELSE completedBy END
         WHERE messageTs = ? AND channel = ?`,
        [
          targetState.name,
          now,
          user,
          targetState.isTerminal ? 1 : 0,
          targetState.isTerminal ? now : null,
          targetState.isTerminal ? 1 : 0,
          targetState.isTerminal ? user : null,
          item.ts,
          item.channel
        ]
      );
      
      await say({
        text: `Task status changed to *${targetState.name}* by <@${user}>`,
        thread_ts: item.ts
      });
    } else {
      // Log the error details to console
      console.error('Invalid state transition:', {
        from: existingTask.status,
        to: targetState.name,
        user,
        messageTs: item.ts,
        channel: item.channel
      });

      // Only show error in Slack if trying to move to a different state
      if (existingTask.status !== targetState.name) {
        await say({
          text: `Cannot change task from *${existingTask.status}* to *${targetState.name}*`,
          thread_ts: item.ts
        });
      }
    }
  } catch (error) {
    console.error('Reaction Handler Error:', error);
    await say({
      text: '⚠️ An error occurred while processing the reaction. Please try again or contact an administrator.',
      thread_ts: event.item.ts
    });
  }
}

export async function handleReactionRemoved({ event, say, client }: SlackEventMiddlewareArgs<'reaction_removed'> & AllMiddlewareArgs) {
  try {
    console.log('\n=== Reaction Removed Event ===');
    console.log('Reaction removed:', {
      reaction: event.reaction,
      user: event.user,
      item: event.item,
      eventTs: event.event_ts
    });

    const db = await getDB();
    const { reaction, user, item } = event;

    // Get all states and their emojis
    const states = await getTaskStates();
    console.log('\n=== Available States ===');
    console.log(states);
    
    const stateByEmoji = new Map(states.map(s => [s.emoji, s]));
    const removedState = stateByEmoji.get(reaction);
    
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
          text: `⚠️ I need to be invited to this channel first. Please use \`/invite @Task Tracker\``,
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

    // Only react if this is the current state being removed
    if (task && task.status === removedState.name) {
      if (removedState.order_num === 1) {
        // If removing the initial state reaction, delete the task
        await db.run(
          'DELETE FROM tasks WHERE messageTs = ? AND channel = ?',
          [item.ts, item.channel]
        );
        
        await say({
          text: `Task deleted by <@${user}>`,
          thread_ts: item.ts
        });
        console.log('Task deleted successfully');
      } else {
        // For other states, revert to previous state
        const previousState = states.find(s => 
          s.order_num < removedState.order_num && 
          s.allowedTransitionsTo.includes(removedState.name)
        );

        if (previousState) {
          const now = new Date().toISOString();
          await db.run(
            `UPDATE tasks 
             SET status = ?, stateChangedAt = ?, stateChangedBy = ?
             WHERE messageTs = ? AND channel = ?`,
            [previousState.name, now, user, item.ts, item.channel]
          );

          await say({
            text: `Task reverted to *${previousState.name}* by <@${user}>`,
            thread_ts: item.ts
          });
        }
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