# 🐳 Notification System

Docker Image Checker includes a built-in notification system that monitors your containers for image updates and sends alerts through various channels.

## 🚀 Overview

The system runs a background scheduler that checks for updates based on a configurable cron expression. When an update is detected, it sends a localized message to your enabled providers.

### Key Features
- **Deduplication**: You only get notified once per image update/digest.
- **Internationalization (i18n)**: Notifications are sent in your preferred language (EN, ES, PT).
- **Hidden Containers Integration**: Containers you hide in the dashboard are automatically excluded from notifications.
- **Persistence**: Notification state is stored in `data/notifications-state.json` to survive restarts.

---

## ⚙️ Configuration

All configuration is handled through environment variables. You can find these in your `.env` or `compose.yaml` file.

### General Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTIFICATIONS_ENABLED` | Enable or disable the entire notification system. | `false` |
| `NOTIFICATIONS_LANGUAGE` | Default language for notifications (`en`, `es`, `pt`). | `en` |
| `NOTIFICATIONS_CRON_SCHEDULE` | Cron expression for update checks. | `0 */6 * * *` (Every 6h) |
| `TZ` | Timezone for the scheduler (e.g., `America/Guayaquil`). | System Time |

> [!TIP]
> **Smart Language Detection**: If you use the dashboard, the system automatically synchronizes your browser language and uses it for notifications, overriding the default `NOTIFICATIONS_LANGUAGE`.

---

## 📢 Notification Providers

### 📨 Telegram
1. Create a bot using [@BotFather](https://t.me/botfather) and get the **Token**.
2. Get your **Chat ID** using [@userinfobot](https://t.me/userinfobot).
3. Set the following variables:
   ```bash
   TELEGRAM_ENABLED=true
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

### 🔔 ntfy (https://ntfy.sh)
1. Choose a unique **Topic** name (e.g., `my-docker-alerts`).
2. (Optional) Configure a custom server or authentication.
3. Set the following variables:
   ```bash
   NTFY_ENABLED=true
   NTFY_TOPIC=your_topic_here
   # Optional
   NTFY_SERVER=https://ntfy.sh
   NTFY_TOKEN=your_access_token # Or NTFY_USERNAME/NTFY_PASSWORD
   ```

### 💬 Discord
1. In your Discord server: `Server Settings` > `Integrations` > `Webhooks` > `New Webhook`.
2. Copy the **Webhook URL**.
3. Set the following variables:
   ```bash
   DISCORD_ENABLED=true
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```

---

## 🔍 Verification & Troubleshooting

### Health Check Endpoint
You can check the current status of the notification system via the API:
`GET /api/notifications/health`

This returns:
- If notifications are enabled.
- The next scheduled check.
- The currently detected language.
- Connection status for each provider.

### Manual Test
To trigger a manual check and send a test notification if updates are found:
`POST /api/notifications/check` (Requires authentication if enabled)

### Persistence
The system stores its state in `data/notifications-state.json`. If you are using Docker, make sure this directory is mounted as a volume to keep track of already notified updates across restarts.

```yaml
volumes:
  - ./data:/app/data
```
