require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Config
const TOKEN = process.env.BOT_TOKEN || '8859315023:AAFn4-tPENjfYegz6FXh_fs_i8lgwoqU1v0';
const ADMIN_ID = process.env.ADMIN_ID || '8865474356';
const CHANNEL_ID = process.env.CHANNEL_ID || '@easygmailseller';
const CHANNEL_URL = 'https://t.me/easygmailseller';
const GMAIL_PRICE = 15;

const bot = new TelegramBot(TOKEN, { polling: true });

const DB_FILE = path.join(__dirname, 'database.json');
let db = { users: {}, submissions: {} };

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {}
}
function saveDb() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}
loadDb();

const userState = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!db.users[chatId]) {
    db.users[chatId] = { balance: 0, submitted: 0, approved: 0 };
    saveDb();
  }
  bot.sendMessage(chatId, '🎉 *স্বাগতম Easy Gmail Seller বটে!* 💎\n\n💰 প্রতি জিমেইলের জন্য পাবেন *১৫.০০ টাকা*\n💳 উইথড্র মাধ্যম: *bKash / Nagad*\n\n👇 নিচের বাটনে চাপ দিন:', {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{ text: '📥 Submit your own ✨' }],
        [{ text: '👤 My Profile 📊' }, { text: '💸 Withdraw 💳' }],
        [{ text: '📢 Channel 🚀' }]
      ],
      resize_keyboard: true
    }
  });
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/start')) return;

  if (text === '📥 Submit your own ✨') {
    userState[chatId] = { step: 'email' };
    return bot.sendMessage(chatId, '✍️ আপনার **Gmail Address** টি লিখে পাঠান (যেমন: `example@gmail.com`):', { parse_mode: 'Markdown' });
  }

  if (text === '👤 My Profile 📊') {
    const u = db.users[chatId] || { balance: 0, submitted: 0, approved: 0 };
    return bot.sendMessage(chatId, `👤 *আপনার প্রোফাইল:*\n\n💰 ব্যালেন্স: ${u.balance} টাকা\n📥 জমা দিয়েছেন: ${u.submitted} টি\n✅ অনুমোদিত: ${u.approved} টি`, { parse_mode: 'Markdown' });
  }

  if (text === '📢 Channel 🚀') {
    return bot.sendMessage(chatId, `📢 আমাদের চ্যানেল: ${CHANNEL_URL}`);
  }

  if (userState[chatId] && userState[chatId].step === 'email') {
    const email = text.trim();
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return bot.sendMessage(chatId, '❌ অবশ্যই @gmail.com থাকতে হবে!');
    }
    userState[chatId] = { step: 'password', email: email.toLowerCase() };
    return bot.sendMessage(chatId, '🔑 এবার এই জিমেইলের **পাসওয়ার্ড (Password)** লিখে পাঠান:');
  }

  if (userState[chatId] && userState[chatId].step === 'password') {
    const email = userState[chatId].email;
    const pass = text.trim();
    userState[chatId] = null;

    if (!db.users[chatId]) db.users[chatId] = { balance: 0, submitted: 0, approved: 0 };
    db.users[chatId].submitted += 1;
    saveDb();

    bot.sendMessage(chatId, '✅ *আপনার Gmail সফলভাবে জমা হয়েছে!* অ্যাডমিন ভেরিফাই করে অনুমোদন দিলে ব্যালেন্সে ১৫ টাকা যোগ হবে।', { parse_mode: 'Markdown' });

    bot.sendMessage(ADMIN_ID, `📥 *নতুন Gmail জমা পড়েছে!*\n\n👤 ইউজার: \`${chatId}\`\n📧 Gmail: \`${email}\`\n🔑 Pass: \`${pass}\``, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve (15 Tk)', callback_data: `app_${chatId}` }
        ]]
      }
    });
  }
});

bot.on('callback_query', (q) => {
  if (q.data.startsWith('app_')) {
    const uId = q.data.replace('app_', '');
    if (db.users[uId]) {
      db.users[uId].balance += GMAIL_PRICE;
      db.users[uId].approved += 1;
      saveDb();
      bot.sendMessage(uId, `🎉 আপনার জমা দেওয়া Gmail অনুমোদিত হয়েছে! ব্যালেন্সে +${GMAIL_PRICE} টাকা যোগ হয়েছে।`);
    }
    bot.sendMessage(ADMIN_ID, `✅ ইউজার ${uId} এর জিমেইল অনুমোদিত হয়েছে!`);
  }
  bot.answerCallbackQuery(q.id);
});

// Render Web Port
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot Online 24/7');
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
