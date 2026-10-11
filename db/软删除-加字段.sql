-- 回收站（软删除）需要的字段
--
-- 干什么用：给 plan_days 和 checkins 各加一个「已删除」标记。
--   以后点删除只是打标记，数据还在，能从回收站原样拿回来。
--
-- 怎么跑：CloudBase 控制台 → 数据库 → plan_days / checkins 所在库 → SQL 编辑器，
--   整段粘进去执行。可重复执行（IF NOT EXISTS）。
--
-- ⚠️ 不要跑 db/schema.sql：那个脚本是先 DROP 再 CREATE，会把真实数据全部清掉。
--   这次只加字段，不动任何已有数据。

ALTER TABLE plan_days  ADD COLUMN IF NOT EXISTS is_deleted boolean     NOT NULL DEFAULT false;
ALTER TABLE plan_days  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

ALTER TABLE checkins   ADD COLUMN IF NOT EXISTS is_deleted boolean     NOT NULL DEFAULT false;
ALTER TABLE checkins   ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- 跑完验证一下（应该看到 is_deleted 这一列）：
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name IN ('plan_days','checkins') AND column_name = 'is_deleted';
-- 现有数据全部是 false，不影响页面：
--   SELECT count(*) FROM plan_days WHERE is_deleted = false;
