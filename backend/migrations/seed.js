require('dotenv').config();
const { query } = require('../src/config/database');

async function seed() {
  console.log('Seeding database with defaults...');

  for (const accountNumber of [1, 2]) {
    // Settings
    await query(`
      INSERT INTO settings (account_number, rules_text, stream_schedule, sub_message, socials,
        join_messages, auto_translate, filter_links, guide_interval, caps_threshold,
        timeout_duration, slow_mode_secs)
      VALUES ($1,$2,$3,$4,$5,$6,true,true,600,0.7,600,5)
      ON CONFLICT (account_number) DO NOTHING
    `, [
      accountNumber,
      'Stream Rules: 1) Keep language clean 2) No spam or caps 3) No self-promotion 4) English or use translation 5) Have fun!',
      'Check community tab for the latest schedule!',
      'HUGE welcome to @{username} for subscribing! You are officially part of the squad!',
      JSON.stringify({ YouTube:'', Instagram:'', TikTok:'', Discord:'', Twitter:'' }),
      JSON.stringify({
        firstTime:  'Welcome to the stream @{username}! Great to have you here for the first time!',
        returning:  'Welcome back @{username}! The squad gets stronger!',
        subscriber: 'Our subscriber @{username} is in the building!',
        vip:        'VIP @{username} has arrived — show some love!',
        moderator:  'Mod @{username} is in the chat!'
      })
    ]);

    // Default commands
    const commands = [
      ['!socials',  'Follow me everywhere! Check the description for all my links!', 'everyone', 180],
      ['!discord',  'Join our Discord! Link in the description!',                    'everyone',  60],
      ['!gg',       'GG! Thanks for the support — this community is amazing!',       'everyone',  30],
      ['!sub',      'Hit that subscribe button! Link: youtube.com/@PUBGMI',          'everyone', 120],
      ['!schedule', 'Check back soon for the next stream schedule!',                 'everyone',  60],
      ['!ping',     'Bot is online! Type !rank to see your rank!',                   'everyone',  10],
      ['!website',  'Visit the stream schedule at pubgmi.vercel.app/public/schedule','everyone',  60],
    ];
    for (const [name, response, permission, cooldown] of commands) {
      await query(`
        INSERT INTO commands (account_number,name,response,permission,cooldown_seconds)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_number,name) DO NOTHING
      `, [accountNumber, name, response, permission, cooldown]);
    }

    // Keyword rules
    await query(`
      INSERT INTO keyword_rules (account_number, triggers, response, match_type, cooldown_seconds)
      VALUES ($1,$2,$3,'contains',120) ON CONFLICT DO NOTHING
    `, [accountNumber,
        JSON.stringify(['what rank','ur rank','your rank','which rank']),
        'My current rank is shown in the stream title! Type !rank to check YOUR rank!'
    ]);
    await query(`
      INSERT INTO keyword_rules (account_number, triggers, response, match_type, cooldown_seconds)
      VALUES ($1,$2,$3,'contains',180) ON CONFLICT DO NOTHING
    `, [accountNumber,
        JSON.stringify(['what phone','what device','which phone','what mobile']),
        'Check my YouTube description for my full setup details!'
    ]);

    // Reward tiers
    const rewardTiers = [
      [null, 'Gold I',         'tier', 'Personal shoutout on stream'],
      [null, 'Platinum I',     'tier', 'Permanent front-of-queue priority'],
      [null, 'Diamond I',      'tier', 'Featured on stream overlay for a full session'],
      [null, 'Crown I',        'tier', 'Streamer subscribes to your YouTube channel'],
      [null, 'Ace',            'tier', 'Your own named custom command created'],
      [null, 'Ace Master',     'tier', 'Team up on stream together in PUBG Mobile'],
      [null, 'Ace Dominator',  'tier', 'Featured or credited in an uploaded video'],
      [null, 'Conqueror',      'tier', 'Permanent Legend Wall status — forever'],
    ];
    for (const [sp_threshold, trigger_tier, trigger_type, description] of rewardTiers) {
      await query(`
        INSERT INTO reward_tiers (account_number,sp_threshold,trigger_tier,trigger_type,description)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
      `, [accountNumber, sp_threshold, trigger_tier, trigger_type, description]);
    }

    // Shop items
    const shopItems = [
      ['Queue Skip',       'Jump to the front of the squad queue',           500],
      ['Shoutout',         'Get a personal shoutout from the bot in chat',  1000],
      ['VIP for 24hrs',    'Temporary VIP status with 2x SP earning',       2000],
      ['Custom Message',   'Post a custom message through the bot',         1500],
      ['SP Gift Bomb',     'Give 100 SP to 10 random viewers',              3000],
      ['Double XP 30min',  '2x XP earning for yourself for 30 minutes',    2500]
    ];
    for (const [name, description, cost] of shopItems) {
      await query(`
        INSERT INTO shop_items (account_number,name,description,sp_cost)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING
      `, [accountNumber, name, description, cost]);
    }

    // Default season
    await query(`
      INSERT INTO seasons (account_number,name,status,reset_type,ends_at)
      VALUES ($1,'Season 1','active','soft',NOW()+INTERVAL '90 days')
      ON CONFLICT DO NOTHING
    `, [accountNumber]);

    // Timed messages
    await query(`
      INSERT INTO timed_messages (account_number,messages,interval_seconds,active)
      VALUES ($1,$2,600,true) ON CONFLICT (account_number) DO NOTHING
    `, [accountNumber, JSON.stringify([
      'Type !rank to see your PUBG Mobile rank and climb from Bronze to Conqueror!',
      'Want to play with me? Type !join [in-game name] to get in the squad queue!',
      'Type !shop to spend your Stream Points on cool rewards!',
      'Check your daily challenges with !challenges — earn bonus SP and XP!',
      'Type !checkin to claim your daily bonus and keep your streak alive!',
      'Hit that subscribe button if you are enjoying the stream! Type !sub for the link!'
    ])]);

    // Default daily challenges
    const challenges = [
      ['Watch 30 minutes',  'watch_time',    30,  100, 60,  'daily'],
      ['Send 20 messages',  'messages',      20,   50, 30,  'daily'],
      ['Daily check-in',    'checkin',        1,   30, 20,  'daily'],
      ['Watch 3 streams',   'streams',        3,  500,350,  'weekly'],
      ['Send 100 messages', 'messages',     100,  200,150,  'weekly'],
      ['Watch 10 streams',  'streams',       10, 3000,2000, 'monthly'],
    ];
    for (const [title, type, target, sp_reward, xp_reward, chalType] of challenges) {
      await query(`
        INSERT INTO challenges (account_number,title,type,target,sp_reward,xp_reward,active)
        VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING
      `, [accountNumber, title, type, target, sp_reward, xp_reward]);
    }

    // BUG-27 FIXED: Default trivia questions
    const triviaQuestions = [
      ['In PUBG Mobile, how many players does a standard match start with?',  '100',          'PUBG',    'easy'],
      ['What is the name of the first map in PUBG Mobile?',                   'Erangel',      'PUBG',    'easy'],
      ['What does PUBG stand for?',                                           'PlayerUnknown\'s Battlegrounds', 'PUBG', 'medium'],
      ['What is the blue zone in PUBG Mobile called?',                        'play zone',    'PUBG',    'easy'],
      ['How many players are in a full squad in PUBG Mobile?',                '4',            'PUBG',    'easy'],
      ['What is the rarest item in PUBG Mobile crates?',                      'helmet',       'PUBG',    'medium'],
      ['Which vehicle is fastest in PUBG Mobile?',                            'motorcycle',   'PUBG',    'medium'],
      ['What does AWM stand for in PUBG?',                                    'Arctic Warfare Magnum', 'PUBG', 'hard'],
      ['How many zones does the PUBG Mobile play area shrink to?',            '8',            'PUBG',    'hard'],
      ['What is the maximum level of armor in PUBG Mobile?',                  '3',            'PUBG',    'easy'],
    ];
    for (const [question, answer, category, difficulty] of triviaQuestions) {
      await query(`
        INSERT INTO trivia_questions (account_number,question,answer,category,difficulty)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
      `, [accountNumber, question, answer, category, difficulty]);
    }

    // Default stream preset
    await query(`
      INSERT INTO stream_presets (account_number,name,config)
      VALUES ($1,'Ranked Grind',$2) ON CONFLICT DO NOTHING
    `, [accountNumber, JSON.stringify({
      queueOpen: true, slowMode: false, subOnly: false,
      guideInterval: 600, description: 'Default ranked grind stream config'
    })]);

    console.log(`Account ${accountNumber} seeded`);
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
