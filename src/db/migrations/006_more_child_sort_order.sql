-- 006 季/集/设定图的源顺序
-- 设定图按 createdAt 降序展示，批量生成时时间戳可能相同；
-- 用 sort_order 作为稳定次级顺序，保持与 JSON 插入顺序一致。

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE novel_asset_images ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS seasons_order_idx ON seasons (novel_id, sort_order);
CREATE INDEX IF NOT EXISTS episodes_order_idx ON episodes (novel_id, sort_order);
CREATE INDEX IF NOT EXISTS novel_assets_order_idx ON novel_asset_images (novel_id, sort_order);
