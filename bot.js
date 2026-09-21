require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ==========================================
// ⚙️ বটের কনফিগারেশন (SETTINGS)
// ==========================================
const TOKEN = process.env.BOT_TOKEN || '8859315023:AAFn4-tPENjfYegz6FXh_fs_i8lgwoqU1v0';
const ADMIN_ID = process.env.ADMIN_ID || '8865474356';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/easygmailseller';
const ADMIN_CONTACT_URL = process.env.ADMIN_CONTACT_URL || 'https://t.me/easygmailsellerUSA';

const GMAIL_PRICE = 15.0;      // প্রতি জিমেইল ১৫ টাকা
const REFERRAL_BONUS = 2.0;    // প্রতি রেফারে ২ টাকা
const MIN_WITHDRAW = 15.0;     // সর্বনিম্ন উইথড্র ১৫ টাকা

const bot = new TelegramBot(TOKEN, { polling: true });

let botUsername = 'EasyGmailSellerBot';
bot.getMe().then((me) => {
  if (me && me.username) {
    botUsername = me.username;
    console.log(`Bot connected as @${botUsername}`);
  }
}).catch((err) => console.error('GetMe error:', err.message));

// ==========================================
// 🗄️ লোকাল ডাটাবেস হ্যান্ডলার (database.json)
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');
let db = {
  users: {},
  submissions: {},
  withdrawals: {}
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
      saveDatabase();
    }
  } catch (e) {
    console.error('Database load error:', e.message);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Database save error:', e.message);
  }
}

loadDatabase();

const userState = {};

function getUser(userId, from = {}) {
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      name: from.first_name || 'User',
      username: from.username ? `@${from.username}` : '',
      balance: 0.0,          // উইথড্রযোগ্য মূল ব্যালেন্স
      holdBalance: 0.0,      // পেন্ডিং জিমেইলের হোল্ড ব্যালেন্স
      totalWithdrawn: 0.0,   // মোট উইথড্র করা টাকা
      submittedCount: 0,     // মোট জমাকৃত
      approvedCount: 0,      // অনুমোদিত
      rejectedCount: 0,      // রিজেক্টেড
      referralsCount: 0,     // মোট রেফার সংখ্যা
      referralEarnings: 0.0, // রেফারেল ইনকাম
      referrerId: null,
      createdAt: new Date().toLocaleDateString('bn-BD')
    };
    saveDatabase();
  }
  return db.users[userId];
}

function getMainMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📥 Submit Gmail ✉️' }],
        [{ text: '💰 Balance 💵' }, { text: '👤 My Account 📋' }],
        [{ text: '💸 Withdraw (bKash) 📱' }, { text: '👥 Refer & Earn 🎁' }],
        [{ text: '📢 Official Channel 🚀' }, { text: '👨‍💻 Admin Support 💬' }]
      ],
      resize_keyboard: true
    }
  };
}

function maskEmail(email) {
  try {
    const [name, domain] = email.split('@');
    if (name.length <= 3) return `${name}***@${domain}`;
    return `${name.substring(0, 3)}***${name.slice(-1)}@${domain}`;
  } catch (e) {
    return email;
  }
}

// ==========================================
// 🚀 /start কমান্ড
// ==========================================
bot.onText(/\/start(.*)/, (msg, match) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId, msg.from);
  const startParam = match[1] ? match[1].trim() : '';

  if (startParam.startsWith('ref_') && !user.referrerId) {
    const refId = startParam.replace('ref_', '');
    if (refId && refId !== String(chatId) && db.users[refId]) {
      user.referrerId = refId;
      db.users[refId].referralsCount += 1;
      db.users[refId].referralEarnings += REFERRAL_BONUS;
      db.users[refId].balance += REFERRAL_BONUS;
      saveDatabase();

      bot.sendMessage(
        refId,
        `🎉 *অভিনন্দন!* নতুন একজন ইউজার আপনার রেফারেল লিংকে জয়েন করেছে।\n🎁 আপনার ব্যালেন্সে *+${REFERRAL_BONUS.toFixed(2)} টাকা* যোগ করা হয়েছে!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }

  userState[chatId] = null;

  const welcomeText = 
    `🎉 *স্বাগতম Easy Gmail Seller বটে!* 💎\n\n` +
    `💰 প্রতি সচল জিমেইলে পাবেন: *${GMAIL_PRICE.toFixed(2)} টাকা*\n` +
    `🎁 প্রতি সফল রেফারে পাবেন: *${REFERRAL_BONUS.toFixed(2)} টাকা*\n` +
    `💳 পেমেন্ট মাধ্যম: *bKash Personal*\n\n` +
    `👇 *নিচের মেনু থেকে আপনার কাঙ্ক্ষিত অপশন সিলেক্ট করুন:*`;

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    ...getMainMenu()
  });
});

// ==========================================
// 📩 টেক্সট মেসেজ ও মেনু হ্যান্ডলার
// ==========================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/start')) return;
  const user = getUser(chatId, msg.from);

  // 1️⃣ 💰 Balance অপশন
  if (text === '💰 Balance 💵') {
    userState[chatId] = null;
    const balanceMsg =
      `💰 *আপনার ব্যালেন্স সামারি* 📊\n\n` +
      `✅ *উইথড্রযোগ্য ব্যালেন্স:* ${user.balance.toFixed(2)} ৳\n` +
      `⏳ *হোল্ড ব্যালেন্স:* ${user.holdBalance.toFixed(2)} ৳ (পর্যালোচনায় আছে)\n` +
      `💳 *মোট উইথড্র করা হয়েছে:* ${user.totalWithdrawn.toFixed(2)} ৳\n\n` +
      `📥 *মোট জমাকৃত জিমেইল:* ${user.submittedCount} টি\n` +
      `🎯 *অনুমোদিত:* ${user.approvedCount} টি | ❌ *রিজেক্ট:* ${user.rejectedCount} টি\n\n` +
      `📌 _ব্যালেন্স ${MIN_WITHDRAW} টাকা বা তার বেশি হলেই bKash-এ উইথড্র করতে পারবেন।_`;

    return bot.sendMessage(chatId, balanceMsg, { parse_mode: 'Markdown', ...getMainMenu() });
  }

  // 2️⃣ 👤 My Account অপশন
  if (text === '👤 My Account 📋') {
    userState[chatId] = null;

    const userSubs = Object.values(db.submissions)
      .filter((s) => String(s.userId) === String(chatId))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);

    let recentHistoryText = '';
    if (userSubs.length === 0) {
      recentHistoryText = '_(এখনো কোনো জিমেইল জমা দেননি)_';
    } else {
      recentHistoryText = userSubs
        .map((s, idx) => {
          let statusEmoji = '⏳ পেন্ডিং (Hold)';
          if (s.status === 'approved') statusEmoji = '✅ অনুমোদিত (Approved)';
          if (s.status === 'rejected') statusEmoji = '❌ বাতিল (Rejected)';
          return `${idx + 1}. \`${maskEmail(s.email)}\`\n   ↳ স্ট্যাটাস: *${statusEmoji}* | রেট: ${s.amount} ৳`;
        })
        .join('\n\n');
    }

    const accountMsg =
      `👤 *আপনার অ্যাকাউন্ট প্রোফাইল* 📋\n\n` +
      `🆔 *ইউজার আইডি:* \`${chatId}\`\n` +
      `📅 *যোগদানের তারিখ:* ${user.createdAt}\n` +
      `💵 *বর্তমান ব্যালেন্স:* *${user.balance.toFixed(2)} ৳*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📂 *রিসেন্ট জিমেইল বিক্রয়ের তথ্য:* \n\n` +
      `${recentHistoryText}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👇 নতুন জিমেইল বিক্রি করতে '📥 Submit Gmail ✉️' বাটনে চাপ দিন।`;

    return bot.sendMessage(chatId, accountMsg, { parse_mode: 'Markdown', ...getMainMenu() });
  }

  // 3️⃣ 👥 Refer & Earn অপশন
  if (text === '👥 Refer & Earn 🎁') {
    userState[chatId] = null;
    const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;

    const referMsg =
      `👥 *রেফার করে আনলিমিটেড আয় করুন!* 🎁\n\n` +
      `🚀 আপনার রেফারেল লিংক দিয়ে কেউ বটে জয়েন করলেই আপনি পাবেন *${REFERRAL_BONUS.toFixed(2)} টাকা* বোনাস!\n\n` +
      `🔗 *আপনার রেফারেল লিংক:*\n\`${refLink}\`\n\n` +
      `📊 *আপনার রেফারেল পরিসংখ্যান:*\n` +
      `• মোট রেফার: *${user.referralsCount} জন*\n` +
      `• রেফারেল থেকে মোট আয়: *${user.referralEarnings.toFixed(2)} ৳*\n\n` +
      `📲 _লিংকটি কপি করে বন্ধুদের সাথে শেয়ার করুন!_`;

    return bot.sendMessage(chatId, referMsg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 বন্ধুদের টেলিগ্রামে শেয়ার করুন', url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('ঘরে বসে জিমেইল বিক্রি করে প্রতিদিন আয় করুন! প্রতি জিমেইল ১৫ টাকা।')}` }]
        ]
      }
    });
  }

  // 4️⃣ 📢 Official Channel অপশন
  if (text === '📢 Official Channel 🚀') {
    userState[chatId] = null;
    return bot.sendMessage(
      chatId,
      `📢 *আমাদের অফিসিয়াল টেলিগ্রাম চ্যানেল* 🚀\n\nসকল প্রকার পেমেন্ট প্রুফ, গুরুত্বপূর্ণ আপডেট এবং নতুন নোটিশ জানতে আমাদের চ্যানেলে যুক্ত থাকুন।`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📢 জয়েন করুন আমাদের চ্যানেলে', url: CHANNEL_URL }]
          ]
        }
      }
    );
  }

  // 5️⃣ 👨‍💻 Admin Support অপশন
  if (text === '👨‍💻 Admin Support 💬') {
    userState[chatId] = null;
    return bot.sendMessage(
      chatId,
      `👨‍💻 *অ্যাডমিন সাপোর্ট ও হেল্পলাইন* 💬\n\nআপনার কোনো পেমেন্ট সমস্যা, একাউন্ট হেল্প বা প্রশ্ন থাকলে সরাসরি অ্যাডমিনের সাথে যোগাযোগ করুন:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 অ্যাডমিনের সাথে সরাসরি চ্যাট করুন', url: ADMIN_CONTACT_URL }]
          ]
        }
      }
    );
  }

  // 6️⃣ 📥 Submit Gmail ✉️ অপশন
  if (text === '📥 Submit Gmail ✉️') {
    userState[chatId] = { step: 'awaiting_email' };
    return bot.sendMessage(
      chatId,
      `📌 *Gmail সাবমিশন - ১ম ধাপ (ইমেইল)* ✉️\n\n` +
      `💰 প্রতি অনুমোদিত জিমেইল: *${GMAIL_PRICE.toFixed(2)} টাকা*\n\n` +
      `✍️ অনুগ্রহ করে আপনার **Gmail Address** টি লিখে পাঠান (যেমন: \`example@gmail.com\`):\n\n` +
      `⚠️ *জরুরি শর্ত:* \n` +
      `• অবশ্যই শেষে @gmail.com থাকতে হবে\n` +
      `• কোনো 2-Step Verification থাকা যাবে না\n` +
      `• রিকভারি নাম্বার বা রিকভারি মেইল থাকা যাবে না\n\n` +
      `_(বাতিল করতে চাইলে /start চাপুন)_`,
      { parse_mode: 'Markdown' }
    );
  }

  // 7️⃣ 💸 Withdraw (bKash) 📱 অপশন
  if (text === '💸 Withdraw (bKash) 📱') {
    if (user.balance < MIN_WITHDRAW) {
      return bot.sendMessage(
        chatId,
        `❌ *অপর্যাপ্ত ব্যালেন্স!* ⚠️\n\n` +
        `আপনার বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} ৳*\n` +
        `উইথড্র করার জন্য সর্বনিম্ন *${MIN_WITHDRAW.toFixed(2)} ৳* প্রয়োজন।\n\n` +
        `জিমেইল জমা দিয়ে বা বন্ধুদের রেফার করে ব্যালেন্স বাড়ান!`,
        { parse_mode: 'Markdown', ...getMainMenu() }
      );
    }

    userState[chatId] = { step: 'awaiting_bkash_number' };
    return bot.sendMessage(
      chatId,
      `💸 *বিকাশ পার্সোনাল উইথড্র (bKash)* 📱\n\n` +
      `💰 আপনার বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} ৳*\n` +
      `📌 সর্বনিম্ন উত্তোলন: *${MIN_WITHDRAW.toFixed(2)} ৳*\n\n` +
      `✍️ অনুগ্রহ করে আপনার **১১ ডিজিটের বিকাশ পার্সোনাল নাম্বার** লিখে পাঠান (যেমন: \`017XXXXXXXX\`):`,
      { parse_mode: 'Markdown' }
    );
  }

  // ==========================================
  // 🔄 ইনপুট স্টেপ হ্যান্ডলার
  // ==========================================
  const state = userState[chatId];
  if (!state) return;

  if (state.step === 'awaiting_email') {
    const email = text.trim().toLowerCase();
    if (!email.endsWith('@gmail.com') || email.includes(' ')) {
      return bot.sendMessage(
        chatId,
        `❌ *ভুল ফরম্যাট!* অনুগ্রহ করে সঠিক Gmail এড্রেস পাঠান (যেমন: \`myname12@gmail.com\`):`,
        { parse_mode: 'Markdown' }
      );
    }
    userState[chatId] = { step: 'awaiting_password', email: email };
    return bot.sendMessage(
      chatId,
      `✅ *ইমেইল গৃহীত হয়েছে:* \`${email}\`\n\n` +
      `🔑 *২য় ধাপ:* এবার এই জিমেইলের **পাসওয়ার্ড (Password)** লিখে পাঠান:`,
      { parse_mode: 'Markdown' }
    );
  }

  if (state.step === 'awaiting_password') {
    const email = state.email;
    const password = text.trim();

    if (password.length < 6) {
      return bot.sendMessage(chatId, `❌ পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে। আবার সঠিক পাসওয়ার্ড দিন:`);
    }

    userState[chatId] = null;

    const subId = `sub_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    db.submissions[subId] = {
      id: subId,
      userId: chatId,
      userName: user.name,
      username: user.username,
      email: email,
      password: password,
      amount: GMAIL_PRICE,
      status: 'pending',
      timestamp: Date.now(),
      dateStr: new Date().toLocaleString('bn-BD')
    };

    user.submittedCount += 1;
    user.holdBalance += GMAIL_PRICE;
    saveDatabase();

    bot.sendMessage(
      chatId,
      `✅ *আপনার Gmail সফলভাবে জমা হয়েছে!* 📩\n\n` +
      `📧 ইমেইল: \`${maskEmail(email)}\`\n` +
      `⏳ স্ট্যাটাস: *পেন্ডিং / হোল্ড (Hold)*\n` +
      `💰 সম্ভাব্য আয়: *+${GMAIL_PRICE.toFixed(2)} ৳*\n\n` +
      `অ্যাডমিন ভেরিফাই করার সাথে সাথেই আপনার মূল ব্যালেন্সে টাকা যুক্ত হবে। আপনি '👤 My Account 📋' এ গিয়ে স্ট্যাটাস চেক করতে পারবেন।`,
      { parse_mode: 'Markdown', ...getMainMenu() }
    );

    const adminNotice =
      `📥 *নতুন জিমেইল জমা পড়েছে!* 🚨\n\n` +
      `👤 ইউজার: ${user.name} (\`${chatId}\` ${user.username})\n` +
      `📧 *Gmail:* \`${email}\`\n` +
      `🔑 *Password:* \`${password}\`\n` +
      `💰 রেট: ${GMAIL_PRICE} ৳\n` +
      `🆔 সাবমিশন আইডি: \`${subId}\``;

    bot.sendMessage(ADMIN_ID, adminNotice, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve (15 ৳)', callback_data: `approve_sub_${subId}` },
            { text: '❌ Reject', callback_data: `reject_sub_${subId}` }
          ]
        ]
      }
    }).catch((e) => console.error('Admin notify error:', e.message));

    return;
  }

  if (state.step === 'awaiting_bkash_number') {
    const num = text.trim();
    const bdPhoneRegex = /^(01[3-9]\d{8})$/;

    if (!bdPhoneRegex.test(num)) {
      return bot.sendMessage(
        chatId,
        `❌ *ভুল বিকাশ নাম্বার!* অনুগ্রহ করে ১১ ডিজিটের সঠিক নাম্বার পাঠান (যেমন: \`01712345678\`):`,
        { parse_mode: 'Markdown' }
      );
    }

    userState[chatId] = { step: 'awaiting_withdraw_amount', bkashNumber: num };
    return bot.sendMessage(
      chatId,
      `📱 *বিকাশ নাম্বার গৃহীত:* \`${num}\`\n\n` +
      `💰 আপনার বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} ৳*\n` +
      `📌 সর্বনিম্ন উইথড্র: *${MIN_WITHDRAW.toFixed(2)} ৳*\n\n` +
      `✍️ *আপনি কত টাকা উইথড্র করতে চান?* টাকার পরিমাণ লিখে পাঠান (যেমন: \`${Math.floor(user.balance)}\`):`,
      { parse_mode: 'Markdown' }
    );
  }

  if (state.step === 'awaiting_withdraw_amount') {
    const amount = parseFloat(text.trim());

    if (isNaN(amount) || amount < MIN_WITHDRAW) {
      return bot.sendMessage(
        chatId,
        `❌ সর্বনিম্ন উইথড্র পরিমাণ *${MIN_WITHDRAW.toFixed(2)} ৳*। অনুগ্রহ করে সঠিক সংখ্যা লিখুন:`,
        { parse_mode: 'Markdown' }
      );
    }

    if (amount > user.balance) {
      return bot.sendMessage(
        chatId,
        `❌ আপনার ব্যালেন্সে পর্যাপ্ত টাকা নেই! বর্তমান ব্যালেন্স: *${user.balance.toFixed(2)} ৳*। আবার লিখুন:`,
        { parse_mode: 'Markdown' }
      );
    }

    const bkashNumber = state.bkashNumber;
    userState[chatId] = null;

    user.balance -= amount;
    user.totalWithdrawn += amount;

    const withId = `wd_${Date.now()}`;
    db.withdrawals[withId] = {
      id: withId,
      userId: chatId,
      name: user.name,
      bkashNumber: bkashNumber,
      amount: amount,
      status: 'pending',
      timestamp: Date.now(),
      dateStr: new Date().toLocaleString('bn-BD')
    };
    saveDatabase();

    bot.sendMessage(
      chatId,
      `✅ *উইথড্র রিকোয়েস্ট সফলভাবে জমা হয়েছে!* 💸\n\n` +
      `📱 বিকাশ পার্সোনাল: \`${bkashNumber}\`\n` +
      `💰 উইথড্র পরিমাণ: *${amount.toFixed(2)} ৳*\n` +
      `💵 অবশিষ্ট ব্যালেন্স: *${user.balance.toFixed(2)} ৳*\n\n` +
      `অ্যাডমিন ভেরিফাই করে দ্রুত আপনার বিকাশ পার্সোনালে টাকা পাঠিয়ে দিবে। ধন্যবাদ!`,
      { parse_mode: 'Markdown', ...getMainMenu() }
    );

    const adminWithdrawNotice =
      `💸 *নতুন উইথড্র রিকোয়েস্ট!* 🚨\n\n` +
      `👤 ইউজার: ${user.name} (\`${chatId}\`)\n` +
      `📱 *bKash:* \`${bkashNumber}\`\n` +
      `💰 *পরিমাণ:* ${amount.toFixed(2)} ৳\n` +
      `🆔 রিকোয়েস্ট আইডি: \`${withId}\``;

    bot.sendMessage(ADMIN_ID, adminWithdrawNotice, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Mark as Paid', callback_data: `pay_wd_${withId}` },
            { text: '❌ Reject & Refund', callback_data: `reject_wd_${withId}` }
          ]
        ]
      }
    }).catch((e) => console.error('Admin withdraw notify error:', e.message));

    return;
  }
});

// ==========================================
// 🔘 ইনলাইন বাটন হ্যান্ডলার (Approve / Reject)
// ==========================================
bot.on('callback_query', (query) => {
  const data = query.data;
  const adminChatId = query.message.chat.id;

  // 1️⃣ জিমেইল সাবমিশন APPROVE
  if (data.startsWith('approve_sub_')) {
    const subId = data.replace('approve_sub_', '');
    const sub = db.submissions[subId];

    if (!sub) {
      return bot.answerCallbackQuery(query.id, { text: 'সাবমিশন পাওয়া যায়নি!', show_alert: true });
    }
    if (sub.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: `এটি ইতিমধ্যে ${sub.status}!`, show_alert: true });
    }

    sub.status = 'approved';
    const targetUser = db.users[sub.userId];
    if (targetUser) {
      targetUser.balance += sub.amount;
      targetUser.holdBalance = Math.max(0, targetUser.holdBalance - sub.amount);
      targetUser.approvedCount += 1;
    }
    saveDatabase();

    bot.answerCallbackQuery(query.id, { text: 'জিমেইল অনুমোদিত হয়েছে!' });

    bot.editMessageText(
      `${query.message.text}\n\n✅ *স্ট্যাটাস: অ্যাডমিন কর্তৃক অনুমোদিত (Approved)!*`,
      {
        chat_id: adminChatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    ).catch(() => {});

    bot.sendMessage(
      sub.userId,
      `🎉 *অভিনন্দন! আপনার জমা দেওয়া Gmail অনুমোদিত হয়েছে!* 💎\n\n` +
      `📧 ইমেইল: \`${maskEmail(sub.email)}\`\n` +
      `💰 আপনার মূল ব্যালেন্সে *+${sub.amount.toFixed(2)} টাকা* যুক্ত করা হয়েছে!\n\n` +
      `বর্তমান ব্যালেন্স চেক করতে '💰 Balance 💵' এ চাপ দিন।`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  // 2️⃣ জিমেইল সাবমিশন REJECT
  if (data.startsWith('reject_sub_')) {
    const subId = data.replace('reject_sub_', '');
    const sub = db.submissions[subId];

    if (!sub) {
      return bot.answerCallbackQuery(query.id, { text: 'সাবমিশন পাওয়া যায়নি!', show_alert: true });
    }
    if (sub.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: `এটি ইতিমধ্যে ${sub.status}!`, show_alert: true });
    }

    sub.status = 'rejected';
    const targetUser = db.users[sub.userId];
    if (targetUser) {
      targetUser.holdBalance = Math.max(0, targetUser.holdBalance - sub.amount);
      targetUser.rejectedCount += 1;
    }
    saveDatabase();

    bot.answerCallbackQuery(query.id, { text: 'জিমেইল বাতিল করা হয়েছে।' });

    bot.editMessageText(
      `${query.message.text}\n\n❌ *স্ট্যাটাস: বাতিল করা হয়েছে (Rejected)*`,
      {
        chat_id: adminChatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    ).catch(() => {});

    bot.sendMessage(
      sub.userId,
      `❌ *দুঃখিত, আপনার জমা দেওয়া Gmail বাতিল (Rejected) হয়েছে!* ⚠️\n\n` +
      `📧 ইমেইল: \`${maskEmail(sub.email)}\`\n` +
      `কারণ: পাসওয়ার্ড ভুল অথবা 2-Step Verification অন ছিল।\n\n` +
      `সঠিক ও ফ্রেশ জিমেইল জমা দিতে আবার '📥 Submit Gmail ✉️' বাটনে চাপ দিন।`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  // 3️⃣ উইথড্র রিকোয়েস্ট PAID
  if (data.startsWith('pay_wd_')) {
    const withId = data.replace('pay_wd_', '');
    const wd = db.withdrawals[withId];

    if (!wd || wd.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: 'অলরেডি কমপ্লিট বা পাওয়া যায়নি!' });
    }

    wd.status = 'paid';
    saveDatabase();

    bot.answerCallbackQuery(query.id, { text: 'পেমেন্ট সফল হিসেবে মার্ক করা হয়েছে!' });

    bot.editMessageText(
      `${query.message.text}\n\n✅ *স্ট্যাটাস: পেমেন্ট সম্পন্ন (Paid)!*`,
      {
        chat_id: adminChatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    ).catch(() => {});

    bot.sendMessage(
      wd.userId,
      `🎉 *আপনার বিকাশ পেমেন্ট সম্পন্ন হয়েছে!* 💸\n\n` +
      `📱 বিকাশ নাম্বার: \`${wd.bkashNumber}\`\n` +
      `💰 টাকার পরিমাণ: *${wd.amount.toFixed(2)} ৳*\n\n` +
      `বিকাশ স্টেটমেন্ট চেক করুন। আমাদের সাথে থাকার জন্য ধন্যবাদ!`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  // 4️⃣ উইথড্র রিকোয়েস্ট REJECT & REFUND
  if (data.startsWith('reject_wd_')) {
    const withId = data.replace('reject_wd_', '');
    const wd = db.withdrawals[withId];

    if (!wd || wd.status !== 'pending') {
      return bot.answerCallbackQuery(query.id, { text: 'অলরেডি কমপ্লিট বা পাওয়া যায়নি!' });
    }

    wd.status = 'rejected';
    const targetUser = db.users[wd.userId];
    if (targetUser) {
      targetUser.balance += wd.amount;
      targetUser.totalWithdrawn = Math.max(0, targetUser.totalWithdrawn - wd.amount);
    }
    saveDatabase();

    bot.answerCallbackQuery(query.id, { text: 'উইথড্র বাতিল এবং টাকা রিফান্ড করা হয়েছে।' });

    bot.editMessageText(
      `${query.message.text}\n\n❌ *স্ট্যাটাস: বাতিল ও ব্যালেন্সে রিফান্ড করা হয়েছে!*`,
      {
        chat_id: adminChatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    ).catch(() => {});

    bot.sendMessage(
      wd.userId,
      `⚠️ *আপনার উইথড্র রিকোয়েস্ট বাতিল করা হয়েছে এবং টাকা আপনার ব্যালেন্সে ফেরত দেওয়া হয়েছে।* 💰\n\n` +
      `ফেরতকৃত পরিমাণ: *${wd.amount.toFixed(2)} ৳*\n` +
      `সঠিক বিকাশ নাম্বার দিয়ে পুনরায় উইথড্র করুন।`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// ==========================================
// 🌐 Render Web Server (Keep-Alive Port 3000)
// ==========================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    bot: botUsername,
    activeUsers: Object.keys(db.users).length,
    uptime: process.uptime()
  }));
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
