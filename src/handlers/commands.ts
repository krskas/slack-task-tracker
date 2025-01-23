import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { getDB, getTaskStates } from '../db';
import { DBTask, TaskState } from '../types';

interface TaskMessage {
  task: DBTask;
  text: string;
}

export async function handleTasksCommand({ command, ack, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  try {
    await ack();
    
    // Verify channel access
    try {
      await client.conversations.info({ channel: command.channel_id });
    } catch (error: any) {
      if (error.code === 'not_in_channel') {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: '⚠️ I need to be invited to this channel first. Please use `/invite @Task Tracker`'
        });
        return;
      }
      throw error;
    }

    const db = await getDB();
    const states = await getTaskStates();
    
    const nonTerminalStates = states.filter(s => !s.isTerminal).map(s => s.name);
    
    const tasks = await db.all<DBTask[]>(
      `SELECT * FROM tasks WHERE status IN (${nonTerminalStates.map(() => '?').join(',')})`, 
      nonTerminalStates
    );
    
    if (tasks.length > 0) {
      const stateMap = new Map(states.map(s => [s.name, s]));
      
      // Fetch messages for all tasks
      const taskMessages = await Promise.all(tasks.map(async (task: DBTask): Promise<TaskMessage> => {
        try {
          const result = await client.conversations.history({
            channel: task.channel,
            latest: task.messageTs,
            limit: 1,
            inclusive: true
          });
          return {
            task,
            text: result.messages?.[0]?.text || ''
          };
        } catch (error) {
          console.error(`Error fetching message for task ${task.messageTs}:`, error);
          return {
            task,
            text: '(message not accessible)'
          };
        }
      }));

      const response = '*Active Tasks:*\n' + 
        taskMessages.map(({ task, text }: TaskMessage) => {
          const state = stateMap.get(task.status);
          const emoji = state?.emoji || '❓';
          const truncatedText = text.length > 50 ? `${text.slice(0, 47)}...` : text;
          const messageLink = `slack://channel?team=${command.team_id}&id=${task.channel}&message=${task.messageTs}`;
          const createdDate = new Date(task.createdAt).toLocaleString();
          
          return `*:${emoji}: \`${task.status}\` ${truncatedText}* | _<${messageLink}|View task> | <#${task.channel}> by <@${task.user}> on ${createdDate}_`;
        }).join('\n\n');
      
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: response
      });
    } else {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'No active tasks.'
      });
    }
  } catch (error) {
    console.error('Tasks Command Error:', error);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: '⚠️ An error occurred while fetching tasks. Please try again or contact an administrator.'
    });
  }
}

export async function handleTaskStatesCommand({ command, ack, say, client }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) {
  try {
    await ack();

    // Verify channel access
    try {
      await client.conversations.info({ channel: command.channel_id });
    } catch (error: any) {
      if (error.code === 'not_in_channel') {
        await say('⚠️ I need to be invited to this channel first. Please use `/invite @Task Tracker`');
        return;
      }
      throw error;
    }

    const states = await getTaskStates();
    
    const response = '*Available Task States:*\n' + 
      states.map((state: TaskState) => 
        `- :${state.emoji}: \`${state.name}\` - ${state.description}\n` +
        `  Transitions to: ${state.allowedTransitionsTo.length ? state.allowedTransitionsTo.join(', ') : 'None'}`
      ).join('\n');
    
    await say(response);
  } catch (error) {
    console.error('Task States Command Error:', error);
    await say('⚠️ An error occurred while fetching task states. Please try again or contact an administrator.');
  }
} 