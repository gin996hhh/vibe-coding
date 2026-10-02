-- 锚点 · 种子脚本（Day 16）
-- 可重复执行：先 DROP 再 CREATE 再 INSERT，跑第二遍也不报错。
-- 只在开发阶段用。第 20 天上线之后禁止再执行，否则会清空真实数据。

DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS plan_days;
DROP TABLE IF EXISTS goals;

CREATE TABLE goals (
  id          serial      PRIMARY KEY,
  content     text        NOT NULL,
  created_at  date        NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE plan_days (
  date            date        PRIMARY KEY,
  morning_anchor  text,
  morning_done    boolean     NOT NULL DEFAULT false,
  evening_anchor  text,
  evening_done    boolean     NOT NULL DEFAULT false,
  review          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checkins (
  date        date        PRIMARY KEY REFERENCES plan_days(date) ON DELETE CASCADE,
  sleep       smallint    NOT NULL CHECK (sleep   BETWEEN 1 AND 5),
  energy      smallint    NOT NULL CHECK (energy  BETWEEN 1 AND 5),
  mood        smallint    NOT NULL CHECK (mood    BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 目标：5 条（最新一条是"当前目标"，前面的是改过目标的历史记录）
INSERT INTO goals (content, created_at) VALUES
  ('半年内英文口语能上台', '2026-09-28'),
  ('一周内每天 23 点前睡', '2026-09-20'),
  ('每天读 10 页书',       '2026-09-15'),
  ('连续 7 天写复盘',      '2026-09-10'),
  ('把锚点做到能给别人用', '2026-09-05');

-- 每日计划：6 天（满足"至少 5 行"）
INSERT INTO plan_days (date, morning_anchor, morning_done, evening_anchor, evening_done, review) VALUES
  ('2026-09-28', '朗读 10 分钟',                 true,  '复盘三行',               false, '开口的时候卡在第一个词，明天先把第一句练熟'),
  ('2026-09-29', '多喝温水',                     true,  '拉伸 5 分钟',            true,  null),
  ('2026-09-30', '早饭前写下今天唯一一件事',     false, '今晚写一句做到了什么',   false, '找"今天"那一栏时停了一下，标识不够明显'),
  ('2026-10-01', '朗读 10 分钟',                 true,  '复盘三行',               true,  '状态不错，多走了一站路'),
  ('2026-10-02', '早饭前写下今天唯一一件事',     false, '今晚写一句做到了什么',   false, null),
  ('2026-10-03', '多喝温水',                     false, '拉伸 5 分钟',            false, null);

-- 每日体检：6 天，与上面一一对应
INSERT INTO checkins (date, sleep, energy, mood) VALUES
  ('2026-09-28', 3, 3, 3),
  ('2026-09-29', 4, 4, 4),
  ('2026-09-30', 2, 2, 3),
  ('2026-10-01', 5, 4, 4),
  ('2026-10-02', 3, 4, 3),
  ('2026-10-03', 3, 3, 3);

-- 验证（控制台执行完，再跑这几条看行数）
-- SELECT count(*) FROM goals;       -- 期望 5
-- SELECT count(*) FROM plan_days;   -- 期望 6
-- SELECT count(*) FROM checkins;    -- 期望 6
-- SELECT * FROM plan_days ORDER BY date;
-- SELECT * FROM checkins ORDER BY date;
