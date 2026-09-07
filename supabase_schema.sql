-- ==============================================================================
-- SUPABASE DATABASE SCHEMA CHO HỆ THỐNG QUẢN LÝ SẢN XUẤT & TỒN KHO WIP
-- ==============================================================================
-- Hướng dẫn: Mở Supabase Dashboard -> SQL Editor -> Tạo New Query -> Dán toàn bộ mã này và bấm RUN.
-- ==============================================================================

-- 1. Bảng Danh mục linh kiện (Part)
CREATE TABLE IF NOT EXISTS public.parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Cái',
    level INTEGER DEFAULT 1,
    skip_laser BOOLEAN DEFAULT FALSE,
    skip_bending BOOLEAN DEFAULT FALSE,
    skip_welding BOOLEAN DEFAULT FALSE,
    skip_painting BOOLEAN DEFAULT FALSE,
    has_painting_po BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng Tồn kho WIP (InventoryItem)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY, -- Tạo bởi: part_id || '_' || stage_id || '_' || location || '_' || COALESCE(original_part_id, 'NONE')
    part_id TEXT NOT NULL,
    original_part_id TEXT,
    stage_id TEXT NOT NULL,
    location TEXT NOT NULL CHECK (location IN ('IN', 'OUT', 'DEFECT')),
    quantity NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_lookup ON public.inventory(part_id, stage_id, location);

-- 3. Bảng Nhật ký quét giao dịch (Transaction)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('STAGE_OUT', 'STAGE_IN', 'DEFECT', 'DISPOSAL')),
    part_id TEXT NOT NULL,
    part_name TEXT,
    original_part_id TEXT,
    quantity NUMERIC NOT NULL,
    stage_id TEXT NOT NULL,
    location TEXT,
    timestamp BIGINT NOT NULL,
    qr_data TEXT,
    source_stage_id TEXT,
    target_stage_id TEXT,
    po_id TEXT,
    plan_id TEXT,
    printed BOOLEAN DEFAULT FALSE,
    defect_reason TEXT,
    defect_category TEXT,
    kpi_recorded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_stage ON public.transactions(stage_id);

-- 4. Bảng Lịch sử Nhãn in QR (Labels)
CREATE TABLE IF NOT EXISTS public.labels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    part_id TEXT NOT NULL,
    part_name TEXT,
    original_part_id TEXT,
    quantity NUMERIC NOT NULL,
    stage_id TEXT NOT NULL,
    location TEXT,
    timestamp BIGINT NOT NULL,
    qr_data TEXT,
    source_stage_id TEXT,
    target_stage_id TEXT,
    po_id TEXT,
    plan_id TEXT,
    printed BOOLEAN DEFAULT FALSE,
    defect_reason TEXT,
    defect_category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_labels_timestamp ON public.labels(timestamp DESC);

-- 5. Bảng Lệnh sản xuất (ProductionOrder)
CREATE TABLE IF NOT EXISTS public.production_orders (
    id TEXT PRIMARY KEY,
    master_po_id TEXT,
    part_id TEXT NOT NULL,
    stage_id TEXT,
    target_quantity NUMERIC NOT NULL,
    produced_quantity NUMERIC DEFAULT 0,
    exported_quantity NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED')),
    created_at BIGINT NOT NULL,
    completed_at BIGINT,
    planned_start_time BIGINT,
    lead_time NUMERIC,
    expected_completion_time BIGINT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_status ON public.production_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_master ON public.production_orders(master_po_id);

-- 6. Bảng Định mức Tôn tấm Laser (BOMDefinition v1)
CREATE TABLE IF NOT EXISTS public.bom_definitions (
    id TEXT PRIMARY KEY,
    parent_part_id TEXT NOT NULL,
    child_part_id TEXT NOT NULL,
    component_weight NUMERIC NOT NULL DEFAULT 0,
    scrap_weight NUMERIC NOT NULL DEFAULT 0
);

-- 7. Bảng Định mức Hàn (BOMDefinitionV2)
CREATE TABLE IF NOT EXISTS public.bom_v2_definitions (
    id TEXT PRIMARY KEY,
    result_part_id TEXT NOT NULL,
    ingredient_part_id TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    applicable_model TEXT
);

-- 8. Bảng Định mức Model (ModelBOMDefinition)
CREATE TABLE IF NOT EXISTS public.model_bom_definitions (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0
);

-- 9. Bảng Định mức Năng suất Công đoạn (ProductivityNorm)
CREATE TABLE IF NOT EXISTS public.productivity_norms (
    id TEXT PRIMARY KEY,
    part_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    seconds_per_unit NUMERIC NOT NULL DEFAULT 0
);

-- 10. Bảng Laser Nesting
CREATE TABLE IF NOT EXISTS public.laser_nesting (
    id TEXT PRIMARY KEY,
    nesting_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    qty_per_sheet NUMERIC NOT NULL DEFAULT 1,
    seconds_per_unit NUMERIC NOT NULL DEFAULT 0,
    seconds_per_sheet NUMERIC NOT NULL DEFAULT 0,
    applicable_model TEXT
);

-- 11. Bảng Cấu hình Ca làm việc & Nhân sự (ShiftConfig)
CREATE TABLE IF NOT EXISTS public.shift_configs (
    stage_id TEXT PRIMARY KEY,
    worker_count INTEGER NOT NULL DEFAULT 1,
    work_on_sunday BOOLEAN DEFAULT FALSE,
    shifts JSONB DEFAULT '[]'::jsonb,
    breaks JSONB DEFAULT '[]'::jsonb,
    worker_overrides JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Bảng Chuyển đổi linh kiện theo công đoạn (PartTransformation)
CREATE TABLE IF NOT EXISTS public.part_transformations (
    id TEXT PRIMARY KEY,
    source_part_id TEXT NOT NULL,
    target_part_id TEXT NOT NULL,
    target_stage_id TEXT NOT NULL,
    applicable_model TEXT
);

-- 13. Bảng Cấu hình Dán kính đầu vào (GlazingConfig)
CREATE TABLE IF NOT EXISTS public.glazing_configs (
    id TEXT PRIMARY KEY,
    part_name TEXT NOT NULL,
    part_id TEXT NOT NULL,
    source_stage_id TEXT NOT NULL
);

-- 14. Bảng Cấu hình Dán kính đầu ra (GlazingOutConfig)
CREATE TABLE IF NOT EXISTS public.glazing_out_configs (
    id TEXT PRIMARY KEY,
    final_part_name TEXT NOT NULL,
    sub_parts JSONB DEFAULT '[]'::jsonb
);

-- 15. Bảng Định mức Kế hoạch Dán kính (GlazingPlanNorm)
CREATE TABLE IF NOT EXISTS public.glazing_plan_norms (
    id TEXT PRIMARY KEY,
    part_name TEXT NOT NULL,
    norm NUMERIC NOT NULL,
    model_name TEXT NOT NULL,
    applied_model TEXT
);

-- 16. Bảng Kế hoạch Dán kính (GlazingPlan)
CREATE TABLE IF NOT EXISTS public.glazing_plans (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    target_quantity NUMERIC NOT NULL,
    target_completion_time BIGINT NOT NULL,
    planned_start_time BIGINT,
    expected_completion_time BIGINT,
    created_at BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
    produced_quantities JSONB DEFAULT '{}'::jsonb,
    printed_quantities JSONB DEFAULT '{}'::jsonb
);

-- 17. Bảng Cài đặt & Cấu hình Hệ thống (SystemSettings - Key/Value JSONB)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- KÍCH HOẠT REALTIME CHO TẤT CẢ CÁC BẢNG TRÊN SUPABASE
-- ==============================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
        public.parts,
        public.inventory,
        public.transactions,
        public.labels,
        public.production_orders,
        public.bom_definitions,
        public.bom_v2_definitions,
        public.model_bom_definitions,
        public.productivity_norms,
        public.laser_nesting,
        public.shift_configs,
        public.part_transformations,
        public.glazing_configs,
        public.glazing_out_configs,
        public.glazing_plan_norms,
        public.glazing_plans,
        public.system_settings;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- ==============================================================================
-- PHÂN QUYỀN ROW LEVEL SECURITY (RLS) - CHO PHÉP ĐỌC/GHI VỚI ANON KEY
-- ==============================================================================
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_v2_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_bom_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productivity_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laser_nesting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_transformations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glazing_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glazing_out_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glazing_plan_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glazing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Tạo Policies (Bỏ qua nếu đã tồn tại)
CREATE POLICY "Public Read/Write for parts" ON public.parts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for inventory" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for labels" ON public.labels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for production_orders" ON public.production_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for bom_definitions" ON public.bom_definitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for bom_v2_definitions" ON public.bom_v2_definitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for model_bom_definitions" ON public.model_bom_definitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for productivity_norms" ON public.productivity_norms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for laser_nesting" ON public.laser_nesting FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for shift_configs" ON public.shift_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for part_transformations" ON public.part_transformations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for glazing_configs" ON public.glazing_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for glazing_out_configs" ON public.glazing_out_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for glazing_plan_norms" ON public.glazing_plan_norms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for glazing_plans" ON public.glazing_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write for system_settings" ON public.system_settings FOR ALL USING (true) WITH CHECK (true);
