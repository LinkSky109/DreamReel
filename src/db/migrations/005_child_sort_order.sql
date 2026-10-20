-- 005 子集合源顺序
-- 迁移需要保持 JSON 对象插入顺序（角色/实体列表对顺序敏感），
-- created_at 可能存在相同时间戳，无法作为稳定排序依据。

ALTER TABLE novel_chunks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE novel_characters ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE novel_world_entities ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS novel_chunks_order_idx ON novel_chunks (novel_id, sort_order);
CREATE INDEX IF NOT EXISTS novel_characters_order_idx ON novel_characters (novel_id, sort_order);
CREATE INDEX IF NOT EXISTS novel_entities_order_idx ON novel_world_entities (novel_id, sort_order);
