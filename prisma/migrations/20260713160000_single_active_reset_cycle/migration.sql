DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "reset_cycles"
        WHERE "status" = 'ACTIVE'
        GROUP BY "user_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce one active Reset Cycle per user: duplicate active cycles exist';
    END IF;
END
$$;

CREATE UNIQUE INDEX "reset_cycles_one_active_per_user_key"
ON "reset_cycles"("user_id")
WHERE "status" = 'ACTIVE';
