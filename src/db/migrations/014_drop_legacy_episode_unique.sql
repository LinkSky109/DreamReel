-- 014 删除 episodes 旧 (novel_id, season_id, episode_no) 唯一约束。
-- 新模型以 (novel_id, logical_key) 部分唯一索引（012）为业务键；
-- 旧约束会阻止同一季内重排/重编号集号（episode_no 互换）。
ALTER TABLE episodes DROP CONSTRAINT IF EXISTS episodes_novel_id_season_id_episode_no_key;
