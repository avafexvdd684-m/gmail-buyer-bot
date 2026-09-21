require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// =================================================================
// ⚙️ BOT CONFIGURATION (SETTINGS)
// =================================================================
const TOKEN = process.env.BOT_TOKEN || '8859315023:AAFn4-tPENjfYegz6FXh_fs_i8lgwoqU1v0';
const ADMIN_ID = String(process.env.ADMIN_ID || '8865474356');
const CHANNEL_URL = 'https://t.me/easygmailseller';
const SUPPORT_URL = 'https://t.me/easygmailsellerUSA';

let GMAIL_PRICE = 15.0;       // 15 BDT per Gmail
let REFERRAL_BONUS = 2.0;     // 2 BDT per Referral
let MIN_WITHDRAW = 15.0;      // Minimum withdrawal 15 BDT

const bot = new TelegramBot(TOKEN, { polling: true });

let botUsername = 'EasyGmailSellerBot';
bot.getMe().then((me) => {
  if (me && me.username) {
    botUsername = me.username;
    console.log(`Bot initialized as @${botUsername}`);
  }
}).catch((err) => console.error('Telegram getMe error:', err.message));

// =================================================================
// 🗄️ PERSISTENT DATABASE (database.json)
// =================================================================
const DB_FILE = path.join(__dirname, 'database.json');
let db = {
  users: {},
  submissions: {},
  withdrawals: {}
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
      saveDb();
    }
  } catch (e) {
    console.error('Database load error:', e.message);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Database save error:', e.message);
  }
}

loadDb();

// In-memory conversation state
const userState = {};

// Helper: Get or initialize user profile
function getUser(userId, from = {}) {
  const sId = String(userId);
  if (!db.users[sId]) {
    db.users[sId] = {
      id: sId,
      name: from.first_name || 'User',
      username: from.username ? `@${from.username}` : '',
      language: 'bn',         // Default 'bn' (Bangla) or 'en' (English)
      balance: 0.0,          // Available balance
      holdBalance: 0.0,      // Pending Gmail hold
      totalWithdrawn: 0.0,   // Total withdrawn
      submittedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      referralsCount: 0,
      referralEarnings: 0.0,
      referrerId: null,
      joinedAt: new Date().toLocaleDateString('en-GB')
    };
    saveDb();
  }
  return db.users[sId];
}

// Mask email for user privacy
function maskEmail(email) {
  try {
    const [name, domain] = email.split('@');
    if (!domain) return email;
    if (name.length <= 3) return `${name}***@${domain}`;
    return `${name.substring(0, 3)}***${name.slice(-1)}@${domain}`;
  } catch (e) {
    return email;
  }
}

// =================================================================
// 🌐 BILINGUAL KEYBOARDS & LOCALIZATION
// =================================================================
function getMainMenu(userId, lang = 'bn') {
  const isEn = lang === 'en';
  const keyboard = [
    [{ text: isEn ? '📥 Submit Gmail' : '📥 জিমেইল বিক্রি করুন' }],
    [
      { text: isEn ? '💰 Balance' : '💰 ব্যালেন্স' },
      { text: isEn ? '👤 My Account' : '👤 মাই একাউন্ট' }
    ],
    [
      { text: isEn ? '💸 Withdraw (bKash)' : '💸 উত্তোলন (বিকাশ)' },
      { text: isEn ? '👥 Refer & Earn' : '👥 রেফার ও ইনকাম' }
    ],
    [
      { text: isEn ? '📢 Channel' : '📢 অফিশিয়াল চ্যানেল' },
      { text: isEn ? '👨‍💻 Support' : '👨‍💻 সাপোর্ট' }
    ],
    [
      { text: isEn ? '🌐 Change Language' : '🌐 ভাষা পরিবর্তন' }
    ]
  ];

  // If this user is Admin (8865474356), always add Admin Panel
  if (String(userId) === ADMIN_ID) {
    keyboard.push([{ text: '👑 Admin Panel (অ্যাডমিন প্যানেল)' }]);
  }

  return {
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true
    }
  };
}

// Cancel keyboard with option to keep main menu visible
function getCancelKeyboard(lang = 'bn') {
  const isEn = lang === 'en';
  return {
    reply_markup: {
      keyboard: [
        [{ text: isEn ? '🔙 Cancel & Back' : '🔙 বাতিল ও ফিরে যান' }]
      ],
      resize_keyboard: true
    }
  };
}

// =================================================================
// 🚀 /start COMMAND
// =================================================================
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = String(msg.chat.id);
  const user = getUser(chatId, msg.from);
  const param = match[1] ? match[1].trim() : '';

  // Handle referral
  if (param.startsWith('ref_') && !user.referrerId) {
    const refId = param.replace('ref_', '');
    if (refId && refId !== chatId && db.users[refId]) {
      user.referrerId = refId;
      db.users[refId].referralsCount += 1;
      db.users[refId].referralEarnings += REFERRAL_BONUS;
      db.users[refId].balance += REFERRAL_BONUS;
      saveDb();

      const refUser = db.users[refId];
      const isRefEn = refUser.language === 'en';
      bot.sendMessage(
        refId,
        isRefEn
          ? `🎉 *Referral Bonus Received!*\nA new user joined via your link.\n💰 *+${REFERRAL_BONUS.toFixed(2)} BDT* added to your balance!`
          : `🎉 *অভিনন্দন!* নতুন একজন ইউজার আপনার রেফারেল লিংকে জয়েন করেছে।\n🎁 আপনার ব্যালেন্সে *+${REFERRAL_BONUS.toFixed(2)} টাকা* যোগ হয়েছে!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }

  userState[chatId] = null;
  const isEn = user.language === 'en';

  let welcome = isEn
    ? `👋 *Welcome to Easy Gmail Seller Bot!* 💎\n\n` +
      `💰 Rate per Gmail: *${GMAIL_PRICE.toFixed(2)} BDT*\n` +
      `🎁 Referral Bonus: *${REFERRAL_BONUS.toFixed(2)} BDT*\n` +
      `💳 Payout Method: *bKash Personal*\n` +
      `📢 Official Channel: [Easy Gmail Seller](${CHANNEL_URL})\n\n` +
      `👇 Choose an option from the menu below:`
    : `👋 *Easy Gmail Seller বটে আপনাকে স্বাগতম!* 💎\n\n` +
      `💰 প্রতি জিমেইলে পাবেন: *${GMAIL_PRICE.toFixed(2)} টাকা*\n` +
      `🎁 প্রতি রেফারে পাবেন: *${REFERRAL_BONUS.toFixed(2)} টাকা*\n` +
      `💳 পেমেন্ট মাধ্যম: *বিকাশ পার্সোনাল*\n` +
      `📢 অফিশিয়াল চ্যানেল: [Easy Gmail Seller](${CHANNEL_URL})\n\n` +
      `👇 নিচের মেনু থেকে যেকোনো অপশন বেছে নিন:`;

  if (chatId === ADMIN_ID) {
    welcome += isEn
      ? `\n\n👑 *Admin Access Detected!* Use the Admin Panel button or type /admin.`
      : `\n\n👑 *অ্যাডমিন মোড সক্রিয়!* নিচে অ্যাডমিন প্যানেল বাটন ব্যবহার করুন অথবা /admin লিখুন।`;
  }

  bot.sendMessage(chatId, welcome, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...getMainMenu(chatId, user.language)
  });
});

// =================================================================
// 👑 ADMIN DASHBOARD & CONTROLS (/admin)
// =================================================================
function sendAdminDashboard(chatId) {
  const totalUsers = Object.keys(db.users).length;
  const submissions = Object.values(db.submissions);
  const withdrawals = Object.values(db.withdrawals);

  const pendingSubs = submissions.filter((s) => s.status === 'pending').length;
  const approvedSubs = submissions.filter((s) => s.status === 'approved').length;
  const pendingWd = withdrawals.filter((w) => w.status === 'pending').length;

  const text =
    `👑 *ADMIN CONTROL PANEL*\n\n` +
    `👥 Total Bot Users: *${totalUsers}*\n` +
    `📥 Pending Gmails: *${pendingSubs}*\n` +
    `✅ Approved Gmails: *${approvedSubs}*\n` +
    `💸 Pending Withdrawals: *${pendingWd}*\n\n` +
    `⚙️ Current Price: *${GMAIL_PRICE} BDT* | Min Withdraw: *${MIN_WITHDRAW} BDT*\n` +
    `📢 Official Channel: ${CHANNEL_URL}`;

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: `📥 Review Gmails (${pendingSubs})`, callback_data: 'admin_view_pending_subs' },
          { text: `💸 Pending Payouts (${pendingWd})`, callback_data: 'admin_view_pending_wd' }
        ],
        [
          { text: '📢 Send Broadcast to All Users', callback_data: 'admin_start_broadcast' }
        ]
      ]
    }
  });
}

bot.onText(/\/admin/, (msg) => {
  const chatId = String(msg.chat.id);
  if (chatId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '⛔ Access Denied! You are not the authorized Admin.');
  }
  sendAdminDashboard(chatId);
});

// =================================================================
// 📩 USER INTERACTION & BILINGUAL HANDLER
// =================================================================
bot.on('message', (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text;

  if (!text || text.startsWith('/start') || text.startsWith('/admin')) return;
  const user = getUser(chatId, msg.from);
  const isEn = user.language === 'en';

  // 0️⃣ Cancel & Back Handler
  if (text === '🔙 Cancel & Back' || text === '🔙 বাতিল ও ফিরে যান') {
    userState[chatId] = null;
    return bot.sendMessage(
      chatId,
      isEn ? 'Action cancelled. Back to main menu.' : 'বাতিল করা হয়েছে। মূল মেনুতে ফিরে এসেছেন।',
      getMainMenu(chatId, user.language)
    );
  }

  // 🌐 Change Language Handler
  if (text === '🌐 Change Language' || text === '🌐 ভাষা পরিবর্তন') {
    userState[chatId] = null;
    return bot.sendMessage(
      chatId,
      `🌐 *Select Your Language / আপনার ভাষা নির্বাচন করুন:*\n\nChoose English or বাংলা:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇺🇸 English', callback_data: 'lang_en' },
              { text: '🇧🇩 বাংলা (Bangla)', callback_data: 'lang_bn' }
            ]
          ]
        }
      }
    );
  }

  // 1️⃣ 💰 Balance
  if (text === '💰 Balance' || text === '💰 ব্যালেন্স') {
    userState[chatId] = null;
    const balanceText = isEn
      ? `💰 *YOUR BALANCE SUMMARY* 📊\n\n` +
        `✅ *Available Balance:* ${user.balance.toFixed(2)} BDT\n` +
        `⏳ *Hold Balance (Pending Review):* ${user.holdBalance.toFixed(2)} BDT\n` +
        `💳 *Total Withdrawn:* ${user.totalWithdrawn.toFixed(2)} BDT\n\n` +
        `📥 *Total Submitted:* ${user.submittedCount} Gmail(s)\n` +
        `🎯 *Approved:* ${user.approvedCount} | ❌ *Rejected:* ${user.rejectedCount}\n\n` +
        `📌 _You can withdraw once available balance is at least ${MIN_WITHDRAW.toFixed(2)} BDT._`
      : `💰 *আপনার ব্যালেন্স বিবরণী* 📊\n\n` +
        `✅ *উইথড্রযোগ্য ব্যালেন্স:* ${user.balance.toFixed(2)} টাকা\n` +
        `⏳ *হোল্ড ব্যালেন্স (পর্যালোচনায়):* ${user.holdBalance.toFixed(2)} টাকা\n` +
        `💳 *মোট উইথড্র করা হয়েছে:* ${user.totalWithdrawn.toFixed(2)} টাকা\n\n` +
        `📥 *মোট জমাকৃত জিমেইল:* ${user.submittedCount} টি\n` +
        `🎯 *অনুমোদিত:* ${user.approvedCount} টি | ❌ *বাতিল:* ${user.rejectedCount} টি\n\n` +
        `📌 _ব্যালেন্সে সর্বনিম্ন ${MIN_WITHDRAW.toFixed(2)} টাকা হলেই বিকাশ পার্সোনালে উত্তোলন করতে পারবেন।_`;

    return bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown', ...getMainMenu(chatId, user.language) });
  }

  // 2️⃣ 👤 My Account
  if (text === '👤 My Account' || text === '👤 মাই একাউন্ট') {
    userState[chatId] = null;

    const userSubs = Object.values(db.submissions)
      .filter((s) => String(s.userId) === chatId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    let historyText = '';
    if (userSubs.length === 0) {
      historyText = isEn ? '_(No Gmail submitted yet)_' : '_(এখনো কোনো জিমেইল জমা দেননি)_';
    } else {
      historyText = userSubs
        .map((s, idx) => {
          let badge = isEn ? '⏳ Pending (Hold)' : '⏳ পেন্ডিং (হোল্ড)';
          if (s.status === 'approved') badge = isEn ? '✅ Approved' : '✅ অনুমোদিত';
          if (s.status === 'rejected') badge = isEn ? '❌ Rejected' : '❌ বাতিল';
          return `${idx + 1}. \`${maskEmail(s.email)}\`\n   ↳ ${isEn ? 'Status' : 'স্ট্যাটাস'}: *${badge}* | ${s.amount} ৳`;
        })
        .join('\n\n');
    }

    const accountText = isEn
      ? `👤 *ACCOUNT DETAILS* 📋\n\n` +
        `🆔 User ID: \`${chatId}\`\n` +
        `📅 Joined: ${user.joinedAt}\n` +
        `💵 Balance: *${user.balance.toFixed(2)} BDT*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📂 *Recent Gmail Submissions:*\n\n` +
        `${historyText}\n` +
        `━━━━━━━━━━━━━━━━━━━━`
      : `👤 *আপনার অ্যাকাউন্ট প্রোফাইল* 📋\n\n` +
        `🆔 ইউজার আইডি: \`${chatId}\`\n` +
        `📅 যোগদানের তারিখ: ${user.joinedAt}\n` +
        `💵 বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} টাকা*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📂 *সাম্প্রতিক জিমেইল বিক্রয়ের তথ্য:*\n\n` +
        `${historyText}\n` +
        `━━━━━━━━━━━━━━━━━━━━`;

    return bot.sendMessage(chatId, accountText, { parse_mode: 'Markdown', ...getMainMenu(chatId, user.language) });
  }

  // 3️⃣ 👥 Refer & Earn
  if (text === '👥 Refer & Earn' || text === '👥 রেফার ও ইনকাম') {
    userState[chatId] = null;
    const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;

    const referText = isEn
      ? `👥 *REFER & EARN REWARDS* 🎁\n\n` +
        `Share your referral link with friends and earn *${REFERRAL_BONUS.toFixed(2)} BDT* whenever someone joins the bot!\n\n` +
        `🔗 *Your Unique Referral Link:*\n\`${refLink}\`\n\n` +
        `📊 *Your Stats:*\n` +
        `• Total Referrals: *${user.referralsCount} users*\n` +
        `• Referral Income: *${user.referralEarnings.toFixed(2)} BDT*`
      : `👥 *রেফার করে আনলিমিটেড আয় করুন!* 🎁\n\n` +
        `বন্ধুদের সাথে আপনার রেফারেল লিংক শেয়ার করুন। কেউ আপনার লিংকে জয়েন করলেই পাবেন *${REFERRAL_BONUS.toFixed(2)} টাকা* বোনাস!\n\n` +
        `🔗 *আপনার রেফারেল লিংক:*\n\`${refLink}\`\n\n` +
        `📊 *আপনার পরিসংখ্যান:*\n` +
        `• মোট রেফার: *${user.referralsCount} জন*\n` +
        `• রেফারেল আয়: *${user.referralEarnings.toFixed(2)} টাকা*`;

    return bot.sendMessage(chatId, referText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{
            text: isEn ? '📤 Share on Telegram' : '📤 টেলিগ্রামে শেয়ার করুন',
            url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('ঘরে বসে জিমেইল বিক্রি করে প্রতিদিন বিকাশ পেমেন্ট নিন! প্রতি জিমেইল ১৫ টাকা।')}`
          }]
        ]
      }
    });
  }

  // 4️⃣ 📢 Official Channel
  if (text === '📢 Channel' || text === '📢 অফিশিয়াল চ্যানেল') {
    userState[chatId] = null;
    return bot.sendMessage(
      chatId,
      isEn
        ? `📢 *Official Channel*\n\nJoin our official channel for payment proofs, updates, and news:`
        : `📢 *আমাদের অফিশিয়াল চ্যানেল*\n\nসকল পেমেন্ট প্রুফ এবং নতুন নোটিশ জানতে চ্যানেলে যুক্ত থাকুন:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: isEn ? '📢 Join Official Channel' : '📢 চ্যানেলে যুক্ত হোন', url: CHANNEL_URL }]
          ]
        }
      }
    );
  }

  // 5️⃣ 👨‍💻 Support
  if (text === '👨‍💻 Support' || text === '👨‍💻 সাপোর্ট') {
    userState[chatId] = null;
    return bot.sendMessage(
      chatId,
      isEn
        ? `👨‍💻 *Customer Support*\n\nNeed help with payments or have questions? Chat directly with the admin:`
        : `👨‍💻 *অ্যাডমিন সাপোর্ট*\n\nযেকোনো প্রশ্ন, পেমেন্ট হেল্প বা সমস্যার জন্য সরাসরি অ্যাডমিনের সাথে যোগাযোগ করুন:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: isEn ? '💬 Chat with Admin' : '💬 অ্যাডমিনের সাথে চ্যাট করুন', url: SUPPORT_URL }]
          ]
        }
      }
    );
  }

  // 6️⃣ 👑 Admin Panel Button
  if (text.includes('Admin Panel') && chatId === ADMIN_ID) {
    userState[chatId] = null;
    return sendAdminDashboard(chatId);
  }

  // 7️⃣ 📥 Submit Gmail
  if (text === '📥 Submit Gmail' || text === '📥 জিমেইল বিক্রি করুন') {
    userState[chatId] = { step: 'awaiting_email' };
    return bot.sendMessage(
      chatId,
      isEn
        ? `✉️ *Step 1: Enter Gmail Address*\n\n` +
          `💰 Price per approved Gmail: *${GMAIL_PRICE.toFixed(2)} BDT*\n\n` +
          `Please send your **Gmail address** (e.g. \`example@gmail.com\`):\n\n` +
          `⚠️ *Rules:*\n` +
          `• Must end with @gmail.com\n` +
          `• 2-Step Verification must be OFF\n` +
          `• No recovery number or email.`
        : `✉️ *১ম ধাপ: জিমেইল এড্রেস দিন*\n\n` +
          `💰 প্রতি অনুমোদিত জিমেইল: *${GMAIL_PRICE.toFixed(2)} টাকা*\n\n` +
          `আপনার **Gmail Address** টি লিখে পাঠান (যেমন: \`example@gmail.com\`):\n\n` +
          `⚠️ *শর্তসমূহ:*\n` +
          `• অবশ্যই শেষে @gmail.com থাকতে হবে\n` +
          `• 2-Step Verification বন্ধ থাকতে হবে\n` +
          `• কোনো রিকভারি নাম্বার বা রিকভারি মেইল থাকা যাবে না।`,
      { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
    );
  }

  // 8️⃣ 💸 Withdraw (bKash)
  if (text === '💸 Withdraw (bKash)' || text === '💸 উত্তোলন (বিকাশ)') {
    if (user.balance < MIN_WITHDRAW) {
      return bot.sendMessage(
        chatId,
        isEn
          ? `❌ *Insufficient Balance!* ⚠️\n\nYour Available Balance: *${user.balance.toFixed(2)} BDT*\nMinimum Withdrawal: *${MIN_WITHDRAW.toFixed(2)} BDT*\n\nPlease submit more Gmails or invite friends to reach the minimum.`
          : `❌ *অপর্যাপ্ত ব্যালেন্স!* ⚠️\n\nআপনার বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} টাকা*\nউত্তোলনের জন্য সর্বনিম্ন প্রয়োজন: *${MIN_WITHDRAW.toFixed(2)} টাকা*\n\nআরও জিমেইল জমা দিয়ে বা বন্ধুদের রেফার করে ব্যালেন্স বাড়ান।`,
        { parse_mode: 'Markdown', ...getMainMenu(chatId, user.language) }
      );
    }

    userState[chatId] = { step: 'awaiting_bkash_number' };
    return bot.sendMessage(
      chatId,
      isEn
        ? `📱 *bKash Personal Withdrawal*\n\n` +
          `💰 Available Balance: *${user.balance.toFixed(2)} BDT*\n` +
          `📌 Minimum: *${MIN_WITHDRAW.toFixed(2)} BDT*\n\n` +
          `Please send your **11-digit bKash Personal Number** (e.g. \`017XXXXXXXX\`):`
        : `📱 *বিকাশ পার্সোনাল উইথড্র*\n\n` +
          `💰 আপনার ব্যালেন্স: *${user.balance.toFixed(2)} টাকা*\n` +
          `📌 সর্বনিম্ন উইথড্র: *${MIN_WITHDRAW.toFixed(2)} টাকা*\n\n` +
          `আপনার **১১ ডিজিটের বিকাশ পার্সোনাল নাম্বার** লিখে পাঠান (যেমন: \`017XXXXXXXX\`):`,
      { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
    );
  }

  // =================================================================
  // 🔄 CONVERSATION INPUT STEPS
  // =================================================================
  const state = userState[chatId];
  if (!state) return;

  // Broadcast step for admin
  if (chatId === ADMIN_ID && state.step === 'admin_broadcast') {
    userState[chatId] = null;
    const users = Object.keys(db.users);
    users.forEach((uid) => {
      bot.sendMessage(uid, `📢 *Notice from Admin:*\n\n${text}`, { parse_mode: 'Markdown' }).catch(() => {});
    });
    return bot.sendMessage(chatId, `✅ Broadcast sent to ${users.length} users.`, getMainMenu(chatId, user.language));
  }

  // Step: Email
  if (state.step === 'awaiting_email') {
    const email = text.trim().toLowerCase();
    if (!email.endsWith('@gmail.com') || email.includes(' ')) {
      return bot.sendMessage(
        chatId,
        isEn
          ? `❌ Invalid format! Please send a valid Gmail ending with @gmail.com:`
          : `❌ ভুল ফরম্যাট! সঠিক Gmail এড্রেস পাঠান (যেমন: \`name12@gmail.com\`):`,
        { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
      );
    }

    userState[chatId] = { step: 'awaiting_password', email: email };
    return bot.sendMessage(
      chatId,
      isEn
        ? `✅ *Email Accepted:* \`${email}\`\n\n🔑 *Step 2: Enter Password*\nNow type and send the password for this Gmail:`
        : `✅ *ইমেইল গৃহীত হয়েছে:* \`${email}\`\n\n🔑 *২য় ধাপ: পাসওয়ার্ড দিন*\nএবার এই জিমেইলের পাসওয়ার্ড (Password) লিখে পাঠান:`,
      { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
    );
  }

  // Step: Password
  if (state.step === 'awaiting_password') {
    const email = state.email;
    const password = text.trim();

    if (password.length < 6) {
      return bot.sendMessage(
        chatId,
        isEn ? `❌ Password must be at least 6 characters. Please resend:` : `❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে। আবার সঠিক পাসওয়ার্ড দিন:`,
        { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
      );
    }

    userState[chatId] = null;

    const subId = `sub_${Date.now()}`;
    db.submissions[subId] = {
      id: subId,
      userId: chatId,
      userName: user.name,
      username: user.username,
      email: email,
      password: password,
      amount: GMAIL_PRICE,
      status: 'pending',
      timestamp: Date.now()
    };

    user.submittedCount += 1;
    user.holdBalance += GMAIL_PRICE;
    saveDb();

    bot.sendMessage(
      chatId,
      isEn
        ? `✅ *Gmail Submitted Successfully!* 📩\n\n` +
          `📧 Email: \`${maskEmail(email)}\`\n` +
          `⏳ Status: *Pending Review (Hold)*\n` +
          `💰 Price: *+${GMAIL_PRICE.toFixed(2)} BDT*\n\n` +
          `Once verified by the admin, ${GMAIL_PRICE.toFixed(2)} BDT will be added to your balance.`
        : `✅ *আপনার Gmail সফলভাবে জমা হয়েছে!* 📩\n\n` +
          `📧 ইমেইল: \`${maskEmail(email)}\`\n` +
          `⏳ স্ট্যাটাস: *পেন্ডিং / হোল্ড (Hold)*\n` +
          `💰 সম্ভাব্য আয়: *+${GMAIL_PRICE.toFixed(2)} টাকা*\n\n` +
          `অ্যাডমিন ভেরিফাই করার সাথে সাথেই ব্যালেন্সে টাকা যুক্ত হবে।`,
      { parse_mode: 'Markdown', ...getMainMenu(chatId, user.language) }
    );

    // Notify Admin with Approve & Reject buttons
    const adminMsg =
      `📥 *New Gmail Submission!* 🚨\n\n` +
      `👤 User: ${user.name} (\`${chatId}\` ${user.username})\n` +
      `📧 *Gmail:* \`${email}\`\n` +
      `🔑 *Password:* \`${password}\`\n` +
      `💰 Rate: ${GMAIL_PRICE} BDT\n` +
      `🆔 ID: \`${subId}\``;

    bot.sendMessage(ADMIN_ID, adminMsg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: `✅ Approve (${GMAIL_PRICE} ৳)`, callback_data: `approve_sub_${subId}` },
            { text: '❌ Reject', callback_data: `reject_sub_${subId}` }
          ]
        ]
      }
    }).catch((err) => console.error('Admin alert error:', err.message));

    return;
  }

  // Step: bKash Number
  if (state.step === 'awaiting_bkash_number') {
    const num = text.trim();
    const bdRegex = /^(01[3-9]\d{8})$/;

    if (!bdRegex.test(num)) {
      return bot.sendMessage(
        chatId,
        isEn
          ? `❌ Invalid bKash number! Send an 11-digit BD number (e.g. \`01712345678\`):`
          : `❌ ভুল বিকাশ নাম্বার! ১১ ডিজিটের সঠিক নাম্বার পাঠান (যেমন: \`01712345678\`):`,
        { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
      );
    }

    userState[chatId] = { step: 'awaiting_withdraw_amount', bkashNumber: num };
    return bot.sendMessage(
      chatId,
      isEn
        ? `📱 *bKash Number:* \`${num}\`\n\n` +
          `💰 Available Balance: *${user.balance.toFixed(2)} BDT*\n` +
          `📌 Minimum Withdrawal: *${MIN_WITHDRAW.toFixed(2)} BDT*\n\n` +
          `Type the amount you want to withdraw (e.g. \`${Math.floor(user.balance)}\`):`
        : `📱 *বিকাশ নাম্বার গৃহীত:* \`${num}\`\n\n` +
          `💰 বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} টাকা*\n` +
          `📌 সর্বনিম্ন উইথড্র: *${MIN_WITHDRAW.toFixed(2)} টাকা*\n\n` +
          `কত টাকা উইথড্র করতে চান লিখুন (যেমন: \`${Math.floor(user.balance)}\`):`,
      { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
    );
  }

  // Step: Withdraw Amount
  if (state.step === 'awaiting_withdraw_amount') {
    const amount = parseFloat(text.trim());

    if (isNaN(amount) || amount < MIN_WITHDRAW) {
      return bot.sendMessage(
        chatId,
        isEn
          ? `❌ Minimum withdrawal is *${MIN_WITHDRAW.toFixed(2)} BDT*. Please re-enter:`
          : `❌ সর্বনিম্ন উইথড্র পরিমাণ *${MIN_WITHDRAW.toFixed(2)} টাকা*। সঠিক পরিমাণ লিখুন:`,
        { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
      );
    }

    if (amount > user.balance) {
      return bot.sendMessage(
        chatId,
        isEn
          ? `❌ Insufficient balance! You have *${user.balance.toFixed(2)} BDT*. Please enter a smaller amount:`
          : `❌ আপনার ব্যালেন্সে পর্যাপ্ত টাকা নেই! ব্যালেন্স আছে: *${user.balance.toFixed(2)} টাকা*।`,
        { parse_mode: 'Markdown', ...getCancelKeyboard(user.language) }
      );
    }

    const bkashNumber = state.bkashNumber;
    userState[chatId] = null;

    user.balance -= amount;
    user.totalWithdrawn += amount;

    const wdId = `wd_${Date.now()}`;
    db.withdrawals[wdId] = {
      id: wdId,
      userId: chatId,
      name: user.name,
      bkashNumber: bkashNumber,
      amount: amount,
      status: 'pending',
      timestamp: Date.now()
    };
    saveDb();

    bot.sendMessage(
      chatId,
      isEn
        ? `✅ *Withdrawal Request Submitted!* 💸\n\n` +
          `📱 bKash: \`${bkashNumber}\`\n` +
          `💰 Amount: *${amount.toFixed(2)} BDT*\n` +
          `💵 Remaining: *${user.balance.toFixed(2)} BDT*\n\n` +
          `Admin will process your payment soon!`
        : `✅ *উইথড্র রিকোয়েস্ট জমা হয়েছে!* 💸\n\n` +
          `📱 বিকাশ: \`${bkashNumber}\`\n` +
          `💰 পরিমাণ: *${amount.toFixed(2)} টাকা*\n` +
          `💵 অবশিষ্ট ব্যালেন্স: *${user.balance.toFixed(2)} টাকা*\n\n` +
          `অ্যাডমিন দ্রুত আপনার বিকাশ পার্সোনালে টাকা পাঠিয়ে দিবে।`,
      { parse_mode: 'Markdown', ...getMainMenu(chatId, user.language) }
    );

    // Notify Admin with Paid & Reject buttons
    const adminWdMsg =
      `💸 *New Withdrawal Request!* 🚨\n\n` +
      `👤 User: ${user.name} (\`${chatId}\`)\n` +
      `📱 *bKash:* \`${bkashNumber}\`\n` +
      `💰 *Amount:* ${amount.toFixed(2)} BDT\n` +
      `🆔 Request ID: \`${wdId}\``;

    bot.sendMessage(ADMIN_ID, adminWdMsg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Mark as Paid', callback_data: `pay_wd_${wdId}` },
            { text: '❌ Reject & Refund', callback_data: `reject_wd_${wdId}` }
          ]
        ]
      }
    }).catch((e) => console.error('Admin payout notify error:', e.message));

    return;
  }
});

// =================================================================
// 🔘 INLINE BUTTON ACTIONS (Language + Admin)
// =================================================================
bot.on('callback_query', (query) => {
  const data = query.data;
  const adminChatId = String(query.message.chat.id);
  const userId = String(query.from.id);
  const user = getUser(userId, query.from);

  // Language Change Callbacks
  if (data === 'lang_en') {
    user.language = 'en';
    saveDb();
    bot.answerCallbackQuery(query.id, { text: 'Language changed to English!' });
    return bot.sendMessage(userId, '🇺🇸 Language set to **English**.', {
      parse_mode: 'Markdown',
      ...getMainMenu(userId, 'en')
    });
  }

  if (data === 'lang_bn') {
    user.language = 'bn';
    saveDb();
    bot.answerCallbackQuery(query.id, { text: 'ভাষা পরিবর্তন করে বাংলা করা হয়েছে!' });
    return bot.sendMessage(userId, '🇧🇩 ভাষা পরিবর্তন করে **বাংলা** করা হয়েছে।', {
      parse_mode: 'Markdown',
      ...getMainMenu(userId, 'bn')
    });
  }

  // Admin: View pending subs
  if (data === 'admin_view_pending_subs') {
    const pendings = Object.values(db.submissions).filter((s) => s.status === 'pending');
    if (pendings.length === 0) {
      return bot.answerCallbackQuery(query.id, { text: 'No pending Gmails!' });
    }
    const list = pendings.slice(0, 5).map((p) => `• \`${p.email}\` | Pass: \`${p.password}\``).join('\n');
    bot.sendMessage(adminChatId, `📥 *Pending Gmails (${pendings.length}):*\n\n${list}`, { parse_mode: 'Markdown' });
    return bot.answerCallbackQuery(query.id);
  }

  // Admin: View pending payouts
  if (data === 'admin_view_pending_wd') {
    const pendings = Object.values(db.withdrawals).filter((w) => w.status === 'pending');
    if (pendings.length === 0) {
      return bot.answerCallbackQuery(query.id, { text: 'No pending payouts!' });
    }
    const list = pendings.slice(0, 5).map((w) => `• \`${w.bkashNumber}\` - ${w.amount} BDT`).join('\n');
    bot.sendMessage(adminChatId, `💸 *Pending Payouts (${pendings.length}):*\n\n${list}`, { parse_mode: 'Markdown' });
    return bot.answerCallbackQuery(query.id);
  }

  // Admin: Broadcast
  if (data === 'admin_start_broadcast') {
    if (adminChatId !== ADMIN_ID) return;
    userState[adminChatId] = { step: 'admin_broadcast' };
    bot.sendMessage(adminChatId, '📢 Send the announcement message to broadcast to all users (or Cancel):', getCancelKeyboard('en'));
    return bot.answerCallbackQuery(query.id);
  }

  // 1️⃣ APPROVE GMAIL SUBMISSION
  if (data.startsWith('approve_sub_')) {
    const subId = data.replace('approve_sub_', '');
    const sub = db.submissions[subId];

    if (!sub) return bot.answerCallbackQuery(query.id, { text: 'Submission not found!' });
    if (sub.status !== 'pending') return bot.answerCallbackQuery(query.id, { text: `Already ${sub.status}!` });

    sub.status = 'approved';
    const target = db.users[sub.userId];
    if (target) {
      target.balance += sub.amount;
      target.holdBalance = Math.max(0, target.holdBalance - sub.amount);
      target.approvedCount += 1;
    }
    saveDb();

    bot.answerCallbackQuery(query.id, { text: 'Approved successfully!' });

    bot.editMessageText(
      `${query.message.text}\n\n✅ *Status: APPROVED BY ADMIN*`,
      { chat_id: adminChatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

    const isTargetEn = target && target.language === 'en';
    bot.sendMessage(
      sub.userId,
      isTargetEn
        ? `🎉 *Congratulations! Your Gmail submission has been approved!* 💎\n\n` +
          `📧 Email: \`${maskEmail(sub.email)}\`\n` +
          `💰 *+${sub.amount.toFixed(2)} BDT* has been added to your balance!\n\n` +
          `Check your balance in *💰 Balance*.`
        : `🎉 *অভিনন্দন! আপনার জমা দেওয়া Gmail অনুমোদিত হয়েছে!* 💎\n\n` +
          `📧 ইমেইল: \`${maskEmail(sub.email)}\`\n` +
          `💰 ব্যালেন্সে *+${sub.amount.toFixed(2)} টাকা* যুক্ত করা হয়েছে!\n\n` +
          `ব্যালেন্স চেক করতে *💰 ব্যালেন্স* বাটনে চাপ দিন।`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return;
  }

  // 2️⃣ REJECT GMAIL SUBMISSION
  if (data.startsWith('reject_sub_')) {
    const subId = data.replace('reject_sub_', '');
    const sub = db.submissions[subId];

    if (!sub) return bot.answerCallbackQuery(query.id, { text: 'Submission not found!' });
    if (sub.status !== 'pending') return bot.answerCallbackQuery(query.id, { text: `Already ${sub.status}!` });

    sub.status = 'rejected';
    const target = db.users[sub.userId];
    if (target) {
      target.holdBalance = Math.max(0, target.holdBalance - sub.amount);
      target.rejectedCount += 1;
    }
    saveDb();

    bot.answerCallbackQuery(query.id, { text: 'Submission rejected.' });

    bot.editMessageText(
      `${query.message.text}\n\n❌ *Status: REJECTED*`,
      { chat_id: adminChatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

    const isTargetEn = target && target.language === 'en';
    bot.sendMessage(
      sub.userId,
      isTargetEn
        ? `❌ *Your Gmail submission was rejected.* ⚠️\n\n` +
          `📧 Email: \`${maskEmail(sub.email)}\`\n` +
          `Reason: Wrong password, 2FA enabled, or recovery details detected.`
        : `❌ *দুঃখিত, আপনার জমা দেওয়া Gmail বাতিল করা হয়েছে!* ⚠️\n\n` +
          `📧 ইমেইল: \`${maskEmail(sub.email)}\`\n` +
          `কারণ: ভুল পাসওয়ার্ড অথবা 2-Step Verification অন ছিল।`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return;
  }

  // 3️⃣ MARK WITHDRAWAL AS PAID
  if (data.startsWith('pay_wd_')) {
    const wdId = data.replace('pay_wd_', '');
    const wd = db.withdrawals[wdId];

    if (!wd || wd.status !== 'pending') return bot.answerCallbackQuery(query.id, { text: 'Already processed!' });

    wd.status = 'paid';
    saveDb();

    bot.answerCallbackQuery(query.id, { text: 'Marked as Paid!' });

    bot.editMessageText(
      `${query.message.text}\n\n✅ *Status: PAID & COMPLETED*`,
      { chat_id: adminChatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

    const target = db.users[wd.userId];
    const isTargetEn = target && target.language === 'en';

    bot.sendMessage(
      wd.userId,
      isTargetEn
        ? `🎉 *bKash Payment Completed!* 💸\n\n📱 bKash Number: \`${wd.bkashNumber}\`\n💰 Amount: *${wd.amount.toFixed(2)} BDT*\n\nPlease check your bKash statement!`
        : `🎉 *আপনার বিকাশ পেমেন্ট সম্পন্ন হয়েছে!* 💸\n\n📱 বিকাশ নাম্বার: \`${wd.bkashNumber}\`\n💰 টাকার পরিমাণ: *${wd.amount.toFixed(2)} টাকা*\n\nআপনার বিকাশ স্টেটমেন্ট চেক করুন। ধন্যবাদ!`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return;
  }

  // 4️⃣ REJECT & REFUND WITHDRAWAL
  if (data.startsWith('reject_wd_')) {
    const wdId = data.replace('reject_wd_', '');
    const wd = db.withdrawals[wdId];

    if (!wd || wd.status !== 'pending') return bot.answerCallbackQuery(query.id, { text: 'Already processed!' });

    wd.status = 'rejected';
    const target = db.users[wd.userId];
    if (target) {
      target.balance += wd.amount;
      target.totalWithdrawn = Math.max(0, target.totalWithdrawn - wd.amount);
    }
    saveDb();

    bot.answerCallbackQuery(query.id, { text: 'Refunded to user balance.' });

    bot.editMessageText(
      `${query.message.text}\n\n❌ *Status: REJECTED & REFUNDED*`,
      { chat_id: adminChatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});

    const isTargetEn = target && target.language === 'en';
    bot.sendMessage(
      wd.userId,
      isTargetEn
        ? `⚠️ *Your withdrawal was cancelled and ${wd.amount.toFixed(2)} BDT has been refunded to your balance.*`
        : `⚠️ *আপনার উইথড্র রিকোয়েস্ট বাতিল করে ${wd.amount.toFixed(2)} টাকা ব্যালেন্সে ফেরত দেওয়া হয়েছে।*`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    return;
  }
});

// =================================================================
// 🌐 WEB SERVER (PORT 3000 FOR 24/7 RENDER KEEP-ALIVE)
// =================================================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    bot: botUsername,
    usersCount: Object.keys(db.users).length,
    channel: CHANNEL_URL
  }));
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});
