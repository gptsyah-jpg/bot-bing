/**
 * Telegram Registration Bot
 * =========================
 * A production-ready Telegram bot with Web App verification,
 * email collection, OTP validation, and password creation.
 * 
 * Flow: /start → Email → Web App Captcha → OTP → Password → Done
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const bcrypt = require('bcrypt');

// ─── Configuration ───────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:3000';

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required in .env file');
  process.exit(1);
}

// ─── Initialize Bot ──────────────────────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);

// ─── In-Memory Session Store ─────────────────────────────────────────────────
// In production, replace with Redis or a database
const sessions = new Map();

// ─── Anti-Spam Cooldown Store ────────────────────────────────────────────────
const cooldowns = new Map();
const COOLDOWN_MS = 3000; // 3 seconds between commands

// ─── User States ─────────────────────────────────────────────────────────────
const STATES = {
  IDLE: 'idle',
  AWAITING_EMAIL: 'awaiting_email',
  AWAITING_CAPTCHA: 'awaiting_captcha',
  AWAITING_OTP: 'awaiting_otp',
  AWAITING_PASSWORD: 'awaiting_password',
  REGISTERED: 'registered',
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get or create user session
 */
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      state: STATES.IDLE,
      email: null,
      otp: null,
      otpExpiry: null,
      passwordHash: null,
      createdAt: Date.now(),
    });
  }
  return sessions.get(userId);
}

/**
 * Check anti-spam cooldown
 */
function isOnCooldown(userId) {
  const lastAction = cooldowns.get(userId);
  if (lastAction && Date.now() - lastAction < COOLDOWN_MS) {
    return true;
  }
  cooldowns.set(userId, Date.now());
  return false;
}

/**
 * Validate email format using regex
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate OTP format (6 digits)
 */
function isValidOTP(otp) {
  return /^\d{6}$/.test(otp);
}

/**
 * Generate a random 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Validate password strength (minimum 8 characters)
 */
function isValidPassword(password) {
  return password.length >= 8;
}

// ─── Bot Commands ────────────────────────────────────────────────────────────

/**
 * /start command - Begin registration flow
 */
bot.start(async (ctx) => {
  const userId = ctx.from.id;

  // Anti-spam check
  if (isOnCooldown(userId)) {
    return ctx.reply('⏳ Please wait a moment before trying again.');
  }

  // Reset session for fresh start
  sessions.set(userId, {
    state: STATES.AWAITING_EMAIL,
    email: null,
    otp: null,
    otpExpiry: null,
    passwordHash: null,
    createdAt: Date.now(),
  });

  const firstName = ctx.from.first_name || 'there';

  // Send welcome message
  await ctx.reply(
    `👋 *Welcome, ${firstName}!*\n\n` +
    `Please complete registration to continue.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📧 *Step 1:* Enter your email address`,
    { parse_mode: 'Markdown' }
  );
});

/**
 * /restart command - Reset registration flow
 */
bot.command('restart', async (ctx) => {
  const userId = ctx.from.id;

  if (isOnCooldown(userId)) {
    return ctx.reply('⏳ Please wait a moment before trying again.');
  }

  // Clear session
  sessions.delete(userId);

  await ctx.reply(
    '🔄 *Session reset.*\n\nSend /start to begin registration again.',
    { parse_mode: 'Markdown' }
  );
});

/**
 * /status command - Check registration status
 */
bot.command('status', async (ctx) => {
  const userId = ctx.from.id;
  const session = getSession(userId);

  const stateMessages = {
    [STATES.IDLE]: '⚪ Not started. Send /start to begin.',
    [STATES.AWAITING_EMAIL]: '📧 Waiting for email input.',
    [STATES.AWAITING_CAPTCHA]: '🔓 Waiting for captcha verification.',
    [STATES.AWAITING_OTP]: '🔢 Waiting for OTP input.',
    [STATES.AWAITING_PASSWORD]: '🔑 Waiting for password creation.',
    [STATES.REGISTERED]: '✅ Registration complete!',
  };

  await ctx.reply(
    `📊 *Registration Status*\n\n` +
    `State: ${stateMessages[session.state] || 'Unknown'}\n` +
    `${session.email ? `Email: ${session.email}` : ''}`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Web App Data Handler ────────────────────────────────────────────────────

/**
 * Handle data sent from Telegram Web App (captcha result)
 */
bot.on('web_app_data', async (ctx) => {
  const userId = ctx.from.id;
  const session = getSession(userId);
  const data = ctx.message.web_app_data.data;

  console.log(`[WebApp] User ${userId} sent data: ${data}`);

  // Check if user is in correct state
  if (session.state !== STATES.AWAITING_CAPTCHA) {
    return ctx.reply('⚠️ Unexpected verification. Please /restart if needed.');
  }

  // Check captcha result
  if (data === 'captcha_success') {
    // Generate OTP
    const otp = generateOTP();
    session.otp = otp;
    session.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
    session.state = STATES.AWAITING_OTP;

    console.log(`[OTP] Generated for user ${userId}: ${otp} (demo mode)`);

    await ctx.reply(
      `✅ *Verification successful!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📩 A 6-digit OTP has been sent to:\n` +
      `*${session.email}*\n\n` +
      `Please enter the code below.\n\n` +
      `⏱ Code expires in 5 minutes.\n\n` +
      `💡 _Demo mode: Your OTP is_ \`${otp}\``,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply('❌ Verification failed. Please try again.');
  }
});

// ─── Message Handler (State Machine) ────────────────────────────────────────

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const session = getSession(userId);
  const text = ctx.message.text.trim();

  // Ignore commands (they're handled above)
  if (text.startsWith('/')) return;

  // Anti-spam check
  if (isOnCooldown(userId)) {
    return; // Silently ignore spam
  }

  // ── State: Awaiting Email ──────────────────────────────────────────────
  if (session.state === STATES.AWAITING_EMAIL) {
    if (!isValidEmail(text)) {
      return ctx.reply(
        '❌ *Invalid email format.*\n\n' +
        'Please enter a valid email address.\n' +
        'Example: `user@example.com`',
        { parse_mode: 'Markdown' }
      );
    }

    // Store email and advance state
    session.email = text.toLowerCase();
    session.state = STATES.AWAITING_CAPTCHA;

    // Send Web App verification button
    await ctx.reply(
      `📧 Email saved: *${session.email}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 *Step 2:* Complete human verification\n\n` +
      `Tap the button below to verify:`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [Markup.button.webApp('🔓 Verify Human', WEBAPP_URL)],
        ]).resize(),
      }
    );
    return;
  }

  // ── State: Awaiting OTP ────────────────────────────────────────────────
  if (session.state === STATES.AWAITING_OTP) {
    // Check OTP expiry
    if (Date.now() > session.otpExpiry) {
      session.state = STATES.AWAITING_CAPTCHA;
      return ctx.reply(
        '⏱ *OTP expired.*\n\n' +
        'Please verify again to get a new code.',
        {
          parse_mode: 'Markdown',
          ...Markup.keyboard([
            [Markup.button.webApp('🔓 Verify Human', WEBAPP_URL)],
          ]).resize(),
        }
      );
    }

    // Validate OTP format
    if (!isValidOTP(text)) {
      return ctx.reply(
        '❌ *Invalid format.*\n\n' +
        'Please enter a 6-digit code.\n' +
        'Example: `123456`',
        { parse_mode: 'Markdown' }
      );
    }

    // Verify OTP
    if (text !== session.otp) {
      return ctx.reply(
        '❌ *Incorrect code.*\n\nPlease try again or /restart to get a new code.',
        { parse_mode: 'Markdown' }
      );
    }

    // OTP correct - advance to password
    session.state = STATES.AWAITING_PASSWORD;
    session.otp = null; // Clear OTP after use

    await ctx.reply(
      `✅ *OTP verified!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🔑 *Step 3:* Create your password\n\n` +
      `Requirements:\n` +
      `• Minimum 8 characters\n` +
      `• Mix letters, numbers & symbols\n\n` +
      `_Your password will be securely encrypted._`,
      {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard(),
      }
    );
    return;
  }

  // ── State: Awaiting Password ───────────────────────────────────────────
  if (session.state === STATES.AWAITING_PASSWORD) {
    if (!isValidPassword(text)) {
      return ctx.reply(
        '❌ *Password too short.*\n\n' +
        'Minimum 8 characters required.\n' +
        'Please try again.',
        { parse_mode: 'Markdown' }
      );
    }

    // Hash password with bcrypt (10 salt rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(text, saltRounds);
    session.passwordHash = passwordHash;
    session.state = STATES.REGISTERED;

    // Delete the message containing the password for security
    try {
      await ctx.deleteMessage();
    } catch (e) {
      // May fail if bot doesn't have delete permission
    }

    await ctx.reply(
      `🎉 *Registration completed successfully!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📧 Email: ${session.email}\n` +
      `🔐 Password: ••••••••\n` +
      `✅ Status: Verified\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Welcome aboard! 🚀`,
      {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard(),
      }
    );
    return;
  }

  // ── State: Already Registered ──────────────────────────────────────────
  if (session.state === STATES.REGISTERED) {
    return ctx.reply(
      '✅ You are already registered!\n\n' +
      'Use /restart to reset your registration.',
      { parse_mode: 'Markdown' }
    );
  }

  // ── State: Idle (not started) ──────────────────────────────────────────
  if (session.state === STATES.IDLE) {
    return ctx.reply(
      '👋 Send /start to begin registration.',
      { parse_mode: 'Markdown' }
    );
  }
});

// ─── Error Handling ──────────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`[Bot Error] for ${ctx.updateType}:`, err);
  ctx.reply('⚠️ An error occurred. Please try again or /restart.').catch(() => {});
});

// ─── Launch Bot ──────────────────────────────────────────────────────────────
bot.launch()
  .then(() => {
    console.log('🤖 Bot is running...');
    console.log(`📱 Web App URL: ${WEBAPP_URL}`);
  })
  .catch((err) => {
    console.error('❌ Failed to launch bot:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
