// BUG-07/21 FIXED: Full streak tracking service
const { query } = require('../config/database');
const { getRedis } = require('../config/redis');
const { awardSP, awardXP } = require('./spService');
const logger = require('../utils/logger');

const STREAK_MULTIPLIERS = [
  { streams: 3,  multiplier: 1.25 },
  { streams: 5,  multiplier: 1.5  },
  { streams: 10, multiplier: 2.0  },
  { streams: 20, multiplier: 3.0  }
];

function getMultiplierForStreak(streakCount) {
  let multiplier = 1.0;
  for (const tier of STREAK_MULTIPLIERS) {
    if (streakCount >= tier.streams) multiplier = tier.multiplier;
  }
  return multiplier;
}

async function recordStreamAttendance(accountNumber, userId, username) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await query(`
      SELECT current_streak, best_streak, last_stream_date
      FROM viewer_streaks WHERE account_number=$1 AND user_id=$2
    `, [accountNumber, userId]);

    let currentStreak = 1;
    let bestStreak    = 1;
    const lastDate    = rows[0]?.last_stream_date;

    if (rows.length && lastDate) {
      const last     = new Date(lastDate);
      const now      = new Date(today);
      const diffDays = Math.floor((now - last) / 86400000);

      if (diffDays === 0) return; // already recorded today
      if (diffDays === 1) {
        currentStreak = parseInt(rows[0].current_streak) + 1;
        bestStreak    = Math.max(parseInt(rows[0].best_streak), currentStreak);
      } else {
        // streak broken
        currentStreak = 1;
        bestStreak    = parseInt(rows[0].best_streak) || 1;
      }
    }

    const multiplier = getMultiplierForStreak(currentStreak);

    await query(`
      INSERT INTO viewer_streaks (account_number, user_id, current_streak, best_streak, multiplier, last_stream_date)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (account_number, user_id)
      DO UPDATE SET current_streak=$3, best_streak=$4, multiplier=$5, last_stream_date=$6
    `, [accountNumber, userId, currentStreak, bestStreak, multiplier, today]);

    // Award bonus SP for streak milestones
    const milestones = { 3:200, 5:350, 10:700, 20:1500, 30:2500 };
    if (milestones[currentStreak]) {
      await awardSP(accountNumber, userId, milestones[currentStreak], `streak_${currentStreak}`);
      await awardXP(accountNumber, userId, Math.floor(milestones[currentStreak] * 0.7), `streak_${currentStreak}`);
    }

    // Bonus for watch time milestones during this stream
    const streams = await query(`SELECT COUNT(*) as cnt FROM viewer_streaks WHERE account_number=$1 AND user_id=$2`, [accountNumber, userId]);

    logger.info(`Streak recorded: account ${accountNumber} user ${userId} streak=${currentStreak}`);
    return { currentStreak, bestStreak, multiplier };
  } catch (err) {
    logger.error('recordStreamAttendance error:', err.message);
    return null;
  }
}

async function getViewerStreak(accountNumber, userId) {
  const { rows } = await query(`
    SELECT current_streak, best_streak, multiplier, last_stream_date
    FROM viewer_streaks WHERE account_number=$1 AND user_id=$2
  `, [accountNumber, userId]);
  return rows[0] || { current_streak: 0, best_streak: 0, multiplier: 1.0 };
}

async function updateCheckinStreak(accountNumber, userId) {
  // Called from daily checkin — updates streak as if they attended
  await recordStreamAttendance(accountNumber, userId, null);
}

module.exports = { recordStreamAttendance, getViewerStreak, updateCheckinStreak, getMultiplierForStreak };
