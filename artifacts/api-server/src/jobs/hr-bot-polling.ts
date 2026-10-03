import { logger } from "../lib/logger";
import { handleTelegramUpdate } from "../routes/telegram";
import {
  deleteWebhook,
  getMe,
  getUpdates,
  isTelegramConfigured,
  miniAppEntryUrl,
  setChatMenuWebApp,
  setMyCommands,
  shouldHrBotUsePolling,
} from "../lib/telegram";

let started = false;
let offset = 0;
let running = false;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    const updates = await getUpdates(offset || undefined, 25);
    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        await handleTelegramUpdate(update);
      } catch (err) {
        logger.warn({ err, updateId: update.update_id }, "BORDO HR bot xabari ishlanmadi");
      }
    }
  } catch (err) {
    logger.warn({ err }, "BORDO HR bot polling xato");
    await new Promise((r) => setTimeout(r, 3000));
  } finally {
    running = false;
  }
}

export function startHrBotPollingJob() {
  if (started) return;
  if (!isTelegramConfigured()) {
    logger.info("BORDO HR bot: TELEGRAM_BOT_TOKEN yo‘q — o‘chirilgan");
    return;
  }
  if (!shouldHrBotUsePolling()) {
    logger.info("BORDO HR bot: webhook rejimi");
    return;
  }

  started = true;
  void (async () => {
    try {
      await deleteWebhook();
    } catch (err) {
      logger.warn({ err }, "BORDO HR bot deleteWebhook");
    }
    try {
      await setMyCommands([
        { command: "start", description: "Boshlash / kirish" },
        { command: "holat", description: "Akkaunt va kirish" },
        { command: "davomat", description: "Face ID davomat" },
        { command: "chiqish", description: "Bog‘lanishni uzish" },
        { command: "yordam", description: "Yordam" },
      ]);
    } catch (err) {
      logger.warn({ err }, "BORDO HR bot buyruqlari yozilmadi");
    }
    let username = "";
    try {
      const me = await getMe();
      username = me.username ? `@${me.username}` : "";
    } catch {
      username = "";
    }
    try {
      const menuUrl = miniAppEntryUrl();
      if (menuUrl?.startsWith("https://")) await setChatMenuWebApp(menuUrl);
    } catch (err) {
      logger.warn({ err }, "BORDO HR bot menyu tugmasi yozilmadi");
    }
    logger.info({ username }, "BORDO HR bot ishga tushdi — login va parolni qabul qiladi");
    for (;;) {
      await pollOnce();
    }
  })();
}
