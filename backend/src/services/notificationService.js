// BUG-13 FIXED: SQL template literal paramCount arithmetic corrected
const { query } = require('../config/database');
const logger = require('../utils/logger');

const NOTIFICATION_ICONS = {
  stream_live:'radio', stream_ended:'stop-circle', new_subscriber:'user-plus',
  super_chat:'dollar-sign', rank_up:'trending-up', reward_unlocked:'gift',
  user_auto_banned:'shield-off', user_warned:'alert-triangle', milestone:'award',
  raid_detected:'alert-octagon', api_quota_warning:'activity', bot_restart:'refresh-cw',
  new_video:'play-circle', shop_redemption:'shopping-bag', giveaway_winner:'trophy',
  clip_marked:'scissors', hype_train:'zap', new_member:'user-check'
};

async function createNotification(accountNumber, category, type, data = {}) {
  try {
    const icon    = NOTIFICATION_ICONS[type] || 'bell';
    const title   = generateTitle(type, data);
    const message = generateMessage(type, data);
    const { rows } = await query(`
      INSERT INTO notifications (account_number, category, type, icon, title, message, data, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id
    `, [accountNumber, category, type, icon, title, message, JSON.stringify(data)]);
    return rows[0]?.id;
  } catch (err) { logger.error('createNotification error:', err.message); }
}

function generateTitle(type, data) {
  const map = {
    stream_live:`Stream went live`, stream_ended:`Stream ended`,
    new_subscriber:`New subscriber — ${data.username||''}`,
    super_chat:`Super Chat — ${data.amount||''}`,
    rank_up:`${data.username||''} ranked up`,
    reward_unlocked:`Reward unlocked — ${data.username||''}`,
    user_auto_banned:`User auto-banned — ${data.username||''}`,
    user_warned:`User warned — ${data.username||''}`,
    milestone:`Milestone reached`, raid_detected:'Raid attack detected',
    api_quota_warning:'API quota warning', bot_restart:'Bot restarted',
    new_video:`New video uploaded`, shop_redemption:`${data.username||''} redeemed ${data.item||''}`,
    giveaway_winner:`Giveaway winner — ${data.winner||''}`,
    clip_marked:'Moment marked', hype_train:'Hype train triggered',
    new_member:`New member — ${data.username||''}`
  };
  return map[type] || 'Notification';
}

function generateMessage(type, data) {
  const map = {
    stream_live:`"${data.title||''}" is now live`,
    stream_ended:`Lasted ${data.recap?.duration||''}. ${data.recap?.newSubscribers||0} new subs.`,
    new_subscriber:`${data.username} just subscribed`,
    super_chat:`${data.username} sent ${data.amount}${data.message?`: "${data.message}"`:''}`,
    rank_up:`${data.username} promoted from ${data.oldRank} to ${data.newRank}`,
    reward_unlocked:`${data.username} unlocked: ${data.reward}`,
    user_auto_banned:`${data.username} was banned — ${data.reason}`,
    user_warned:`${data.username} received a warning`,
    milestone:`${data.milestone} reached`,
    raid_detected:`${data.count||'Multiple'} suspicious accounts detected`,
    api_quota_warning:`YouTube API quota at ${data.percent||''}%`,
    bot_restart:`Bot restarted after ${data.reason||'unexpected shutdown'}`,
    new_video:`"${data.title||''}" was published`,
    shop_redemption:`${data.item} redeemed for ${data.cost} SP`,
    giveaway_winner:`${data.winner} won from ${data.entries||0} entries`,
    clip_marked:`Moment marked at ${data.timestamp||''}`,
    hype_train:`Triggered by ${data.triggerType} spike`,
    new_member:`${data.username} joined as a channel member`
  };
  return map[type] || JSON.stringify(data);
}

// BUG-13 FIXED: Use string concatenation for dynamic param numbers, not template expressions
async function getNotifications(accountNumber, { category, unreadOnly, limit=50, offset=0 }={}) {
  const params = [accountNumber];
  const conditions = ['account_number = $1'];

  if (category && category !== 'all') {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (unreadOnly) conditions.push('read_at IS NULL');

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const where = conditions.join(' AND ');
  const sql = `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`;

  const { rows } = await query(sql, params);
  return rows;
}

async function markAllRead(accountNumber) {
  await query(`UPDATE notifications SET read_at=NOW() WHERE account_number=$1 AND read_at IS NULL`, [accountNumber]);
}

async function getUnreadCount(accountNumber) {
  const { rows } = await query(`SELECT COUNT(*) as cnt FROM notifications WHERE account_number=$1 AND read_at IS NULL`, [accountNumber]);
  return parseInt(rows[0]?.cnt || 0);
}

module.exports = { createNotification, getNotifications, markAllRead, getUnreadCount };
