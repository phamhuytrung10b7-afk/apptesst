-- ==============================================================================
-- CƠ SỞ DỮ LIỆU WIP INVENTORY MANAGEMENT (SUPABASE POSTGRESQL COMPLETE SCHEMA)
-- ==============================================================================

-- 1. DANH MỤC LINH KIỆN (parts)
CREATE TABLE IF NOT EXISTS public.parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'Cái',
    level NUMERIC DEFAULT 1,
    skip_laser BOOLEAN DEFAULT false,
    skip_bending BOOLEAN DEFAULT false,
    skip_welding BOOLEAN DEFAULT false,
    skip_painting BOOLEAN DEFAULT false,
    has_painting_po BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TỒN KHO WIP (inventory)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    part_id TEXT NOT NULL,
    original_part_id TEXT,
    stage_id TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'IN',
    quantity NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. NHẬT KÝ QUÉT KHO & GIAO DỊCH (transactions)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    part_id TEXT NOT NULL,
    part_name TEXT,
    original_part_id TEXT,
    quantity NUMERIC DEFAULT 0,
    stage_id TEXT NOT NULL,
    location TEXT,
    timestamp NUMERIC NOT NULL,
    qr_data TEXT,
    source_stage_id TEXT,
    target_stage_id TEXT,
    po_id TEXT,
    plan_id TEXT,
    printed BOOLEAN DEFAULT false,
    defect_reason TEXT,
    defect_category TEXT,
    kpi_recorded BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. NHÃN QR ĐÃ TẠO (labels)
CREATE TABLE IF NOT EXISTS public.labels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    part_id TEXT NOT NULL,
    part_name TEXT,
    original_part_id TEXT,
    quantity NUMERIC DEFAULT 0,
    stage_id TEXT NOT NULL,
    location TEXT,
    timestamp NUMERIC NOT NULL,
    qr_data TEXT,
    source_stage_id TEXT,
    target_stage_id TEXT,
    po_id TEXT,
    plan_id TEXT,
    printed BOOLEAN DEFAULT false,
    defect_reason TEXT,
    defect_category TEXT,
    kpi_recorded BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. LỆNH SẢN XUẤT (production_orders)
CREATE TABLE IF NOT EXISTS public.production_orders (
    id TEXT PRIMARY KEY,
    master_po_id TEXT,
    part_id TEXT NOT NULL,
    stage_id TEXT,
    target_quantity NUMERIC NOT NULL DEFAULT 0,
    produced_quantity NUMERIC DEFAULT 0,
    exported_quantity NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at NUMERIC NOT NULL,
    completed_at NUMERIC,
    planned_start_time NUMERIC,
    lead_time NUMERIC,
    expected_completion_time NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ĐỊNH MỨC BOM V1 (bom_definitions)
CREATE TABLE IF NOT EXISTS public.bom_definitions (
    id TEXT PRIMARY KEY,
    parent_part_id TEXT NOT NULL,
    child_part_id TEXT NOT NULL,
    component_weight NUMERIC DEFAULT 0,
    scrap_weight NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. ĐỊNH MỨC HÀN BOM V2 (bom_v2_definitions)
CREATE TABLE IF NOT EXISTS public.bom_v2_definitions (
    id TEXT PRIMARY KEY,
    result_part_id TEXT NOT NULL,
    ingredient_part_id TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    applicable_model TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. BOM THEO MODEL (model_bom_definitions)
CREATE TABLE IF NOT EXISTS public.model_bom_definitions (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. ĐỊNH MỨC NĂNG SUẤT (productivity_norms)
CREATE TABLE IF NOT EXISTS public.productivity_norms (
    id TEXT PRIMARY KEY,
    part_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    seconds_per_unit NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. ĐỊNH MỨC TỔ HỢP LASER (laser_nesting)
CREATE TABLE IF NOT EXISTS public.laser_nesting (
    id TEXT PRIMARY KEY,
    nesting_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    qty_per_sheet NUMERIC DEFAULT 1,
    seconds_per_unit NUMERIC DEFAULT 0,
    seconds_per_sheet NUMERIC DEFAULT 0,
    applicable_model TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. CẤU HÌNH CA & NHÂN SỰ (shift_configs)
CREATE TABLE IF NOT EXISTS public.shift_configs (
    stage_id TEXT PRIMARY KEY,
    worker_count NUMERIC DEFAULT 1,
    work_on_sunday BOOLEAN DEFAULT false,
    shifts JSONB DEFAULT '[]'::jsonb,
    breaks JSONB DEFAULT '[]'::jsonb,
    worker_overrides JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. QUY TẮC CHUYỂN ĐỔI MÃ (part_transformations)
CREATE TABLE IF NOT EXISTS public.part_transformations (
    id TEXT PRIMARY KEY,
    source_part_id TEXT NOT NULL,
    target_part_id TEXT NOT NULL,
    target_stage_id TEXT NOT NULL,
    applicable_model TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. KẾ HOẠCH DÁN KÍNH (glazing_plans)
CREATE TABLE IF NOT EXISTS public.glazing_plans (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    target_quantity NUMERIC NOT NULL DEFAULT 0,
    target_completion_time NUMERIC NOT NULL DEFAULT 0,
    planned_start_time NUMERIC,
    expected_completion_time NUMERIC,
    created_at NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    produced_quantities JSONB DEFAULT '{}'::jsonb,
    printed_quantities JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. CÀI ĐẶT HỆ THỐNG (system_settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- CẤU HÌNH ROW LEVEL SECURITY (RLS) CHO PHÉP TOÀN QUYỀN TRUY CẬP (ANON ROLE)
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'parts', 'inventory', 'transactions', 'labels', 'production_orders',
        'bom_definitions', 'bom_v2_definitions', 'model_bom_definitions',
        'productivity_norms', 'laser_nesting', 'shift_configs',
        'part_transformations', 'glazing_plans', 'system_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Public access on %s" ON public.%I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Public access on %s" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl, tbl);
        EXECUTE format('CREATE POLICY "Authenticated access on %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl, tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- LÀM MỚI BỘ NHỚ ĐỆM API SCHEMA CỦA SUPABASE
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
