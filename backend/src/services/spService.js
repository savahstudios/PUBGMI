// spService.js — v1.1.0
// BUG-59 FIXED: Conqueror limited to top 10 viewers
const { query }  = require('../config/database');
const { getRedis } = require('../config/redis');
const { createNotification } = require('./notificationService');
const logger = require('../utils/logger');

const CONQUEROR_SLOTS = 10; // BUG-59: Only top 10 hold Conqueror

const RANK_TIERS = [
  { tier: 'Bronze',        divisions: ['V','IV','III','II','I'], xpPerDiv: 200,   baseXP: 0       },
  { tier: 'Silver',        divisions: ['V','IV','III','II','I'], xpPerDiv: 800,   baseXP: 1000    },
  { tier: 'Gold',          divisions: ['V','IV','III','II','I'], xpPerDiv: 2000,  baseXP: 5000    },
  { tier: 'Platinum',      divisions: ['V','IV','III','II','I'], xpPerDiv: 4000,  baseXP: 15000   },
  { tier: 'Diamond',       divisions: ['V','IV','III','II','I'], xpPerDiv: 8000,  baseXP: 35000   },
  { tier: 'Crown',         divisions: ['V','IV','III','II','I'], xpPerDiv: 15000, baseXP: 75000   },
  { tier: 'Ace',           divisions: [''],                      xpPerDiv: 50000, baseXP: 150000  },
  { tier: 'Ace Master',    divisions: [''],                      xpPerDiv: 70000, baseXP: 200000  },
  { tier: 'Ace Dominator', divisions: [''],                      xpPerDiv: 100000,baseXP: 270000  },
  { tier: 'Conqueror',     divisions: [''],                      xpPerDiv: 0,     baseXP: 370000  }
];

function calculateRankBase(totalXP) {
  let currentTier = RANK_TIERS[0];
  let currentDiv  = 'V';

  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    const tier = RANK_TIERS[i];
    if (totalXP >= tier.baseXP) {
      currentTier = tier;
      if (tier.divisions.length === 1) {
        currentDiv = tier.divisions[0];
      } else {
        const xpInTier = totalXP - tier.baseXP;
        const divIdx   = Math.min(Math.floor(xpInTier / tier.xpPerDiv), tier.divisions.length - 1);
        currentDiv     = tier.divisions[divIdx];
      }
      break;
    }
  }

  const nextInfo = getNextRankInfo(totalXP);
  return {
    tier:        currentTier.tier,
    division:    currentDiv,
    displayRank: currentDiv ? `${currentTier.tier} ${currentDiv}`.trim() : currentTier.tier,
    nextRankXP:  nextInfo?.xpNeeded  || 0,
    nextRank:    nextInfo?.displayRank || 'Max Rank'
  };
}

function getNextRankInfo(totalXP) {
  for (const tier of RANK_TIERS) {
    if (tier.divisions.length > 1) {
      for (let d = 0; d < tier.divisions.length; d++) {
        const divXP = tier.baseXP + (d * tier.xpPerDiv);
        if (totalXP < divXP) return { displayRank: `${tier.tier} ${tier.divisions[d]}`, xpNeeded: divXP - totalXP };
      }
    } else if (totalXP < tier.baseXP) {
      return { displayRank: tier.tier, xpNeeded: tier.baseXP - totalXP };
    }
  }
  return null;
}

// BUG-59 FIXED: Check if viewer qualifies for Conqueror (top 10 by XP)
async function resolveConquerorEligibility(accountNumber, userId, totalXP) {
  // Only check if they have enough base XP for Conqueror
  if (totalXP < 370000) return false;

  const { rows } = await query(`
    SELECT COUNT(*) as cnt FROM viewer_ranks
    WHERE account_number=$1 AND total_xp > $2 AND user_id != $3
  `, [accountNumber, totalXP, userId]);

  const higherCount = parseInt(rows[0]?.cnt || 0);
  return higherCount < CONQUEROR_SLOTS;
}

async function calculateRank(accountNumber, userId, totalXP) {
  const base = calculateRankBase(totalXP);

  // BUG-59 FIXED: Override to Conqueror only if in top 10
  if (base.tier === 'Conqueror') {
    const eligible = await resolveConquerorEligibility(accountNumber, userId, totalXP);
    if (!eligible) {
      // Demote to Ace Dominator if not in top 10
      return {
        tier: 'Ace Dominator', division: '',
        displayRank: 'Ace Dominator',
        nextRankXP: 0, nextRank: 'Conqueror (Top 10 only)'
      };
    }
  }
  return base;
}

async function getMultiplier(accountNumber, userId) {
  const redis = getRedis();
  let multiplier = 1.0;

  // Subscriber bonus
  const { rows: subRows } = await query(
    `SELECT id FROM subscribers WHERE account_number=$1 AND user_id=$2`, [accountNumber, userId]
  );
  if (subRows.length) multiplier *= 1.5;

  // VIP bonus
  const { rows: vipRows } = await query(
    `SELECT id FROM viewers WHERE account_number=$1 AND user_id=$2 AND is_vip=true`, [accountNumber, userId]
  );
  if (vipRows.length) multiplier *= 2.0;

  // Streak multiplier
  const { rows: streakRows } = await query(
    `SELECT multiplier FROM viewer_streaks WHERE account_number=$1 AND user_id=$2`, [accountNumber, userId]
  );
  if (streakRows.length) multiplier *= parseFloat(streakRows[0].multiplier || 1.0);

  // Event multiplier
  try {
    const raw = await redis.get(`multiplier_event:${accountNumber}`);
    if (raw) multiplier *= JSON.parse(raw).multiplier;
  } catch(_) {}

  return multiplier;
}

async function awardSP(accountNumber, userId, amount, source) {
  try {
    const multiplier  = await getMultiplier(accountNumber, userId);
    const finalAmount = Math.max(1, Math.floor(amount * multiplier));

    await query(`
      INSERT INTO viewer_ranks (account_number,user_id,sp,total_xp,tier,division)
      VALUES ($1,$2,$3,0,'Bronze','V')
      ON CONFLICT (account_number,user_id) DO UPDATE SET sp=viewer_ranks.sp+$3
    `, [accountNumber, userId, finalAmount]);

    await query(`
      INSERT INTO sp_transactions (account_number,user_id,amount,type,source,created_at)
      VALUES ($1,$2,$3,'earn',$4,NOW())
    `, [accountNumber, userId, finalAmount, source]);

    await checkSPRewards(accountNumber, userId);
  } catch (err) { logger.error('awardSP error:', err.message); }
}

async function awardXP(accountNumber, userId, amount, source) {
  try {
    const { rows: before } = await query(
      `SELECT total_xp,tier,division FROM viewer_ranks WHERE account_number=$1 AND user_id=$2`,
      [accountNumber, userId]
    );

    const oldXP  = parseInt(before[0]?.total_xp || 0);
    const newXP  = oldXP + amount;
    const oldRank = before[0] ? calculateRankBase(oldXP) : null;
    // BUG-59 FIXED: Use async calculateRank for Conqueror check
    const newRank = await calculateRank(accountNumber, userId, newXP);

    await query(`
      INSERT INTO viewer_ranks (account_number,user_id,sp,total_xp,tier,division)
      VALUES ($1,$2,0,$3,$4,$5)
      ON CONFLICT (account_number,user_id) DO UPDATE SET total_xp=$3,tier=$4,division=$5
    `, [accountNumber, userId, newXP, newRank.tier, newRank.division]);

    await query(`
      INSERT INTO xp_transactions (account_number,user_id,amount,source,created_at)
      VALUES ($1,$2,$3,$4,NOW())
    `, [accountNumber, userId, amount, source]);

    if (oldRank && (oldRank.tier !== newRank.tier || oldRank.division !== newRank.division)) {
      await handleRankUp(accountNumber, userId, oldRank, newRank);
    }

    await updateSeasonRank(accountNumber, userId, newXP);
  } catch (err) { logger.error('awardXP error:', err.message); }
}

async function handleRankUp(accountNumber, userId, oldRank, newRank) {
  const { rows } = await query(`SELECT username FROM viewers WHERE account_number=$1 AND user_id=$2`, [accountNumber, userId]);
  const username  = rows[0]?.username || 'Someone';
  const isTierUp  = oldRank.tier !== newRank.tier;
  await awardSP(accountNumber, userId, isTierUp ? 500 : 50, 'rank_up_bonus');
  await createNotification(accountNumber, 'community', 'rank_up', {
    username, oldRank: oldRank.displayRank, newRank: newRank.displayRank, isTierUp
  });
  if (isTierUp) await checkTierRewards(accountNumber, userId, username, newRank.tier);
}

async function checkTierRewards(accountNumber, userId, username, newTier) {
  const { rows } = await query(
    `SELECT * FROM reward_tiers WHERE account_number=$1 AND trigger_tier=$2`, [accountNumber, newTier]
  );
  for (const reward of rows) {
    try {
      await query(`
        INSERT INTO reward_deliveries (account_number,user_id,tier_id,status,unlocked_at)
        VALUES ($1,$2,$3,'pending',NOW()) ON CONFLICT (tier_id,user_id) DO NOTHING
      `, [accountNumber, userId, reward.id]);
      await createNotification(accountNumber, 'community', 'reward_unlocked', {
        username, reward: reward.description, tier: newTier
      });
    } catch (err) { logger.error('checkTierRewards error:', err.message); }
  }
}

async function checkSPRewards(accountNumber, userId) {
  const { rows: rankRows } = await query(`SELECT sp FROM viewer_ranks WHERE account_number=$1 AND user_id=$2`, [accountNumber, userId]);
  const currentSP = parseInt(rankRows[0]?.sp || 0);

  const { rows: rewards } = await query(`
    SELECT rt.* FROM reward_tiers rt
    LEFT JOIN reward_deliveries rd ON rd.tier_id=rt.id AND rd.user_id=$2
    WHERE rt.account_number=$1 AND rt.sp_threshold<=$3 AND rt.trigger_type='sp' AND rd.id IS NULL
  `, [accountNumber, userId, currentSP]);

  for (const reward of rewards) {
    const { rows: vRows } = await query(`SELECT username FROM viewers WHERE account_number=$1 AND user_id=$2`, [accountNumber, userId]);
    try {
      await query(`
        INSERT INTO reward_deliveries (account_number,user_id,tier_id,status,unlocked_at)
        VALUES ($1,$2,$3,'pending',NOW()) ON CONFLICT (tier_id,user_id) DO NOTHING
      `, [accountNumber, userId, reward.id]);
      await createNotification(accountNumber, 'community', 'reward_unlocked', {
        username: vRows[0]?.username, reward: reward.description, sp: currentSP
      });
    } catch (err) { logger.error('checkSPRewards error:', err.message); }
  }
}

async function updateSeasonRank(accountNumber, userId, newXP) {
  const { rows } = await query(`SELECT id FROM seasons WHERE account_number=$1 AND status='active'`, [accountNumber]);
  if (!rows.length) return;
  await query(`
    INSERT INTO season_rankings (season_id,account_number,user_id,xp)
    VALUES ($1,$2,$3,$4) ON CONFLICT (season_id,user_id) DO UPDATE SET xp=$4
  `, [rows[0].id, accountNumber, userId, newXP]);
}

async function getViewerRank(accountNumber, userId) {
  const { rows } = await query(`
    SELECT vr.sp,vr.total_xp,vr.tier,vr.division,v.username,v.channel_url
    FROM viewer_ranks vr
    LEFT JOIN viewers v ON v.account_number=vr.account_number AND v.user_id=vr.user_id
    WHERE vr.account_number=$1 AND vr.user_id=$2
  `, [accountNumber, userId]);
  if (!rows.length) return null;

  const row      = rows[0];
  const totalXP  = parseInt(row.total_xp);
  const rankInfo = await calculateRank(accountNumber, userId, totalXP);

  const { rows: posRows } = await query(
    `SELECT COUNT(*)+1 as position FROM viewer_ranks WHERE account_number=$1 AND total_xp>$2`,
    [accountNumber, totalXP]
  );

  return {
    sp: parseInt(row.sp), xp: totalXP,
    tier: rankInfo.tier, division: rankInfo.division,
    displayRank: rankInfo.displayRank,
    nextRank: rankInfo.nextRank, nextRankXP: rankInfo.nextRankXP,
    username: row.username,
    leaderboardPosition: parseInt(posRows[0]?.position || 1)
  };
}

async function awardWatchTimeXP(accountNumber) {
  const redis  = getRedis();
  const isLive = await redis.get(`account:${accountNumber}:live`) === 'true';
  if (!isLive) return;
  const streamDbId = await redis.get(`account:${accountNumber}:stream_db_id`);
  if (!streamDbId) return;

  const { rows } = await query(`
    SELECT DISTINCT author_id, author_name FROM chat_messages
    WHERE stream_id=$1 AND sent_at>=NOW()-INTERVAL '10 minutes'
  `, [streamDbId]);

  for (const viewer of rows) {
    await awardSP(accountNumber, viewer.author_id, 2, 'watch_time');
    await awardXP(accountNumber, viewer.author_id, 1, 'watch_time');
    await query(`
      UPDATE viewers SET total_watch_minutes=total_watch_minutes+1
      WHERE account_number=$1 AND user_id=$2
    `, [accountNumber, viewer.author_id]);
  }
}

module.exports = { awardSP, awardXP, getViewerRank, calculateRank, awardWatchTimeXP, RANK_TIERS };
