-- 锚点 · 建表脚本（Day 16）
-- 从 docs/api-contract.md 推导，不另造一套字段。
-- 数据库：CloudBase PostgreSQL
-- 说明：可重复执行（每次都先 DROP 再 CREATE）。

DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS plan_days;
DROP TABLE IF EXISTS goals;

-- 目标：全局唯一，只保留当前那一条
CREATE TABLE goals (
  id          serial      PRIMARY KEY,
  content     text        NOT NULL,
  created_at  date        NOT NULL DEFAULT CURRENT_DATE
);

-- 每日计划：一天的早晚两条锚点，date 做主键（天然唯一，不会同一天插两遍）
CREATE TABLE plan_days (
  date            date        PRIMARY KEY,
  morning_anchor  text,
  morning_done    boolean     NOT NULL DEFAULT false,
  evening_anchor  text,
  evening_done    boolean     NOT NULL DEFAULT false,
  review          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 每日体检：一天一条，用 date 关联 plan_days
CREATE TABLE checkins (
  date        date        PRIMARY KEY REFERENCES plan_days(date) ON DELETE CASCADE,
  sleep       smallint    NOT NULL CHECK (sleep   BETWEEN 1 AND 5),
  energy      smallint    NOT NULL CHECK (energy  BETWEEN 1 AND 5),
  mood        smallint    NOT NULL CHECK (mood    BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 备注（为什么这么选类型）
-- date 用专门的 date 类型：只要年月日，不要时间，避免时区麻烦
-- 三项体检用 smallint 加 CHECK：取值只可能是 1 到 5，写错直接被数据库挡住
-- done 用 boolean 加 NOT NULL：没有"没填"这种中间状态
-- timestamptz：带时区，控制台显示的时间和北京时间一致
-- plan_days 与 checkins 靠 date 关联：同一天，一边一条计划，一边一条体检
