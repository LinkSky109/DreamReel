-- 007 sort_order 使用 bigint
-- 写镜像用毫秒时间戳作为新增行的排序值，integer 会溢出。

ALTER TABLE novel_chunks ALTER COLUMN sort_order TYPE bigint;
ALTER TABLE novel_characters ALTER COLUMN sort_order TYPE bigint;
ALTER TABLE novel_world_entities ALTER COLUMN sort_order TYPE bigint;
ALTER TABLE seasons ALTER COLUMN sort_order TYPE bigint;
ALTER TABLE episodes ALTER COLUMN sort_order TYPE bigint;
ALTER TABLE novel_asset_images ALTER COLUMN sort_order TYPE bigint;
