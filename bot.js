/**
 * Easy Gmail Seller Telegram Bot (24/7 Production Edition)
 * Configured for GitHub + Render.com deployment directly from Mobile / Desktop
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Global exception protection to keep Render 24/7 web service alive
process.on('uncaughtException', (err) => {
  console.error('Safely caught uncaughtException:', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('Safely caught unhandledRejection:', reason);
});

// Render Web Service requires an immediate HTTP server listening on 0.0.0.0:$PORT
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Easy Gmail Seller Bot is 24/7 ONLINE! @' + (botUsername || 'bot'));
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Render Web Service is successfully listening on 0.0.0.0:' + PORT);
});

// Keep-alive heartbeat so the Node.js event loop never terminates
setInterval(() => {}, 1000 * 60 * 60);

// Configuration from Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN || '8812427782:AAFR5tLOKmAt0cweylpjrbScn0NrsgCWN3c';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '8865474356', 10);
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@easygmailseller';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/easygmailseller';
const SUPPORT_URL = process.env.SUPPORT_URL || 'https://t.me/easygmailsellerUSA';
const GMAIL_REWARD = parseInt(process.env.GMAIL_REWARD || '15', 10);
const REFERRAL_REWARD = parseInt(process.env.REFERRAL_REWARD || '2', 10);
const MIN_WITHDRAWAL = parseInt(process.env.MIN_WITHDRAWAL || '15', 10);
const USD_RATE = parseFloat(process.env.USD_RATE || '120');
const MIN_WITHDRAWAL_USD = parseFloat(process.env.MIN_WITHDRAWAL_USD || '0.15');

if (!BOT_TOKEN || BOT_TOKEN.includes('TOKEN_HERE')) {
  console.warn('⚠️ NOTICE: BOT_TOKEN is not configured yet. Web service will run for Render health check.');
}

// Local lightweight JSON Database for Render persistent/auto storage
const DB_FILE = path.join(__dirname, 'bot_data.json');
let db = { users: {}, submissions: [], withdrawals: [] };
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error loading db file, starting fresh', e);
  }
}
function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving db:', e);
  }
}

// Temporary in-memory states
const userStates = {};

const bot = new TelegramBot(BOT_TOKEN || 'DUMMY_TOKEN', {
  polling: BOT_TOKEN && !BOT_TOKEN.includes('TOKEN_HERE') ? {
    params: {
      allowed_updates: JSON.stringify(['message', 'callback_query', 'chat_member', 'my_chat_member']),
    },
  } : false,
});
let botUsername = '';

bot.on('polling_error', (error) => {
  if (error && error.message && error.message.includes('409 Conflict')) {
    console.log('Notice: 409 Conflict (polling collision). Waiting next poll...');
  } else {
    console.warn('Telegram Polling warning:', error && error.message ? error.message : error);
  }
});

if (BOT_TOKEN && !BOT_TOKEN.includes('TOKEN_HERE')) {
  bot.getMe().then((me) => {
    botUsername = me.username;
    console.log('Easy Gmail Seller Bot online as @' + me.username);
    console.log('Admin ID: ' + ADMIN_ID);
  }).catch((err) => {
    console.error('Failed to connect bot:', err.message);
  });
}

// Real-time channel leave detector
bot.on('chat_member', async (update) => {
  try {
    const targetUser = update && update.new_chat_member && update.new_chat_member.user ? update.new_chat_member.user : update.from;
    const userId = targetUser ? targetUser.id : null;
    if (!userId) return;

    const newStatus = update && update.new_chat_member ? update.new_chat_member.status : null;

    if (newStatus === 'left' || newStatus === 'kicked') {
      if (db.users[userId]) {
        db.users[userId].hasJoinedChannel = false;
        saveDB();
        console.log('User ' + userId + ' left channel. Revoking bot access.');

        const lang = db.users[userId].lang || 'bn';
        const textBn =
          '⚠️ *সতর্কবার্তা:* আপনি আমাদের অফিশিয়াল টেলিগ্রাম চ্যানেল (' + CHANNEL_USERNAME + ') ত্যাগ করেছেন!\n\n' +
          '🔒 চ্যানেলে যুক্ত না থাকলে বটের কোনো ফিচার (Gmail বিক্রি, ব্যালেন্স দেখা, বিকাশ ক্যাশআউট) কাজ করবে না।\n\n' +
          'বটের সেবা পুনরায় সচল করতে নিচের লিংকে গিয়ে আবার চ্যানেলে যুক্ত হয়ে ভেরিফাই করুন:';
        const textEn =
          '⚠️ *Notice:* You have left our official Telegram channel (' + CHANNEL_USERNAME + ')!\n\n' +
          '🔒 Bot features and withdrawals are temporarily locked until you rejoin.\n\n' +
          'Please rejoin the channel and click Verify Join:';

        await bot.sendMessage(userId, lang === 'bn' ? textBn : textEn, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: lang === 'bn' ? '📢 চ্যানেলে পুনরায় যুক্ত হোন' : '📢 Rejoin Channel', url: CHANNEL_URL }],
              [{ text: lang === 'bn' ? '✅ ভেরিফাই করুন (Verify)' : '✅ Verify Join', callback_data: 'check_join' }],
            ],
          },
        }).catch(() => {});
      }
    } else if (['member', 'administrator', 'creator'].includes(newStatus)) {
      if (db.users[userId]) {
        db.users[userId].hasJoinedChannel = true;
        saveDB();
      }
    }
  } catch (err) {
    console.warn('chat_member handler warning:', err.message);
  }
});


// Helper: Check Channel Membership
async function isChannelMember(userId) {
  if (userId === ADMIN_ID) return true;
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.warn('Channel check warning for ' + userId + ': ' + errMsg);
    if (errMsg.includes('member list is inaccessible') || errMsg.includes('CHAT_ADMIN_REQUIRED') || errMsg.includes('chat not found')) {
      console.warn('Bot is not an administrator in ' + CHANNEL_USERNAME + '. Please promote the bot to Administrator in the channel. Allowing verification gracefully.');
      return true;
    }
    return false;
  }
}

function getMainMenuKeyboard(lang, isAdmin = false) {
  const kb = [
    [{ text: '📥 Submit your own' }, { text: '👤 My Profile' }],
    [{ text: '📑 My Accounts' }, { text: '💳 Withdraw' }],
    [{ text: '👥 Refer & Earn' }, { text: '💬 Support' }],
    [{ text: '📢 Official Channel' }],
  ];
  if (isAdmin) {
    kb.push([{ text: '👑 Admin Panel' }]);
  }
  return {
    keyboard: kb,
    resize_keyboard: true,
  };
}

async function sendAdminPanel(chatId, userId) {
  if (userId !== ADMIN_ID) {
    await bot.sendMessage(chatId, '❌ Admin only!');
    return;
  }
  const totalUsers = Object.keys(db.users).length;
  const pendingGmails = db.submissions.filter((s) => s.status === 'pending').length;
  const approvedGmails = db.submissions.filter((s) => s.status === 'approved').length;
  const pendingWd = db.withdrawals.filter((w) => w.status === 'pending').length;
  const pendingWdAmount = db.withdrawals.filter((w) => w.status === 'pending').reduce((a, c) => a + c.amount, 0);

  const text =
    '👑 *Easy Gmail Seller — Admin Panel*\n' +
    '━━━━━━━━━━━━━━━━━━━━━━\n' +
    '📊 *Live Stats:*\n' +
    '• 👥 Users: *' + totalUsers + '*\n' +
    '• ⏳ Pending Gmails: *' + pendingGmails + '*\n' +
    '• ✅ Approved Gmails: *' + approvedGmails + '*\n' +
    '• 💳 Pending Cashouts: *' + pendingWd + '* (৳ ' + pendingWdAmount + ')\n' +
    '• 💰 Rate per Gmail: *৳ ' + GMAIL_REWARD + ' TK*\n' +
    '• 💸 Min Withdrawal: *৳ ' + MIN_WITHDRAWAL + ' TK*\n' +
    '━━━━━━━━━━━━━━━━━━━━━━\n' +
    'Select an option below:';

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📥 Pending Gmails (' + pendingGmails + ')', callback_data: 'adm_view_pending_gmails' },
          { text: '💳 Pending Cashouts (' + pendingWd + ')', callback_data: 'adm_view_pending_wds' },
        ],
        [
          { text: '📢 Broadcast Message', callback_data: 'adm_start_broadcast' },
          { text: '🔄 Refresh Panel', callback_data: 'adm_refresh_panel' },
        ],
      ],
    },
  });
}

async function showChannelGatekeeper(chatId, lang, isRejoin = false) {
  const textBn = isRejoin
    ? '⚠️ *সতর্কবার্তা:* আপনি চ্যানেল থেকে বের হয়ে গেছেন!\n\nবটের সকল ফিচার ব্যবহারের জন্য পুনরায় আমাদের অফিশিয়াল চ্যানেলে যুক্ত হন এবং ভেরিফাই করুন:'
    : '📢 *চ্যানেলে যুক্ত হওয়া বাধ্যতামূলক!*\n\n' +
      'বটের সকল ফিচার ব্যবহারের জন্য প্রথমে আমাদের অফিসিয়াল টেলিগ্রাম চ্যানেলে যুক্ত হন। তারপর নিচে *ভেরিফাই করুন* বাটনে চাপ দিন।';
  const textEn = isRejoin
    ? '⚠️ *Warning:* You have left our channel!\n\nPlease rejoin our official channel to continue using the bot and click Verify Join:'
    : '📢 *Channel Join Required!*\n\n' +
      'Please join our official Telegram channel first to use this bot. Then click *Verify Join* below.';

  await bot.sendMessage(chatId, lang === 'bn' ? textBn : textEn, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: lang === 'bn' ? (isRejoin ? '📢 চ্যানেলে পুনরায় যুক্ত হোন' : '📢 চ্যানেলে যুক্ত হোন') : (isRejoin ? '📢 Rejoin Channel' : '📢 Join Channel'), url: CHANNEL_URL }],
        [{ text: lang === 'bn' ? '✅ ভেরিফাই করুন (Verify)' : '✅ Verify Join', callback_data: 'check_join' }],
      ],
    },
  });
}

// /start command
bot.onText(new RegExp('^/start(.*)'), async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name || 'User';
  const param = (match && match[1] ? match[1].trim() : '');

  const isExistingUser = !!db.users[userId];

  if (!isExistingUser) {
    let referrerId = null;
    if (param.startsWith('ref_')) {
      const refParsed = parseInt(param.replace('ref_', ''), 10);
      if (!isNaN(refParsed) && refParsed !== userId) {
        referrerId = refParsed;
      }
    }

    db.users[userId] = {
      id: userId,
      name: userName,
      username: msg.from.username,
      lang: 'bn',
      hasSelectedLanguage: false,
      hasJoinedChannel: false,
      referrerId,
      holdBalance: 0,
      approvedBalance: 0,
      totalWithdrawn: 0,
      totalTasks: 0,
      referralEarnings: 0,
      createdAt: new Date().toISOString(),
    };
    saveDB();
  }

  const user = db.users[userId];
  userStates[userId] = { step: 'IDLE' };

  // IF USER HAS ALREADY SELECTED LANGUAGE (NOT FIRST TIME):
  // Directly open Main Dashboard!
  if (user.hasSelectedLanguage) {
    const joined = await isChannelMember(userId);
    if (!joined) {
      user.hasJoinedChannel = false;
      saveDB();
      await showChannelGatekeeper(chatId, user.lang || 'bn', true);
      return;
    }

    user.hasJoinedChannel = true;
    saveDB();
    await bot.sendMessage(
      chatId,
      user.lang === 'bn'
        ? '🎉 *স্বাগতম Easy Gmail Seller বটে!*\n\nপ্রতি জিমেইল: *৳ ' + GMAIL_REWARD + ' টাকা*\nরেফার বোনাস: *৳ ' + REFERRAL_REWARD + ' টাকা*\nবিকাশ পেমেন্ট: *প্রতি শুক্রবার ও সোমবার*\nসর্বনিম্ন উত্তোলন: *৳ ' + MIN_WITHDRAWAL + ' টাকা*\n\nনিচের অপশন থেকে নির্বাচন করুন:'
        : '🎉 *Welcome to Easy Gmail Seller Bot!*\n\nRate per Gmail: *৳ ' + GMAIL_REWARD + ' TK*\nReferral Bonus: *৳ ' + REFERRAL_REWARD + ' TK*\nbKash Payout: *Every Friday & Monday*\nMinimum Withdrawal: *৳ ' + MIN_WITHDRAWAL + ' TK*\n\nChoose an option below:',
      { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(user.lang || 'bn') }
    );
    return;
  }

  // FIRST TIME ONLY: Show language selection prompt
  await bot.sendMessage(
    chatId,
    '👋 *স্বাগতম / Welcome ' + userName + '!*\n\nঅনুগ্রহ করে আপনার ভাষা নির্বাচন করুন:\nPlease select your preferred language:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇧🇩 বাংলা (Bangla)', callback_data: 'lang_bn' },
            { text: '🇬🇧 English', callback_data: 'lang_en' },
          ],
        ],
      },
    }
  );
});

// /language command to change language anytime
bot.onText(new RegExp('^/language'), async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    '🌐 *ভাষা নির্বাচন / Select Language:*\n\nপছন্দের ভাষা বেছে নিন / Choose your preferred language:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇧🇩 বাংলা (Bangla)', callback_data: 'lang_bn' },
            { text: '🇬🇧 English', callback_data: 'lang_en' },
          ],
        ],
      },
    }
  );
});

// Callback queries handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;
  const data = query.data || '';

  if (data === 'lang_bn' || data === 'lang_en') {
    const lang = data === 'lang_bn' ? 'bn' : 'en';
    if (db.users[userId]) {
      db.users[userId].lang = lang;
      db.users[userId].hasSelectedLanguage = true;
      saveDB();
    }

    const joined = await isChannelMember(userId);
    if (joined) {
      if (db.users[userId]) db.users[userId].hasJoinedChannel = true;
      saveDB();
      await bot.answerCallbackQuery(query.id, { text: lang === 'bn' ? 'ভাষা সেভ হয়েছে!' : 'Language saved!' });
      await bot.sendMessage(
        chatId,
        lang === 'bn'
          ? '🎉 *Easy Gmail Seller বটে আপনাকে স্বাগতম!*\n\nপ্রতি জিমেইল: *৳ ' + GMAIL_REWARD + ' টাকা*\nরেফার বোনাস: *৳ ' + REFERRAL_REWARD + ' টাকা*\nবিকাশ পেমেন্ট: *প্রতি শুক্রবার ও সোমবার*\nসর্বনিম্ন উত্তোলন: *৳ ' + MIN_WITHDRAWAL + ' টাকা*\n\nনিচের অপশন থেকে নির্বাচন করুন:'
          : '🎉 *Welcome to Easy Gmail Seller Bot!*\n\nRate per Gmail: *৳ ' + GMAIL_REWARD + ' TK*\nReferral Bonus: *৳ ' + REFERRAL_REWARD + ' TK*\nbKash Payout: *Every Friday & Monday*\nMinimum Withdrawal: *৳ ' + MIN_WITHDRAWAL + ' TK*\n\nChoose an option below:',
        { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang) }
      );
    } else {
      await showChannelGatekeeper(chatId, lang, false);
    }
    return;
  }

  if (data === 'check_join') {
    const user = db.users[userId] || { lang: 'bn' };
    const lang = user.lang || 'bn';
    const joined = await isChannelMember(userId);
    if (joined) {
      if (db.users[userId]) db.users[userId].hasJoinedChannel = true;
      saveDB();
      await bot.answerCallbackQuery(query.id, { text: '✅ চ্যানেল ভেরিফিকেশন সফল!' });
      await bot.sendMessage(
        chatId,
        lang === 'bn'
          ? '✅ আপনি সফলভাবে ভেরিফাইড হয়েছেন! নিচের মেন্যু থেকে জিমেইল বিক্রি বা উত্তোলন করুন:'
          : '✅ You are verified! Select an option below:',
        { reply_markup: getMainMenuKeyboard(lang) }
      );
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: lang === 'bn' ? '❌ আপনি এখনো চ্যানেলে যুক্ত হননি!' : '❌ You have not joined yet!',
        show_alert: true,
      });
    }
    return;
  }

  // Admin Approval for Gmail
  if (data.startsWith('adm_app_gmail_') || data.startsWith('adm_rej_gmail_')) {
    if (userId !== ADMIN_ID) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorized!', show_alert: true });
      return;
    }
    const isApp = data.startsWith('adm_app_gmail_');
    const subId = isApp ? data.replace('adm_app_gmail_', '') : data.replace('adm_rej_gmail_', '');
    const sub = db.submissions.find((s) => s.id === subId);
    if (!sub || sub.status !== 'pending') {
      await bot.answerCallbackQuery(query.id, { text: 'Already handled!', show_alert: true });
      return;
    }

    if (isApp) {
      sub.status = 'approved';
      const u = db.users[sub.userId];
      if (u) {
        u.holdBalance = Math.max(0, u.holdBalance - sub.reward);
        u.approvedBalance += sub.reward;
        u.totalTasks += 1;

        await bot.sendMessage(
          sub.userId,
          '🎉 *আপনার জিমেইলটি (' + sub.email + ') অ্যাপ্রুভ হয়েছে!*\n\n💰 আপনার একাউন্টে +৳ ' + sub.reward + ' টাকা যোগ করা হয়েছে।\nবর্তমান ব্যালেন্স: ৳ ' + u.approvedBalance.toFixed(2) + ' টাকা।',
          { parse_mode: 'Markdown' }
        ).catch(() => {});

        // Referral reward
        if (u.referrerId && db.users[u.referrerId]) {
          const refUser = db.users[u.referrerId];
          refUser.approvedBalance += REFERRAL_REWARD;
          refUser.referralEarnings += REFERRAL_REWARD;
          await bot.sendMessage(
            refUser.id,
            '🎁 *রেফার বোনাস পেয়েছেন!*\nআপনার রেফার করা ইউজার (' + u.id + ') ১টি জিমেইল সফলভাবে বিক্রি করেছেন!\nআপনি পেয়েছেন +৳ ' + REFERRAL_REWARD + ' টাকা।',
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      }
      saveDB();
      await bot.editMessageText((query.message.text || '') + '\n\n✅ *APPROVED (+15 TK)*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
      await bot.answerCallbackQuery(query.id, { text: 'Approved!' });
    } else {
      sub.status = 'rejected';
      const u = db.users[sub.userId];
      if (u) {
        u.holdBalance = Math.max(0, u.holdBalance - sub.reward);
        await bot.sendMessage(
          sub.userId,
          '❌ *দুঃখিত, আপনার জিমেইলটি (' + sub.email + ') বাতিল করা হয়েছে।*\n\n⚠️ কারণ: জিমেইলে সমস্যা পাওয়া গেছে (2FA অন/ভুল পাসওয়ার্ড/রিকভারি নম্বর)। ফ্রেশ জিমেইল দিন।',
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
      saveDB();
      await bot.editMessageText((query.message.text || '') + '\n\n❌ *REJECTED*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
      await bot.answerCallbackQuery(query.id, { text: 'Rejected!' });
    }
    return;
  }

  // Admin Approval for Withdrawals (BDT & USD)
  if (data.startsWith('adm_pay_wd_') || data.startsWith('adm_rej_wd_')) {
    if (userId !== ADMIN_ID) {
      await bot.answerCallbackQuery(query.id, { text: 'Unauthorized!', show_alert: true });
      return;
    }
    const isPay = data.startsWith('adm_pay_wd_');
    const wdId = isPay ? data.replace('adm_pay_wd_', '') : data.replace('adm_rej_wd_', '');
    const wd = db.withdrawals.find((w) => w.id === wdId);
    if (!wd || wd.status !== 'pending') {
      await bot.answerCallbackQuery(query.id, { text: 'Already handled!', show_alert: true });
      return;
    }

    const u = db.users[wd.userId];
    const isUsd = wd.currency === 'USD';
    const amountStr = isUsd ? '$ ' + wd.amount.toFixed(2) + ' USD' : '৳ ' + wd.amount.toFixed(2) + ' TK';
    const methodStr = wd.method || 'bKash';
    const accountStr = wd.phone || wd.account || '';

    if (isPay) {
      wd.status = 'paid';
      if (u) u.totalWithdrawn += (wd.amountBdt || wd.amount);
      saveDB();
      const userMsgBn = '✅ *' + methodStr + ' পেমেন্ট সফলভাবে পাঠানো হয়েছে!*\n\n' +
        '💳 মেথড: ' + methodStr + ' (' + (isUsd ? 'USD' : 'BDT') + ')\n' +
        '📱 একাউন্ট: ' + accountStr + '\n' +
        '💵 পরিমাণ: ' + amountStr + '\n\n' +
        'আমাদের সাথে কাজ করার জন্য ধন্যবাদ!';
      const userMsgEn = '✅ *' + methodStr + ' Payment Sent!*\n\n' +
        '💳 Method: ' + methodStr + ' (' + (isUsd ? 'USD' : 'BDT') + ')\n' +
        '📱 Account: ' + accountStr + '\n' +
        '💵 Amount: ' + amountStr + '\n\n' +
        'Thank you for working with us!';
      await bot.sendMessage(
        wd.userId,
        (u && u.lang === 'en') ? userMsgEn : userMsgBn,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
      await bot.editMessageText((query.message.text || '') + '\n\n✅ *PAID via ' + methodStr + ' (' + amountStr + ')*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
      await bot.answerCallbackQuery(query.id, { text: 'Marked as Paid!' });
    } else {
      wd.status = 'rejected';
      const refundAmt = wd.amountBdt || wd.amount;
      if (u) u.approvedBalance += refundAmt; // refund
      saveDB();
      const userRejBn = '❌ আপনার ' + methodStr + ' উত্তোলন রিকোয়েস্ট বাতিল করা হয়েছে এবং ৳ ' + refundAmt.toFixed(2) + ' টাকা একাউন্টে রিফান্ড করা হয়েছে।';
      const userRejEn = '❌ Your ' + methodStr + ' cashout request was rejected and ৳ ' + refundAmt.toFixed(2) + ' TK refunded to balance.';
      await bot.sendMessage(
        wd.userId,
        (u && u.lang === 'en') ? userRejEn : userRejBn,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
      await bot.editMessageText((query.message.text || '') + '\n\n❌ *REJECTED & REFUNDED*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });
      await bot.answerCallbackQuery(query.id, { text: 'Rejected & Refunded!' });
    }
    return;
  }

  // Currency Selection for Withdrawals
  if (data === 'wd_curr_bdt') {
    const u = db.users[userId] || {};
    const lang = u.lang || 'bn';
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '🇧🇩 *BDT উত্তোলন মেথড বেছে নিন:*\n\n' +
          '💰 ব্যালেন্স: ৳ ' + (u.approvedBalance || 0).toFixed(2) + ' টাকা\n' +
          '💵 সর্বনিম্ন উত্তোলন: ৳ ' + MIN_WITHDRAWAL + ' টাকা\n\n' +
          'পেমেন্ট নেওয়ার জন্য বিকাশ অথবা নগদ নির্বাচন করুন:'
        : '🇧🇩 *Select BDT Withdrawal Method:*\n\n' +
          '💰 Balance: ৳ ' + (u.approvedBalance || 0).toFixed(2) + ' TK\n' +
          '💵 Minimum: ৳ ' + MIN_WITHDRAWAL + ' TK\n\n' +
          'Choose your BDT payment wallet:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 বিকাশ (bKash)', callback_data: 'wd_m_bkash' },
              { text: '📱 নগদ (Nagad)', callback_data: 'wd_m_nagad' },
            ],
            [{ text: lang === 'bn' ? '🔙 বাতিল (Cancel)' : '🔙 Cancel', callback_data: 'cancel_withdraw' }],
          ],
        },
      }
    );
    return;
  }

  if (data === 'wd_curr_usd') {
    const u = db.users[userId] || {};
    const lang = u.lang || 'bn';
    const approxUsd = ((u.approvedBalance || 0) / USD_RATE).toFixed(2);
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '💵 *USD উত্তোলন মেথড বেছে নিন:*\n\n' +
          '💰 ব্যালেন্স: ৳ ' + (u.approvedBalance || 0).toFixed(2) + ' টাকা (~$' + approxUsd + ' USD)\n' +
          '📊 এক্সচেঞ্জ রেট: 1 USD = ' + USD_RATE + ' BDT\n' +
          '💵 সর্বনিম্ন উত্তোলন: $' + MIN_WITHDRAWAL_USD + ' USD\n\n' +
          'পেমেন্ট নেওয়ার জন্য নিচের মেথড বেছে নিন:'
        : '💵 *Select USD Withdrawal Method:*\n\n' +
          '💰 Balance: ৳ ' + (u.approvedBalance || 0).toFixed(2) + ' TK (~$' + approxUsd + ' USD)\n' +
          '📊 Exchange Rate: 1 USD = ' + USD_RATE + ' BDT\n' +
          '💵 Minimum: $' + MIN_WITHDRAWAL_USD + ' USD\n\n' +
          'Choose your preferred USD payment wallet:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟡 Binance Pay ID', callback_data: 'wd_m_binance' }],
            [
              { text: '🪙 USDT (BEP20 / TRC20)', callback_data: 'wd_m_usdt' },
              { text: '🅿️ Payeer USD', callback_data: 'wd_m_payeer' },
            ],
            [{ text: lang === 'bn' ? '🔙 বাতিল (Cancel)' : '🔙 Cancel', callback_data: 'cancel_withdraw' }],
          ],
        },
      }
    );
    return;
  }

  // Selected BDT Method
  if (data === 'wd_m_bkash' || data === 'wd_m_nagad') {
    const u = db.users[userId] || {};
    const lang = u.lang || 'bn';
    const method = data === 'wd_m_nagad' ? 'Nagad' : 'bKash';
    userStates[userId] = { step: 'WAIT_BDT_PHONE', method, currency: 'BDT' };
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '📱 *' + method + ' নম্বর প্রদান করুন:*\n\n' +
          'আপনার ব্যক্তিগত ১১ ডিজিটের ' + method + ' নম্বরটি লিখুন (যেমন: 017XXXXXXXX):\n\n' +
          '*(বাতিল করতে নিচে ❌ Cancel চাপুন)*'
        : '📱 *Enter ' + method + ' Number:*\n\n' +
          'Enter your 11-digit ' + method + ' mobile number (e.g. 017XXXXXXXX):\n\n' +
          '*(To cancel, tap ❌ Cancel below)*',
      {
        parse_mode: 'Markdown',
        reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
      }
    );
    return;
  }

  // Selected USD Method
  if (data === 'wd_m_binance' || data === 'wd_m_usdt' || data === 'wd_m_payeer') {
    const u = db.users[userId] || {};
    const lang = u.lang || 'bn';
    const method = data === 'wd_m_binance' ? 'Binance Pay' : (data === 'wd_m_usdt' ? 'USDT' : 'Payeer');
    userStates[userId] = { step: 'WAIT_USD_ACCOUNT', method, currency: 'USD' };
    await bot.answerCallbackQuery(query.id);

    let promptBn = '';
    let promptEn = '';
    if (data === 'wd_m_binance') {
      promptBn = '🟡 *Binance Pay ID / Email প্রদান করুন:*\n\nআপনার Binance Pay ID অথবা একাউন্ট Email লিখুন:';
      promptEn = '🟡 *Enter Binance Pay ID or Email:*\n\nPlease type your Binance Pay ID or account email:';
    } else if (data === 'wd_m_usdt') {
      promptBn = '🪙 *USDT Wallet Address প্রদান করুন:*\n\nআপনার USDT Address লিখুন (BEP20 বা TRC20 নেটওয়ার্ক):';
      promptEn = '🪙 *Enter USDT Wallet Address:*\n\nPlease paste your USDT Address (BEP20 or TRC20):';
    } else {
      promptBn = '🅿️ *Payeer Account ID প্রদান করুন:*\n\nআপনার Payeer Account ID লিখুন (যেমন: P12345678):';
      promptEn = '🅿️ *Enter Payeer Account ID:*\n\nPlease enter your Payeer Account (e.g. P12345678):';
    }

    await bot.sendMessage(
      chatId,
      (lang === 'bn' ? promptBn : promptEn) + '\n\n*(বাতিল করতে নিচে ❌ Cancel চাপুন)*',
      {
        parse_mode: 'Markdown',
        reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
      }
    );
    return;
  }

  // Final submission confirmation
  if (data === 'confirm_sub') {
    const st = userStates[userId];
    if (!st || !st.tempEmail || !st.tempPassword) {
      await bot.answerCallbackQuery(query.id, { text: 'Session expired!' });
      return;
    }
    const subId = 'GM_' + Date.now().toString(36).toUpperCase();
    const newSub = {
      id: subId,
      userId,
      userName: query.from.first_name || 'User',
      email: st.tempEmail,
      password: st.tempPassword,
      status: 'pending',
      reward: GMAIL_REWARD,
      submittedAt: new Date().toISOString(),
    };
    db.submissions.unshift(newSub);
    if (db.users[userId]) db.users[userId].holdBalance += GMAIL_REWARD;
    saveDB();
    userStates[userId] = { step: 'IDLE' };

    await bot.answerCallbackQuery(query.id, { text: 'সফলভাবে সাবমিট হয়েছে!' });
    await bot.sendMessage(
      chatId,
      '✅ *আপনার জিমেইল সফলভাবে জমা হয়েছে!*\n\n📧 Email: ' + newSub.email + '\n💰 মূল্য: *৳ ' + GMAIL_REWARD + ' টাকা*\n⏳ স্ট্যাটাস: *পেন্ডিং (যাচাইাধীন)*\n\nএডমিন ভেরিফাই করে দ্রুত অ্যাপ্রুভ করবেন।',
      { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(db.users[userId]?.lang || 'bn') }
    );

    // Send Alert to Admin
    await bot.sendMessage(
      ADMIN_ID,
      '🔔 *নতুন জিমেইল সাবমিশন এসেছে!*\n\n🆔 Task: #' + subId + '\n👤 User: ' + newSub.userName + ' (' + userId + ')\n📧 *Email:* ' + newSub.email + '\n🔑 *Password:* ' + newSub.password + '\n💰 মূল্য: ৳ ' + GMAIL_REWARD + '\n\nযাচাই করে নিচের বাটনে চাপুন:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve (+15 TK)', callback_data: 'adm_app_gmail_' + subId },
              { text: '❌ Reject', callback_data: 'adm_rej_gmail_' + subId },
            ],
          ],
        },
      }
    ).catch((e) => console.error('Admin notify error:', e.message));
    return;
  }

  if (data === 'cancel_sub' || data === 'cancel_withdraw') {
    userStates[userId] = { step: 'IDLE' };
    await bot.answerCallbackQuery(query.id, { text: 'বাতিল করা হয়েছে' });
    await bot.sendMessage(chatId, '❌ বাতিল করা হয়েছে। মূল মেন্যুতে ফিরে যাওয়া হলো।', {
      reply_markup: getMainMenuKeyboard(db.users[userId]?.lang || 'bn', userId === ADMIN_ID),
    });
    return;
  }

  // Admin callbacks
  if (data === 'adm_view_pending_gmails') {
    if (userId !== ADMIN_ID) return;
    const pending = db.submissions.filter((s) => s.status === 'pending');
    if (!pending.length) {
      await bot.answerCallbackQuery(query.id, { text: '✅ কোনো পেন্ডিং জিমেইল নেই!', show_alert: true });
      return;
    }
    await bot.answerCallbackQuery(query.id);
    for (const s of pending.slice(0, 5)) {
      await bot.sendMessage(
        chatId,
        '🆔 #' + s.id + '\n📧 Email: *' + s.email + '*\n🔑 Pass: *' + s.password + '*\n👤 User: ' + s.userName + ' (' + s.userId + ')\n💰 রেট: ৳ ' + s.reward,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve (+15 TK)', callback_data: 'adm_app_gmail_' + s.id },
                { text: '❌ Reject', callback_data: 'adm_rej_gmail_' + s.id },
              ],
            ],
          },
        }
      );
    }
    return;
  }

  if (data === 'adm_view_pending_wds') {
    if (userId !== ADMIN_ID) return;
    const pending = db.withdrawals.filter((w) => w.status === 'pending');
    if (!pending.length) {
      await bot.answerCallbackQuery(query.id, { text: '✅ কোনো পেন্ডিং ক্যাশআউট নেই!', show_alert: true });
      return;
    }
    await bot.answerCallbackQuery(query.id);
    for (const w of pending.slice(0, 5)) {
      await bot.sendMessage(
        chatId,
        '🆔 #' + w.id + '\n📱 bKash: *' + w.phone + '*\n💵 টাকা: ৳ ' + w.amount + '\n👤 User: ' + w.userName + ' (' + w.userId + ')',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Mark Paid', callback_data: 'adm_pay_wd_' + w.id },
                { text: '❌ Reject & Refund', callback_data: 'adm_rej_wd_' + w.id },
              ],
            ],
          },
        }
      );
    }
    return;
  }

  if (data === 'adm_start_broadcast') {
    if (userId !== ADMIN_ID) return;
    userStates[userId] = { step: 'WAIT_BROADCAST' };
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, '📢 সকল ইউজারকে যে নোটিশ পাঠাতে চান তা লিখে পাঠান (বাতিল করতে ❌ Cancel লিখুন):', {
      reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
    });
    return;
  }

  if (data === 'adm_refresh_panel') {
    if (userId !== ADMIN_ID) return;
    await bot.answerCallbackQuery(query.id, { text: '🔄 রিফ্রেশ করা হয়েছে!' });
    await sendAdminPanel(chatId, userId);
    return;
  }
});

// Admin command
bot.onText(new RegExp('^/admin'), async (msg) => {
  await sendAdminPanel(msg.chat.id, msg.from.id);
});

// Channel command
bot.onText(new RegExp('^/channel'), async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    '📢 *আমাদের অফিশিয়াল চ্যানেল:*\n\nযুক্ত হতে নিচে বাটনে ক্লিক করুন:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '📢 Join Official Channel', url: CHANNEL_URL }]],
      },
    }
  );
});

// Text messages handler
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  const isAdmin = userId === ADMIN_ID;

  const user = db.users[userId] || {
    id: userId,
    name: msg.from.first_name || 'User',
    lang: 'bn',
    hasJoinedChannel: false,
    holdBalance: 0,
    approvedBalance: 0,
    totalWithdrawn: 0,
    totalTasks: 0,
    referralEarnings: 0,
  };
  const lang = user.lang || 'bn';
  const state = userStates[userId] || { step: 'IDLE' };

  // 🔴 IMMEDIATE CANCEL / BACK / MENU CHECK
  const lowerText = text.toLowerCase();
  if (
    text === '❌ Cancel' ||
    text === '❌ বাতিল' ||
    text === '🔙 Back' ||
    text === '🔙 পিছনে' ||
    lowerText === 'cancel' ||
    lowerText === '/cancel' ||
    lowerText === 'back' ||
    lowerText === '/back' ||
    lowerText === 'menu' ||
    lowerText === '/menu' ||
    lowerText === 'মেনু' ||
    lowerText === 'মেন্যু' ||
    lowerText === 'বাতিল' ||
    lowerText.includes('বাতিল') ||
    lowerText.includes('cancel')
  ) {
    userStates[userId] = { step: 'IDLE' };
    await bot.sendMessage(
      chatId,
      lang === 'bn' ? '❌ প্রক্রিয়াটি বাতিল করা হয়েছে। মূল মেন্যুতে ফিরে আসা হলো।' : '❌ Cancelled. Returned to main menu.',
      { reply_markup: getMainMenuKeyboard(lang, isAdmin) }
    );
    return;
  }

  // Verify channel membership: if user left, lock features and show warning (except admin)
  if (!isAdmin) {
    const joined = await isChannelMember(userId);
    if (!joined) {
      user.hasJoinedChannel = false;
      saveDB();
      await showChannelGatekeeper(chatId, lang, true);
      return;
    } else {
      if (!user.hasJoinedChannel) {
        user.hasJoinedChannel = true;
        saveDB();
      }
    }
  }

  // Admin Broadcast State
  if (isAdmin && state.step === 'WAIT_BROADCAST') {
    userStates[userId] = { step: 'IDLE' };
    const allUsers = Object.values(db.users);
    let sent = 0;
    for (const u of allUsers) {
      try {
        await bot.sendMessage(u.id, '📢 *অফিশিয়াল নোটিশ:*\n\n' + text, { parse_mode: 'Markdown' });
        sent++;
      } catch (e) {}
    }
    await bot.sendMessage(chatId, '✅ সফলভাবে ' + sent + '/' + allUsers.length + ' জন ইউজারের কাছে নোটিশ পাঠানো হয়েছে!', {
      reply_markup: getMainMenuKeyboard(lang, true),
    });
    return;
  }

  // Submission Flow Step 1: Email
  if (state.step === 'WAIT_EMAIL') {
    if (/\s/.test(text)) {
      await bot.sendMessage(chatId, lang === 'bn' ? '❌ জিমেইলে কোনো স্পেস (Space) থাকা যাবে না! আবার দিন:' : '❌ No spaces allowed in Gmail! Try again:');
      return;
    }
    if (!text.toLowerCase().endsWith('@gmail.com') || text.length <= 10) {
      await bot.sendMessage(chatId, lang === 'bn' ? '❌ জিমেইলের শেষে অবশ্যই @gmail.com থাকতে হবে! যেমন: test123@gmail.com' : '❌ Must end with @gmail.com! Example: test123@gmail.com');
      return;
    }

    userStates[userId] = { step: 'WAIT_PASS', tempEmail: text.toLowerCase() };
    await bot.sendMessage(chatId, lang === 'bn' ? '✅ Email: ' + text.toLowerCase() + '\n\n🔑 *এবার জিমেইলটির Password লিখুন (কোনো স্পেস থাকা যাবে না):*' : '✅ Email: ' + text.toLowerCase() + '\n\n🔑 *Now enter the Password (no spaces):*', { parse_mode: 'Markdown' });
    return;
  }

  // Submission Flow Step 2: Password
  if (state.step === 'WAIT_PASS') {
    if (/\s/.test(text)) {
      await bot.sendMessage(chatId, lang === 'bn' ? '❌ পাসওয়ার্ডে কোনো স্পেস রাখা যাবে না! সঠিক পাসওয়ার্ড দিন:' : '❌ Password cannot contain spaces! Try again:');
      return;
    }
    if (text.length < 6) {
      await bot.sendMessage(chatId, lang === 'bn' ? '❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে!' : '❌ Password must be at least 6 characters!');
      return;
    }

    const email = state.tempEmail;
    userStates[userId] = { step: 'CONFIRM', tempEmail: email, tempPassword: text };

    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '📋 *জিমেইল তথ্য নিশ্চিতকরণ:*\n\n📧 Email: ' + email + '\n🔑 Password: ' + text + '\n💰 মূল্য: *৳ ' + GMAIL_REWARD + ' টাকা*\n\n⚠️ নিশ্চিত হোন 2FA বন্ধ এবং কোনো রিকভারি নম্বর যুক্ত নেই।'
        : '📋 *Confirm Gmail Details:*\n\n📧 Email: ' + email + '\n🔑 Password: ' + text + '\n💰 Reward: *৳ ' + GMAIL_REWARD + ' TK*\n\n⚠️ Ensure 2FA is OFF and no recovery phone is attached.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: lang === 'bn' ? '✅ সাবমিট করুন (Submit)' : '✅ Submit Now', callback_data: 'confirm_sub' },
              { text: lang === 'bn' ? '❌ বাতিল' : '❌ Cancel', callback_data: 'cancel_sub' },
            ],
          ],
        },
      }
    );
    return;
  }

  // Withdrawal Flow: BDT (bKash / Nagad) - Step 1: Phone
  if (state.step === 'WAIT_BDT_PHONE' || state.step === 'WAIT_BKASH_NUM') {
    const clean = text.replace(/[^0-9]/g, '');
    const method = state.method || 'bKash';
    if (!/^01[3-9]\d{8}$/.test(clean)) {
      await bot.sendMessage(
        chatId,
        lang === 'bn'
          ? '❌ *ভুল ' + method + ' নম্বর!* সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX):\n\n*(বাতিল করতে নিচে ❌ Cancel চাপুন)*'
          : '❌ *Invalid ' + method + ' number!* Enter valid 11-digit number (e.g. 017XXXXXXXX):\n\n*(To cancel, tap ❌ Cancel below)*',
        {
          parse_mode: 'Markdown',
          reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
        }
      );
      return;
    }

    userStates[userId] = { step: 'WAIT_BDT_AMOUNT', method, currency: 'BDT', tempPhone: clean };
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '📱 ' + method + ' নম্বর: ' + clean + '\n💰 ব্যালেন্স: ৳ ' + user.approvedBalance.toFixed(2) + ' টাকা\n\n💵 *কত টাকা উত্তোলন করতে চান লিখুন:*\n(সর্বনিম্ন: ৳ ' + MIN_WITHDRAWAL + ' টাকা)\n\n*(বাতিল করতে নিচে ❌ Cancel চাপুন)*'
        : '📱 ' + method + ': ' + clean + '\n💰 Balance: ৳ ' + user.approvedBalance.toFixed(2) + ' TK\n\n💵 *Enter amount to withdraw:*\n(Min: ৳ ' + MIN_WITHDRAWAL + ' TK)\n\n*(To cancel, tap ❌ Cancel below)*',
      {
        parse_mode: 'Markdown',
        reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
      }
    );
    return;
  }

  // Withdrawal Flow: BDT - Step 2: Amount
  if (state.step === 'WAIT_BDT_AMOUNT' || state.step === 'WAIT_BKASH_AMOUNT') {
    const amt = parseFloat(text);
    const method = state.method || 'bKash';
    if (isNaN(amt) || amt <= 0) {
      await bot.sendMessage(
        chatId,
        lang === 'bn' ? '❌ সঠিক টাকার অঙ্ক লিখুন (যেমন: 15, 30, 45):' : '❌ Enter valid number (e.g. 15, 30, 45):',
        { reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }
    if (amt < MIN_WITHDRAWAL) {
      await bot.sendMessage(
        chatId,
        lang === 'bn' ? '❌ সর্বনিম্ন উত্তোলন ৳ ' + MIN_WITHDRAWAL + ' টাকা!' : '❌ Minimum withdrawal is ৳ ' + MIN_WITHDRAWAL + ' TK!',
        { reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }
    if (amt > user.approvedBalance) {
      await bot.sendMessage(
        chatId,
        lang === 'bn' ? '❌ অপর্যাপ্ত ব্যালেন্স! আপনার আছে ৳ ' + user.approvedBalance.toFixed(2) + ' টাকা।' : '❌ Insufficient balance! You have ৳ ' + user.approvedBalance.toFixed(2) + ' TK.',
        { reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }

    const phone = state.tempPhone;
    user.approvedBalance -= amt;
    const wdId = 'WD_' + Date.now().toString(36).toUpperCase();
    const newWd = {
      id: wdId,
      userId,
      userName: user.name,
      phone,
      method,
      currency: 'BDT',
      amount: amt,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    db.withdrawals.unshift(newWd);
    saveDB();
    userStates[userId] = { step: 'IDLE' };

    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '✅ *' + method + ' উত্তোলন অনুরোধ সফলভাবে গৃহীত হয়েছে!*\n\n🆔 ID: #' + wdId + '\n📱 ' + method + ': ' + phone + '\n💵 টাকা: ৳ ' + amt.toFixed(2) + ' টাকা\n\n🗓️ *পেমেন্ট শিডিউল:*\n• *প্রতি শুক্রবার ও সোমবার পেমেন্ট ক্লিয়ার করা হয়।*\n• এডমিন ভেরিফাই করে টাকা পাঠিয়ে দিবেন।'
        : '✅ *' + method + ' withdrawal request received!*\n\n🆔 ID: #' + wdId + '\n📱 ' + method + ': ' + phone + '\n💵 Amount: ৳ ' + amt.toFixed(2) + ' TK\n\n🗓️ *Payment Schedule:*\n• *Processed every Friday and Monday.*\n• Admin will send funds to your account.',
      { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang) }
    );

    // Notify Admin
    await bot.sendMessage(
      ADMIN_ID,
      '💸 *নতুন ' + method + ' (BDT) উত্তোলন অনুরোধ!*\n\n🆔 ID: #' + wdId + '\n👤 User: ' + user.name + ' (' + userId + ')\n📱 ' + method + ' নম্বর: ' + phone + '\n💵 টাকার পরিমাণ: ৳ ' + amt.toFixed(2) + ' TK\n\nটাকা পাঠিয়ে কনফার্ম করুন:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Mark Paid (টাকা পাঠানো হয়েছে)', callback_data: 'adm_pay_wd_' + wdId },
              { text: '❌ Reject & Refund', callback_data: 'adm_rej_wd_' + wdId },
            ],
          ],
        },
      }
    ).catch((e) => console.error('Admin wd alert err:', e.message));
    return;
  }

  // Withdrawal Flow: USD (Binance / USDT / Payeer) - Step 1: Account
  if (state.step === 'WAIT_USD_ACCOUNT') {
    const acc = text.trim();
    if (acc.length < 3) {
      await bot.sendMessage(
        chatId,
        lang === 'bn' ? '❌ সঠিক একাউন্ট তথ্য লিখুন:' : '❌ Enter valid account details:',
        { reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }

    const method = state.method || 'Binance Pay';
    userStates[userId] = { step: 'WAIT_USD_AMOUNT', method, currency: 'USD', tempAccount: acc };
    const maxUsd = (user.approvedBalance / USD_RATE).toFixed(2);

    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '💳 মেথড: *' + method + '*\n🆔 একাউন্ট: ' + acc + '\n💰 ব্যালেন্স: ৳ ' + user.approvedBalance.toFixed(2) + ' TK (~$' + maxUsd + ' USD)\n📊 রেট: 1 USD = ' + USD_RATE + ' BDT\n\n💵 *কত USD উত্তোলন করতে চান লিখুন:*\n(যেমন: 0.50, 1.00, 2.00 — সর্বনিম্ন: $' + MIN_WITHDRAWAL_USD + ' USD)\n\n*(বাতিল করতে নিচে ❌ Cancel চাপুন)*'
        : '💳 Method: *' + method + '*\n🆔 Account: ' + acc + '\n💰 Balance: ৳ ' + user.approvedBalance.toFixed(2) + ' TK (~$' + maxUsd + ' USD)\n📊 Rate: 1 USD = ' + USD_RATE + ' BDT\n\n💵 *Enter amount in USD:*\n(e.g., 0.50, 1.00 — Minimum: $' + MIN_WITHDRAWAL_USD + ' USD)\n\n*(To cancel, tap ❌ Cancel below)*',
      {
        parse_mode: 'Markdown',
        reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
      }
    );
    return;
  }

  // Withdrawal Flow: USD - Step 2: Amount
  if (state.step === 'WAIT_USD_AMOUNT') {
    const usdAmt = parseFloat(text);
    const method = state.method || 'Binance Pay';
    if (isNaN(usdAmt) || usdAmt <= 0) {
      await bot.sendMessage(
        chatId,
        lang === 'bn' ? '❌ সঠিক ডলার সংখ্যা লিখুন (যেমন: 0.50, 1.00):' : '❌ Enter valid number in USD (e.g. 0.50, 1.00):',
        { reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }
    if (usdAmt < MIN_WITHDRAWAL_USD) {
      await bot.sendMessage(
        chatId,
        lang === 'bn' ? '❌ সর্বনিম্ন উত্তোলন $' + MIN_WITHDRAWAL_USD + ' USD!' : '❌ Minimum withdrawal is $' + MIN_WITHDRAWAL_USD + ' USD!',
        { reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }

    const bdtCost = parseFloat((usdAmt * USD_RATE).toFixed(2));
    if (bdtCost > user.approvedBalance) {
      await bot.sendMessage(
        chatId,
        lang === 'bn'
          ? '❌ *অপর্যাপ্ত ব্যালেন্স!*\n\n$' + usdAmt + ' USD এর জন্য প্রয়োজন ৳ ' + bdtCost + ' টাকা।\nআপনার ব্যালেন্স আছে ৳ ' + user.approvedBalance.toFixed(2) + ' টাকা। কম পরিমাণ লিখুন:'
          : '❌ *Insufficient balance!*\n\n$' + usdAmt + ' USD requires ৳ ' + bdtCost + ' TK.\nYou have ৳ ' + user.approvedBalance.toFixed(2) + ' TK. Enter lower amount:',
        { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true } }
      );
      return;
    }

    const account = state.tempAccount;
    user.approvedBalance -= bdtCost;
    const wdId = 'WD_' + Date.now().toString(36).toUpperCase();
    const newWd = {
      id: wdId,
      userId,
      userName: user.name,
      phone: account,
      method,
      currency: 'USD',
      amount: usdAmt,
      amountBdt: bdtCost,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    db.withdrawals.unshift(newWd);
    saveDB();
    userStates[userId] = { step: 'IDLE' };

    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '✅ *' + method + ' (USD) উত্তোলন অনুরোধ সফলভাবে গৃহীত হয়েছে!*\n\n🆔 ID: #' + wdId + '\n💳 মেথড: ' + method + '\n🆔 একাউন্ট: ' + account + '\n💵 ডলার: *$' + usdAmt.toFixed(2) + ' USD* (~৳ ' + bdtCost.toFixed(2) + ' TK)\n\n🗓️ *পেমেন্ট শিডিউল:*\n• *প্রতি শুক্রবার ও সোমবার পেমেন্ট ক্লিয়ার করা হয়।*\n• এডমিন আপনার একাউন্টে ডলার পাঠিয়ে কনফার্ম করবেন।'
        : '✅ *' + method + ' (USD) withdrawal request received!*\n\n🆔 ID: #' + wdId + '\n💳 Method: ' + method + '\n🆔 Account: ' + account + '\n💵 Amount: *$' + usdAmt.toFixed(2) + ' USD* (~৳ ' + bdtCost.toFixed(2) + ' TK)\n\n🗓️ *Payment Schedule:*\n• *Processed every Friday and Monday.*\n• Admin will send funds to your account.',
      { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang) }
    );

    // Notify Admin
    await bot.sendMessage(
      ADMIN_ID,
      '💸 *নতুন ' + method + ' (USD) উত্তোলন অনুরোধ!*\n\n🆔 ID: #' + wdId + '\n👤 User: ' + user.name + ' (' + userId + ')\n💳 মেথড: ' + method + ' (USD)\n🆔 একাউন্ট/Address: ' + account + '\n💵 ডলার পরিমাণ: *$' + usdAmt.toFixed(2) + ' USD* (~৳ ' + bdtCost.toFixed(2) + ' TK)\n\nডলার পাঠিয়ে নিচের বাটনে কনফার্ম করুন:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Mark Paid (ডলার পাঠানো হয়েছে)', callback_data: 'adm_pay_wd_' + wdId },
              { text: '❌ Reject & Refund', callback_data: 'adm_rej_wd_' + wdId },
            ],
          ],
        },
      }
    ).catch((e) => console.error('Admin wd alert err:', e.message));
    return;
  }

  // Main Menu Actions
  if (text.includes('Submit your own')) {
    userStates[userId] = { step: 'WAIT_EMAIL' };
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '⚠️ *জিমেইল বিক্রির নিয়মাবলী:*\n\n1️⃣ প্রতি ফ্রেশ জিমেইল: *৳ ' + GMAIL_REWARD + ' টাকা*\n2️⃣ ❌ *কোনো 2FA অন করা যাবে না!*\n3️⃣ ❌ *কোনো Recovery Email যুক্ত থাকা যাবে না!*\n4️⃣ ❌ *কোনো Phone Number যুক্ত থাকা যাবে না!*\n\n📧 *ধাপ ১: আপনার জিমেইল লিখুন:*\n(যেমন: example@gmail.com)'
        : '⚠️ *Gmail Submission Rules:*\n\n1️⃣ Reward: *৳ ' + GMAIL_REWARD + ' TK*\n2️⃣ ❌ *NO 2FA enabled!*\n3️⃣ ❌ *NO Recovery Email attached!*\n4️⃣ ❌ *NO Phone Number attached!*\n\n📧 *Step 1: Enter your Gmail:*\n(e.g., example@gmail.com)',
      {
        parse_mode: 'Markdown',
        reply_markup: { keyboard: [[{ text: '❌ Cancel' }]], resize_keyboard: true },
      }
    );
    return;
  }

  if (text.includes('My Profile')) {
    const totalSub = db.submissions.filter((s) => s.userId === userId).length;
    const appSub = db.submissions.filter((s) => s.userId === userId && s.status === 'approved').length;
    const refCount = Object.values(db.users).filter((u) => u.referrerId === userId).length;

    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '👤 *আপনার প্রোফাইল সামারি:*\n\n🆔 User ID: ' + userId + '\n👤 নাম: *' + user.name + '*\n\n💰 *ব্যালেন্স:*\n⏳ হোল্ড (পেন্ডিং): ৳ ' + user.holdBalance.toFixed(2) + ' টাকা\n✅ উত্তোলনের ব্যালেন্স: ৳ ' + user.approvedBalance.toFixed(2) + ' টাকা\n💳 মোট উত্তোলন করেছেন: ৳ ' + user.totalWithdrawn.toFixed(2) + ' টাকা\n\n📊 *কাজের হিসাব:*\n📥 মোট সাবমিট: ' + totalSub + ' টি\n✅ সফল: ' + appSub + ' টি\n👥 রেফারাল: ' + refCount + ' জন (বোনাস: ৳ ' + user.referralEarnings.toFixed(2) + ')'
        : '👤 *Your Profile Summary:*\n\n🆔 User ID: ' + userId + '\n👤 Name: *' + user.name + '*\n\n💰 *Balance:*\n⏳ Hold Balance: ৳ ' + user.holdBalance.toFixed(2) + ' TK\n✅ Available Balance: ৳ ' + user.approvedBalance.toFixed(2) + ' TK\n💳 Total Withdrawn: ৳ ' + user.totalWithdrawn.toFixed(2) + ' TK\n\n📊 *Stats:*\n📥 Total Submitted: ' + totalSub + '\n✅ Approved: ' + appSub + '\n👥 Referrals: ' + refCount + ' (Earned: ৳ ' + user.referralEarnings.toFixed(2) + ')',
      { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang, isAdmin) }
    );
    return;
  }

  if (text.includes('My Accounts')) {
    const mySubs = db.submissions.filter((s) => s.userId === userId).slice(0, 10);
    if (!mySubs.length) {
      await bot.sendMessage(chatId, lang === 'bn' ? '📑 আপনার কোনো জিমেইল সাবমিশন পাওয়া যায়নি।' : '📑 No Gmail submissions found yet.', { reply_markup: getMainMenuKeyboard(lang, isAdmin) });
      return;
    }
    let res = lang === 'bn' ? '*📑 আপনার সাম্প্রতিক সাবমিশনসমূহ:*\n\n' : '*📑 Your Recent Submissions:*\n\n';
    mySubs.forEach((s, idx) => {
      const st = s.status === 'approved' ? '✅ Approved' : s.status === 'rejected' ? '❌ Rejected' : '⏳ Pending';
      res += (idx + 1) + '. ' + s.email + ' - ' + st + ' (৳' + s.reward + ')\n';
    });
    await bot.sendMessage(chatId, res, { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang, isAdmin) });
    return;
  }

  if (text.includes('Withdraw') || text.includes('উত্তোলন')) {
    if (user.approvedBalance < MIN_WITHDRAWAL) {
      const approxUsd = (user.approvedBalance / USD_RATE).toFixed(2);
      await bot.sendMessage(
        chatId,
        lang === 'bn'
          ? '❌ *উত্তোলনের জন্য পর্যাপ্ত ব্যালেন্স নেই!*\n\n💰 বর্তমান ব্যালেন্স: ৳ ' + user.approvedBalance.toFixed(2) + ' টাকা (~$' + approxUsd + ' USD)\n💵 সর্বনিম্ন উত্তোলন: ৳ ' + MIN_WITHDRAWAL + ' BDT / $' + MIN_WITHDRAWAL_USD + ' USD\n\nআরও জিমেইল সাবমিট করুন বা বন্ধুদের রেফার করুন।'
          : '❌ *Insufficient balance!*\n\n💰 Balance: ৳ ' + user.approvedBalance.toFixed(2) + ' TK (~$' + approxUsd + ' USD)\n💵 Minimum: ৳ ' + MIN_WITHDRAWAL + ' BDT / $' + MIN_WITHDRAWAL_USD + ' USD\n\nSubmit more Gmails or refer friends to earn more.',
        { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang, isAdmin) }
      );
      return;
    }

    const approxUsd = (user.approvedBalance / USD_RATE).toFixed(2);
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '💳 *উত্তোলন কারেন্সি নির্বাচন করুন (Select Currency):*\n\n' +
          '💰 আপনার ব্যালেন্স: *৳ ' + user.approvedBalance.toFixed(2) + ' টাকা* (~ *$' + approxUsd + ' USD*)\n' +
          '🗓️ *পেমেন্ট প্রদানের দিন:* প্রতি শুক্রবার ও সোমবার\n\n' +
          'যে কারেন্সিতে পেমেন্ট নিতে চান নিচের বাটনে চাপুন:'
        : '💳 *Select Withdrawal Currency:*\n\n' +
          '💰 Available Balance: *৳ ' + user.approvedBalance.toFixed(2) + ' TK* (~ *$' + approxUsd + ' USD*)\n' +
          '🗓️ *Payout Days:* Every Friday and Monday\n\n' +
          'Choose your preferred withdrawal currency below:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇧🇩 BDT (বিকাশ / নগদ - ৳)', callback_data: 'wd_curr_bdt' },
              { text: '💵 USD (Binance / USDT - $)', callback_data: 'wd_curr_usd' },
            ],
            [{ text: lang === 'bn' ? '❌ বাতিল (Cancel)' : '❌ Cancel', callback_data: 'cancel_withdraw' }],
          ],
        },
      }
    );
    return;
  }

  if (text.includes('Refer & Earn')) {
    const link = 'https://t.me/' + (botUsername || 'easygmailseller_bot') + '?start=ref_' + userId;
    const refCount = Object.values(db.users).filter((u) => u.referrerId === userId).length;

    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '👥 *রেফার করে আয় করুন!*\n\n📌 *নিয়ম:* আপনার রেফার করা বন্ধুকে অন্তত ১টি জিমেইল বা টাস্ক সফলভাবে বিক্রি করতে হবে। এরপর প্রতি সফল টাস্কের জন্য পাবেন *২ টাকা* রেফার কমিশন!\n\n🔗 *আপনার রেফারেল লিংক:*\n' + link + '\n\n📊 মোট রেফার: *' + refCount + ' জন*\n💰 রেফার বোনাস: *৳ ' + user.referralEarnings.toFixed(2) + ' টাকা*'
        : '👥 *Refer & Earn!*\n\n📌 *Rule:* When your referred user completes at least 1 approved task, you receive *৳ ' + REFERRAL_REWARD + ' TK* for every task!\n\n🔗 *Your Referral Link:*\n' + link + '\n\n📊 Total Referrals: *' + refCount + ' users*\n💰 Referral Earnings: *৳ ' + user.referralEarnings.toFixed(2) + ' TK*',
      { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard(lang, isAdmin) }
    );
    return;
  }

  if (text.includes('Support')) {
    await bot.sendMessage(
      chatId,
      lang === 'bn' ? '💬 যেকোনো প্রয়োজনে নিচে বাটনে ক্লিক করে আমাদের সাথে যোগাযোগ করুন:' : '💬 For any support, click the button below:',
      {
        reply_markup: {
          inline_keyboard: [[{ text: lang === 'bn' ? '💬 যোগাযোগ করুন (Contact Support)' : '💬 Contact Support', url: SUPPORT_URL }]],
        },
      }
    );
    return;
  }

  if (text.includes('Official Channel') || text.includes('চ্যানেল')) {
    await bot.sendMessage(
      chatId,
      lang === 'bn'
        ? '📢 *আমাদের অফিশিয়াল চ্যানেল:*\n\nযুক্ত হতে নিচে বাটনে চাপুন:'
        : '📢 *Official Channel:*\n\nClick below to join our channel:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '📢 Join Official Channel', url: CHANNEL_URL }]],
        },
      }
    );
    return;
  }

  if (text.includes('Admin Panel') || text.includes('এডমিন')) {
    await sendAdminPanel(chatId, userId);
    return;
  }

  await bot.sendMessage(chatId, lang === 'bn' ? 'দয়া করে মেন্যু থেকে অপশন বেছে নিন:' : 'Please choose an option from the menu:', {
    reply_markup: getMainMenuKeyboard(lang, isAdmin),
  });
});
