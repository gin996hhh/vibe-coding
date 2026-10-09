-- 锚点 · Day 21 自检：种子脚本「可重复执行」验证（影子表版）
-- 生成时间：2026-10-09

-- 为什么不直接跑真的 db/seed.sql：
--   第 20 天上线之后，课程明令禁止再执行 seed.sql，因为它第一步就是 DROP TABLE，
--   会把线上的真实数据清掉。（具体见 seed.sql 顶部第 3 行的说明。）
-- 所以这里用影子表 _v_plan_days / _v_checkins / _v_goals，
--   把 seed.sql 的「DROP → CREATE → INSERT」整套动作原样跑两轮。
--   两轮跑完行数应当完全一样 = 脚本可重复执行的证据。
-- 全程不碰真实的 plan_days / checkins / goals，跑完自动清理。

-- ============ 第 1 轮（等价于 seed.sql 跑第 1 遍）============

DROP TABLE IF EXISTS _v_checkins;
DROP TABLE IF EXISTS _v_plan_days;
DROP TABLE IF EXISTS _v_goals;

CREATE TABLE _v_goals (
  id          serial      PRIMARY KEY,
  content     text        NOT NULL,
  created_at  date        NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE _v_plan_days (
  date            date        PRIMARY KEY,
  morning_anchor  text,
  morning_done    boolean     NOT NULL DEFAULT false,
  evening_anchor  text,
  evening_done    boolean     NOT NULL DEFAULT false,
  review          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE _v_checkins (
  date        date        PRIMARY KEY REFERENCES _v_plan_days(date) ON DELETE CASCADE,
  sleep       smallint    NOT NULL CHECK (sleep  BETWEEN 1 AND 5),
  energy      smallint    NOT NULL CHECK (energy BETWEEN 1 AND 5),
  mood        smallint    NOT NULL CHECK (mood   BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO _v_goals (content, created_at) VALUES
  ('半年内英文口语能上台', '2026-09-28'),
  ('一周内每天 23 点前睡', '2026-09-20'),
  ('每天读 10 页书',       '2026-09-15'),
  ('连续 7 天写复盘',      '2026-09-10'),
  ('把锚点做到能给别人用', '2026-09-05');

INSERT INTO _v_plan_days (date, morning_anchor, morning_done, evening_anchor, evening_done, review) VALUES
  ('2026-09-28', '朗读 10 分钟',             true,  '复盘三行',             false, '开口的时候卡在第一个词，明天先把第一句练熟'),
  ('2026-09-29', '多喝温水',                 true,  '拉伸 5 分钟',          true,  null),
  ('2026-09-30', '早饭前写下今天唯一一件事', false, '今晚写一句做到了什么', false, '找"今天"那一栏时停了一下，标识不够明显'),
  ('2026-10-01', '朗读 10 分钟',             true,  '复盘三行',             true,  '状态不错，多走了一站路'),
  ('2026-10-02', '早饭前写下今天唯一一件事', false, '今晚写一句做到了什么', false, null),
  ('2026-10-03', '多喝温水',                 false, '拉伸 5 分钟',          false, null);

INSERT INTO _v_checkins (date, sleep, energy, mood) VALUES
  ('2026-09-28', 3, 3, 3),
  ('2026-09-29', 4, 4, 4),
  ('2026-09-30', 2, 2, 3),
  ('2026-10-01', 5, 4, 4),
  ('2026-10-02', 3, 4, 3),
  ('2026-10-03', 3, 3, 3);

-- ============ 第 2 轮（等价于 seed.sql 跑第 2 遍）============

DROP TABLE IF EXISTS _v_checkins;
DROP TABLE IF EXISTS _v_plan_days;
DROP TABLE IF EXISTS _v_goals;

CREATE TABLE _v_goals (
  id          serial      PRIMARY KEY,
  content     text        NOT NULL,
  created_at  date        NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE _v_plan_days (
  date            date        PRIMARY KEY,
  morning_anchor  text,
  morning_done    boolean     NOT NULL DEFAULT false,
  evening_anchor  text,
  evening_done    boolean     NOT NULL DEFAULT false,
  review          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE _v_checkins (
  date        date        PRIMARY KEY REFERENCES _v_plan_days(date) ON DELETE CASCADE,
  sleep       smallint    NOT NULL CHECK (sleep  BETWEEN 1 AND 5),
  energy      smallint    NOT NULL CHECK (energy BETWEEN 1 AND 5),
  mood        smallint    NOT NULL CHECK (mood   BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO _v_goals (content, created_at) VALUES
  ('半年内英文口语能上台', '2026-09-28'),
  ('一周内每天 23 点前睡', '2026-09-20'),
  ('每天读 10 页书',       '2026-09-15'),
  ('连续 7 天写复盘',      '2026-09-10'),
  ('把锚点做到能给别人用', '2026-09-05');

INSERT INTO _v_plan_days (date, morning_anchor, morning_done, evening_anchor, evening_done, review) VALUES
  ('2026-09-28', '朗读 10 分钟',             true,  '复盘三行',             false, '开口的时候卡在第一个词，明天先把第一句练熟'),
  ('2026-09-29', '多喝温水',                 true,  '拉伸 5 分钟',          true,  null),
  ('2026-09-30', '早饭前写下今天唯一一件事', false, '今晚写一句做到了什么', false, '找"今天"那一栏时停了一下，标识不够明显'),
  ('2026-10-01', '朗读 10 分钟',             true,  '复盘三行',             true,  '状态不错，多走了一站路'),
  ('2026-10-02', '早饭前写下今天唯一一件事', false, '今晚写一句做到了什么', false, null),
  ('2026-10-03', '多喝温水',                 false, '拉伸 5 分钟',          false, null);

INSERT INTO _v_checkins (date, sleep, energy, mood) VALUES
  ('2026-09-28', 3, 3, 3),
  ('2026-09-29', 4, 4, 4),
  ('2026-09-30', 2, 2, 3),
  ('2026-10-01', 5, 4, 4),
  ('2026-10-02', 3, 4, 3),
  ('2026-10-03', 3, 3, 3);

-- ============ 证据 1：两轮之后的行数（截图这里）============
-- 期望：goals 5 / plan_days 6 / checkins 6
-- 如果是 10 / 12 / 12，说明脚本重复了数据，不可重复执行。

SELECT 'goals'     AS 表名, count(*) AS 行数 FROM _v_goals
UNION ALL SELECT 'plan_days', count(*) FROM _v_plan_days
UNION ALL SELECT 'checkins',  count(*) FROM _v_checkins;

-- ============ 证据 2：日期没有重复（截图这里）============
-- 期望：6 行，日期各不相同，从 2026-09-28 到 2026-10-03

SELECT date, sleep, energy, mood FROM _v_checkins ORDER BY date;

-- ============ 清理（跑完影子表就没了）============

DROP TABLE IF EXISTS _v_checkins;
DROP TABLE IF EXISTS _v_plan_days;
DROP TABLE IF EXISTS _v_goals;
