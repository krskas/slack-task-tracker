# Slack Task Tracker

Track and manage tasks using emoji reactions with customizable workflows.

**Author:** Marius Krasauskas ([@vividbro](https://github.com/vividbro))

## Quick Start
```bash
# Clone the repository
git clone https://github.com/vividbro/slack-task-tracker.git
cd slack-task-tracker

# Follow setup instructions below
```

## Setup

### 1. Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" > "From Manifest"
3. Select your workspace and paste the contents of `manifest.json`
4. Click "Create"

### 2. Get App Tokens
1. Under "Basic Information":
   - Scroll to "App-Level Tokens"
   - Click "Generate Token and Scopes"
   - Add the `connections:write` scope
   - Name it (e.g., "socket-token")
   - Click "Generate"
   - Save the token starting with `xapp-` - this is your `SLACK_APP_TOKEN`

2. Under "OAuth & Permissions":
   - Click "Install to Workspace"
   - After installation, copy the "Bot User OAuth Token"
   - Save the token starting with `xoxb-` - this is your `SLACK_BOT_TOKEN`

### 3. Environment Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Update `.env` with your tokens:
   ```
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   ```

### 4. Run with Docker
```bash
docker-compose up --build
```

## Usage

### Channel Setup
1. Add the bot to channels where you want to track tasks:
   ```
   /invite @Task Tracker
   ```
   ⚠️ **Important:** The bot must be invited to each channel before it can track tasks or respond to commands there
   
   When invited, the bot will automatically scan the last 90 days of messages for existing task reactions.

### Task Management
1. Create tasks by adding reactions:
   - 👀 (`:eyes:`) - Open state
   - 🔨 (`:hammer:`) - Working state
   - 🔍 (`:mag:`) - Review state
   - ✅ (`:white_check_mark:`) - Finished state

2. Task State Behavior:
   - Task state is determined by the highest-order state emoji present
   - Multiple state emojis can be present - highest one wins
   - Removing all state emojis deletes the task
   - Removing state emojis reverts to next highest state present

4. Available commands:
   - `/tasks` - List all active tasks (only visible to you)
   - `/task_states` - Show all available states and transitions

## Features

- Track tasks using emoji reactions
- Configurable task states and workflows
- Review workflow support
- Task deletion support
- Automatic channel scanning
- Private task listing
- Persistent storage using SQLite
- Self-hosted solution
- Docker support

## Configuration

### Task State Emojis
You can customize which emojis are used for each task state by setting these environment variables:

```env
# Use emoji names without the : prefix
DEFAULT_TASK_OPEN_EMOJI=eyes            # Default: eyes
DEFAULT_TASK_WORKING_EMOJI=hammer       # Default: hammer
DEFAULT_TASK_REVIEW_EMOJI=mag           # Default: mag
DEFAULT_TASK_FINISHED_EMOJI=white_check_mark  # Default: white_check_mark
```

### Task State Flow
1. **Open** (👀) - Task needs attention
2. **Working** (🔨) - Task is being worked on
3. **Review** (🔍) - Task completed, needs review
4. **Finished** (✅) - Task has been completed and reviewed

Allowed transitions:
- Open → Working, Review, Finished
- Working → Open, Review, Finished
- Review → Working, Finished
- Finished (terminal state)

### Task Display
Tasks are displayed with:
- Task text (truncated to 50 chars if needed)
- Current state emoji and name
- Channel and creator information
- Creation timestamp
- Direct link to the task message

## Development Setup

### Prerequisites
- Node.js 20 or later
- npm 9 or later
- Docker and Docker Compose (for containerized deployment)

### Local Development
```bash
# Install dependencies
npm install

# Start in development mode with auto-reload
npm run dev

# Run linter
npm run lint

# Format code
npm run format

# Build for production
npm run build

# Start production build
npm start
```

### Database
The application uses SQLite for data storage. The database file is automatically created at the path specified by `SQLITE_PATH` in your `.env` file (defaults to `/data/tasks.db`).

When running with Docker, the database is persisted in a named volume `slack-task-tracker-data`.

### Troubleshooting

1. **Bot Not Responding**
   - Verify your Slack tokens are correct
   - Check if the bot is invited to the channel
   - Ensure the bot has all required permissions
   - Check application logs for errors

2. **Database Issues**
   - Ensure the database directory is writable
   - Check if SQLite file exists and has correct permissions
   - For Docker: verify volume mounting is correct

3. **Task State Issues**
   - Verify emoji names in .env match Slack's emoji names
   - Check if state transitions are allowed
   - Review application logs for transition errors

4. **Docker Volume Permissions**
   - If using Linux, you might need to adjust volume permissions:
     ```bash
     sudo chown -R 1000:1000 ./data
     ```

## Commands

1. `/tasks` - List all active (non-completed) tasks
   - Shows task text and metadata
   - Only visible to the user who runs the command
   - Includes direct links to tasks

2. `/task_states` - Show all available states and their transitions
   - Lists all workflow states
   - Shows allowed transitions between states
   - Shows emoji reactions for each state

## Security Considerations

1. **Token Security**
   - Never commit `.env` file
   - Rotate tokens periodically
   - Use secure token storage in production

2. **Data Privacy**
   - Bot only accesses channels it's invited to
   - Task data stored locally in SQLite
   - No external API calls except to Slack

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

### Code Style
- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write meaningful commit messages
- Add tests for new features

### Pull Request Process
1. Update documentation as needed
2. Update the CHANGELOG.md if present
3. Follow the pull request template
4. Request review from maintainers 