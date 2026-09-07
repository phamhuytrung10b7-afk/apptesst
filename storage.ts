/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, Transaction, StageId, STAGES, INITIAL_PARTS, Part, BOMDefinition, BOMDefinitionV2, ProductionOrder, ModelBOMDefinition, ProductivityNorm, LaserNesting, ShiftConfig, PartTransformation } from './types';
import { format, addMilliseconds, setHours, setMinutes, setSeconds, getHours, getMinutes, isBefore, isAfter, startOfDay, addDays } from 'date-fns';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const STORAGE_KEYS = {
  INVENTORY: 'wip_inventory',
  TRANSACTIONS: 'wip_transactions',
  PARTS: 'wip_parts',
  BOM: 'wip_bom',
  BOM_V2: 'wip_bom_v2',
  LABEL_SETTINGS: 'wip_label_settings',
  PRODUCTION_ORDERS: 'wip_production_orders',
  MODEL_BOM: 'wip_model_bom',
  NORMS: 'wip_productivity_norms',
  LASER_NESTING: 'wip_laser_nesting',
  SHIFT_CONFIGS: 'wip_shift_configs',
  TRANSFORMATIONS: 'wip_transformations',
  GLAZING_CONFIGS: 'wip_glazing_configs',
  GLAZING_OUT_CONFIGS: 'wip_glazing_out_configs',
  QUICK_PRINT_PARTS: 'wip_quick_print_parts',
  GLAZING_PLAN_NORMS: 'wip_glazing_plan_norms',
  GLAZING_PLANS: 'wip_glazing_plans',
  PEOPLE_PER_DAY: 'wip_people_per_day',
  MANDAYS_PER_DAY: 'wip_mandays_per_day',
  EXPORT_WEEK_NAME: 'wip_export_week_name',
  HOURLY_PEOPLE_PAINTING: 'wip_hourly_people_painting',
  HOURLY_PEOPLE_GLAZING: 'wip_hourly_people_glazing',
  HOURLY_PEOPLE_BENDING: 'wip_hourly_people_bending',
  HOURLY_PEOPLE_WELDING: 'wip_hourly_people_welding',
  BENDING_WELDING_HSQD: 'wip_bending_welding_hsqd',
};

// In-memory cache to reduce localStorage hits
const cache: Record<string, any> = {};

function getCached<T>(key: string, fetchFn: () => T): T {
  if (cache[key] !== undefined) return cache[key];
  const data = fetchFn();
  cache[key] = data;
  return data;
}

function clearCache(key?: string) {
  if (key) delete cache[key];
  else Object.keys(cache).forEach(k => delete cache[k]);
}

// Dual-access wrapper: enables async/await with Supabase while preserving synchronous access for UI rendering
function makeAsyncArray<T>(items: T[], asyncFetchPromise?: Promise<T[]>): T[] & Promise<T[]> {
  const arr = [...items] as any;
  arr.then = (onFulfilled?: any, onRejected?: any) => {
    if (asyncFetchPromise) {
      return asyncFetchPromise.then(onFulfilled, onRejected);
    }
    return Promise.resolve(items).then(onFulfilled, onRejected);
  };
  arr.catch = (onRejected?: any) => {
    if (asyncFetchPromise) {
      return asyncFetchPromise.catch(onRejected);
    }
    return Promise.resolve(items).catch(onRejected);
  };
  return arr;
}

// Optimized column lists to minimize egress bandwidth and network transfer
export const DB_COLUMNS = {
  PARTS: 'id, name, unit, level, skip_laser, skip_bending, skip_welding, skip_painting, has_painting_po',
  INVENTORY: 'id, part_id, original_part_id, stage_id, location, quantity',
  TRANSACTIONS: 'id, type, part_id, part_name, original_part_id, quantity, stage_id, location, timestamp, qr_data, source_stage_id, target_stage_id, po_id, plan_id, printed, defect_reason, defect_category, kpi_recorded',
  LABELS: 'id, type, part_id, part_name, original_part_id, quantity, stage_id, location, timestamp, qr_data, source_stage_id, target_stage_id, po_id, plan_id, printed, defect_reason, defect_category, kpi_recorded',
  PRODUCTION_ORDERS: 'id, master_po_id, part_id, stage_id, target_quantity, produced_quantity, exported_quantity, status, created_at, completed_at, planned_start_time, lead_time, expected_completion_time',
  BOM: 'parent_part_id, child_part_id, component_weight, scrap_weight',
  BOM_V2: 'result_part_id, ingredient_part_id, quantity, applicable_model',
  MODEL_BOM: 'model_id, part_id, quantity',
  NORMS: 'part_id, stage_id, seconds_per_unit',
  LASER_NESTING: 'nesting_id, part_id, qty_per_sheet, seconds_per_unit, seconds_per_sheet, applicable_model',
  SHIFT_CONFIGS: 'stage_id, worker_count, work_on_sunday, shifts, breaks, worker_overrides',
  TRANSFORMATIONS: 'source_part_id, target_part_id, target_stage_id, applicable_model',
  GLAZING_PLANS: 'id, model_id, target_quantity, target_completion_time, planned_start_time, expected_completion_time, created_at, status, produced_quantities, printed_quantities',
  SYSTEM_SETTINGS: 'key, value',
};

// Data Mappers between TypeScript interfaces and Supabase PostgreSQL tables
function partToRow(p: Part) {
  return {
    id: p.id,
    name: p.name,
    unit: p.unit || 'Cái',
    level: p.level || 1,
    skip_laser: !!p.skipLaser,
    skip_bending: !!p.skipBending,
    skip_welding: !!p.skipWelding,
    skip_painting: !!p.skipPainting,
    has_painting_po: !!p.hasPaintingPO,
  };
}

function rowToPart(r: any): Part {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit || 'Cái',
    level: r.level || 1,
    skipLaser: !!r.skip_laser,
    skipBending: !!r.skip_bending,
    skipWelding: !!r.skip_welding,
    skipPainting: !!r.skip_painting,
    hasPaintingPO: !!r.has_painting_po,
  };
}

function invToRow(i: InventoryItem) {
  const orig = i.originalPartId || 'NONE';
  const id = `${i.partId}_${i.stageId}_${i.location}_${orig}`;
  return {
    id,
    part_id: i.partId,
    original_part_id: i.originalPartId || null,
    stage_id: i.stageId,
    location: i.location,
    quantity: Number(i.quantity) || 0,
  };
}

function rowToInv(r: any): InventoryItem {
  return {
    partId: r.part_id,
    originalPartId: r.original_part_id || undefined,
    stageId: r.stage_id,
    location: r.location,
    quantity: Number(r.quantity) || 0,
  };
}

function txToRow(t: Transaction) {
  return {
    id: t.id,
    type: t.type,
    part_id: t.partId,
    part_name: t.partName || null,
    original_part_id: t.originalPartId || null,
    quantity: Number(t.quantity),
    stage_id: t.stageId,
    location: t.location || null,
    timestamp: Number(t.timestamp),
    qr_data: t.qrData || null,
    source_stage_id: t.sourceStageId || null,
    target_stage_id: t.targetStageId || null,
    po_id: t.poId || null,
    plan_id: t.planId || null,
    printed: !!t.printed,
    defect_reason: t.defectReason || null,
    defect_category: t.defectCategory || null,
    kpi_recorded: !!t.kpiRecorded,
  };
}

function rowToTx(r: any): Transaction {
  return {
    id: r.id,
    type: r.type,
    partId: r.part_id,
    partName: r.part_name || undefined,
    originalPartId: r.original_part_id || undefined,
    quantity: Number(r.quantity),
    stageId: r.stage_id,
    location: r.location || undefined,
    timestamp: Number(r.timestamp),
    qrData: r.qr_data || undefined,
    sourceStageId: r.source_stage_id || undefined,
    targetStageId: r.target_stage_id || undefined,
    poId: r.po_id || undefined,
    planId: r.plan_id || undefined,
    printed: r.printed || undefined,
    defectReason: r.defect_reason || undefined,
    defectCategory: r.defect_category || undefined,
    kpiRecorded: r.kpi_recorded || undefined,
  };
}

function poToRow(p: ProductionOrder) {
  return {
    id: p.id,
    master_po_id: p.masterPoId || null,
    part_id: p.partId,
    stage_id: p.stageId || null,
    target_quantity: Number(p.targetQuantity),
    produced_quantity: Number(p.producedQuantity || 0),
    exported_quantity: Number(p.exportedQuantity || 0),
    status: p.status,
    created_at: Number(p.createdAt),
    completed_at: p.completedAt ? Number(p.completedAt) : null,
    planned_start_time: p.plannedStartTime ? Number(p.plannedStartTime) : null,
    lead_time: p.leadTime ? Number(p.leadTime) : null,
    expected_completion_time: p.expectedCompletionTime ? Number(p.expectedCompletionTime) : null,
  };
}

function rowToPo(r: any): ProductionOrder {
  return {
    id: r.id,
    masterPoId: r.master_po_id || undefined,
    partId: r.part_id,
    stageId: r.stage_id || undefined,
    targetQuantity: Number(r.target_quantity),
    producedQuantity: Number(r.produced_quantity || 0),
    exportedQuantity: Number(r.exported_quantity || 0),
    status: r.status,
    createdAt: Number(r.created_at),
    completedAt: r.completed_at ? Number(r.completed_at) : undefined,
    plannedStartTime: r.planned_start_time ? Number(r.planned_start_time) : undefined,
    leadTime: r.lead_time ? Number(r.lead_time) : undefined,
    expectedCompletionTime: r.expected_completion_time ? Number(r.expected_completion_time) : undefined,
  };
}

function bomToRow(b: BOMDefinition) {
  return {
    id: `${b.parentPartId}_${b.childPartId}`,
    parent_part_id: b.parentPartId,
    child_part_id: b.childPartId,
    component_weight: Number(b.componentWeight || 0),
    scrap_weight: Number(b.scrapWeight || 0),
  };
}

function rowToBom(r: any): BOMDefinition {
  return {
    parentPartId: r.parent_part_id,
    childPartId: r.child_part_id,
    componentWeight: Number(r.component_weight || 0),
    scrapWeight: Number(r.scrap_weight || 0),
  };
}

function bomV2ToRow(b: BOMDefinitionV2) {
  return {
    id: `${b.resultPartId}_${b.ingredientPartId}_${b.applicableModel || 'ALL'}`,
    result_part_id: b.resultPartId,
    ingredient_part_id: b.ingredientPartId,
    quantity: Number(b.quantity || 0),
    applicable_model: b.applicableModel || null,
  };
}

function rowToBomV2(r: any): BOMDefinitionV2 {
  return {
    resultPartId: r.result_part_id,
    ingredientPartId: r.ingredient_part_id,
    quantity: Number(r.quantity || 0),
    applicableModel: r.applicable_model || undefined,
  };
}

function modelBomToRow(m: ModelBOMDefinition) {
  return {
    id: `${m.modelId}_${m.partId}`,
    model_id: m.modelId,
    part_id: m.partId,
    quantity: Number(m.quantity || 0),
  };
}

function rowToModelBom(r: any): ModelBOMDefinition {
  return {
    modelId: r.model_id,
    partId: r.part_id,
    quantity: Number(r.quantity || 0),
  };
}

function normToRow(n: ProductivityNorm) {
  return {
    id: `${n.partId}_${n.stageId}`,
    part_id: n.partId,
    stage_id: n.stageId,
    seconds_per_unit: Number(n.secondsPerUnit || 0),
  };
}

function rowToNorm(r: any): ProductivityNorm {
  return {
    partId: r.part_id,
    stageId: r.stage_id,
    secondsPerUnit: Number(r.seconds_per_unit || 0),
  };
}

function nestingToRow(n: LaserNesting) {
  return {
    id: `${n.nestingId}_${n.partId}`,
    nesting_id: n.nestingId,
    part_id: n.partId,
    qty_per_sheet: Number(n.qtyPerSheet || 1),
    seconds_per_unit: Number(n.secondsPerUnit || 0),
    seconds_per_sheet: Number(n.secondsPerSheet || 0),
    applicable_model: n.applicableModel || null,
  };
}

function rowToNesting(r: any): LaserNesting {
  return {
    nestingId: r.nesting_id,
    partId: r.part_id,
    qtyPerSheet: Number(r.qty_per_sheet || 1),
    secondsPerUnit: Number(r.seconds_per_unit || 0),
    secondsPerSheet: Number(r.seconds_per_sheet || 0),
    applicableModel: r.applicable_model || undefined,
  };
}

function shiftToRow(s: ShiftConfig) {
  return {
    stage_id: s.stageId,
    worker_count: s.workerCount || 1,
    work_on_sunday: !!s.workOnSunday,
    shifts: s.shifts || [],
    breaks: s.breaks || [],
    worker_overrides: s.workerOverrides || [],
  };
}

function rowToShift(r: any): ShiftConfig {
  return {
    stageId: r.stage_id,
    workerCount: Number(r.worker_count || 1),
    workOnSunday: !!r.work_on_sunday,
    shifts: r.shifts || [],
    breaks: r.breaks || [],
    workerOverrides: r.worker_overrides || [],
  };
}

function transfToRow(t: PartTransformation) {
  return {
    id: `${t.sourcePartId}_${t.targetPartId}_${t.targetStageId}_${t.applicableModel || 'ALL'}`,
    source_part_id: t.sourcePartId,
    target_part_id: t.targetPartId,
    target_stage_id: t.targetStageId,
    applicable_model: t.applicableModel || null,
  };
}

function rowToTransf(r: any): PartTransformation {
  return {
    sourcePartId: r.source_part_id,
    targetPartId: r.target_part_id,
    targetStageId: r.target_stage_id,
    applicableModel: r.applicable_model || undefined,
  };
}

function glazingPlanToRow(p: import('./types').GlazingPlan) {
  return {
    id: p.id,
    model_id: p.modelId,
    target_quantity: Number(p.targetQuantity),
    target_completion_time: Number(p.targetCompletionTime),
    planned_start_time: p.plannedStartTime ? Number(p.plannedStartTime) : null,
    expected_completion_time: p.expectedCompletionTime ? Number(p.expectedCompletionTime) : null,
    created_at: Number(p.createdAt),
    status: p.status,
    produced_quantities: p.producedQuantities || {},
    printed_quantities: (p as any).printedQuantities || {},
  };
}

function rowToGlazingPlan(r: any): import('./types').GlazingPlan {
  return {
    id: r.id,
    modelId: r.model_id,
    targetQuantity: Number(r.target_quantity),
    targetCompletionTime: Number(r.target_completion_time),
    plannedStartTime: r.planned_start_time ? Number(r.planned_start_time) : undefined,
    expectedCompletionTime: r.expected_completion_time ? Number(r.expected_completion_time) : undefined,
    createdAt: Number(r.created_at),
    status: r.status,
    producedQuantities: r.produced_quantities || {},
    ...(r.printed_quantities ? { printedQuantities: r.printed_quantities } : {}),
  } as any;
}

// Singleton state for Supabase Realtime subscription
let activeRealtimeChannel: any = null;
const realtimeCallbacks = new Set<(payload: any) => void>();

function safeRun(promiseLike: PromiseLike<any>, errorContext: string) {
  promiseLike.then(
    ({ error }: any) => {
      if (error) console.error(`[Supabase ${errorContext}]`, error);
    },
    (err: any) => {
      console.error(`[Supabase ${errorContext}]`, err);
    }
  );
}

export const storageService = {
  normalize(s: string): string {
    if (!s) return '';
    let res = s.toUpperCase().normalize('NFC');
    // Strip common prefixes
    res = res.replace(/^(TẤM|CHI TIẾT|PHỤ TÙNG|BẢN|KHO|THÀNH PHẨM|L-)\s+/g, '');
    // Strip common suffixes
    res = res.replace(/\s*-\s*(CD|H|C|P|G|W|B|L|CT|BD)$/g, ''); 
    return res.split('(')[0].trim();
  },

  // --- Supabase Online Cloud Operations & State Synchronization ---
  isConfigured(): boolean {
    return isSupabaseConfigured;
  },

  async fetchAllFromSupabase(): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const [
        partsRes,
        invRes,
        txRes,
        lblRes,
        poRes,
        bomRes,
        bomV2Res,
        modelBomRes,
        normRes,
        nestRes,
        shiftRes,
        transfRes,
        glazingPlanRes,
        settingsRes
      ] = await Promise.all([
        supabase.from('parts').select(DB_COLUMNS.PARTS),
        supabase.from('inventory').select(DB_COLUMNS.INVENTORY),
        supabase.from('transactions').select(DB_COLUMNS.TRANSACTIONS).order('timestamp', { ascending: false }).limit(100),
        supabase.from('labels').select(DB_COLUMNS.LABELS).order('timestamp', { ascending: false }).limit(100),
        supabase.from('production_orders').select(DB_COLUMNS.PRODUCTION_ORDERS),
        supabase.from('bom_definitions').select(DB_COLUMNS.BOM),
        supabase.from('bom_v2_definitions').select(DB_COLUMNS.BOM_V2),
        supabase.from('model_bom_definitions').select(DB_COLUMNS.MODEL_BOM),
        supabase.from('productivity_norms').select(DB_COLUMNS.NORMS),
        supabase.from('laser_nesting').select(DB_COLUMNS.LASER_NESTING),
        supabase.from('shift_configs').select(DB_COLUMNS.SHIFT_CONFIGS),
        supabase.from('part_transformations').select(DB_COLUMNS.TRANSFORMATIONS),
        supabase.from('glazing_plans').select(DB_COLUMNS.GLAZING_PLANS),
        supabase.from('system_settings').select(DB_COLUMNS.SYSTEM_SETTINGS)
      ]);

      if (!partsRes.error && partsRes.data && partsRes.data.length > 0) {
        const parts = partsRes.data.map(rowToPart);
        cache[STORAGE_KEYS.PARTS] = parts;
        localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(parts));
      }
      if (!invRes.error && invRes.data) {
        const inv = invRes.data.map(rowToInv);
        cache[STORAGE_KEYS.INVENTORY] = inv;
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inv));
      }
      if (!txRes.error && txRes.data) {
        const txs = txRes.data.map(rowToTx);
        cache[STORAGE_KEYS.TRANSACTIONS] = txs;
        localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
      }
      if (!lblRes.error && lblRes.data) {
        const lbls = lblRes.data.map(rowToTx);
        cache['wip_labels'] = lbls;
        localStorage.setItem('wip_labels', JSON.stringify(lbls));
      }
      if (!poRes.error && poRes.data) {
        const pos = poRes.data.map(rowToPo);
        cache[STORAGE_KEYS.PRODUCTION_ORDERS] = pos;
        localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(pos));
      }
      if (!bomRes.error && bomRes.data) {
        const bom = bomRes.data.map(rowToBom);
        cache[STORAGE_KEYS.BOM] = bom;
        localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(bom));
      }
      if (!bomV2Res.error && bomV2Res.data) {
        const bomV2 = bomV2Res.data.map(rowToBomV2);
        cache[STORAGE_KEYS.BOM_V2] = bomV2;
        localStorage.setItem(STORAGE_KEYS.BOM_V2, JSON.stringify(bomV2));
      }
      if (!modelBomRes.error && modelBomRes.data) {
        const modelBom = modelBomRes.data.map(rowToModelBom);
        cache[STORAGE_KEYS.MODEL_BOM] = modelBom;
        localStorage.setItem(STORAGE_KEYS.MODEL_BOM, JSON.stringify(modelBom));
      }
      if (!normRes.error && normRes.data) {
        const norms = normRes.data.map(rowToNorm);
        cache[STORAGE_KEYS.NORMS] = norms;
        localStorage.setItem(STORAGE_KEYS.NORMS, JSON.stringify(norms));
      }
      if (!nestRes.error && nestRes.data) {
        const nests = nestRes.data.map(rowToNesting);
        cache[STORAGE_KEYS.LASER_NESTING] = nests;
        localStorage.setItem(STORAGE_KEYS.LASER_NESTING, JSON.stringify(nests));
      }
      if (!shiftRes.error && shiftRes.data && shiftRes.data.length > 0) {
        const shifts = shiftRes.data.map(rowToShift);
        cache[STORAGE_KEYS.SHIFT_CONFIGS] = shifts;
        localStorage.setItem(STORAGE_KEYS.SHIFT_CONFIGS, JSON.stringify(shifts));
      }
      if (!transfRes.error && transfRes.data) {
        const transfs = transfRes.data.map(rowToTransf);
        cache[STORAGE_KEYS.TRANSFORMATIONS] = transfs;
        localStorage.setItem(STORAGE_KEYS.TRANSFORMATIONS, JSON.stringify(transfs));
      }
      if (!glazingPlanRes.error && glazingPlanRes.data) {
        const gPlans = glazingPlanRes.data.map(rowToGlazingPlan);
        cache[STORAGE_KEYS.GLAZING_PLANS] = gPlans;
        localStorage.setItem(STORAGE_KEYS.GLAZING_PLANS, JSON.stringify(gPlans));
      }
      if (!settingsRes.error && settingsRes.data) {
        settingsRes.data.forEach((s: any) => {
          cache[s.key] = s.value;
          localStorage.setItem(s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value));
        });
      }
    } catch (err) {
      console.error('Error in storageService.fetchAllFromSupabase():', err);
      throw err;
    }
  },

  async init(): Promise<void> {
    return storageService.fetchAllFromSupabase();
  },

  async syncTableFromSupabase(table: string): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      if (table === 'parts') {
        const { data } = await supabase.from('parts').select(DB_COLUMNS.PARTS);
        if (data) {
          const parts = data.map(rowToPart);
          cache[STORAGE_KEYS.PARTS] = parts;
          localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(parts));
        }
      } else if (table === 'inventory') {
        const { data } = await supabase.from('inventory').select(DB_COLUMNS.INVENTORY);
        if (data) {
          const inv = data.map(rowToInv);
          cache[STORAGE_KEYS.INVENTORY] = inv;
          localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inv));
        }
      } else if (table === 'transactions') {
        const { data } = await supabase.from('transactions').select(DB_COLUMNS.TRANSACTIONS).order('timestamp', { ascending: false }).limit(100);
        if (data) {
          const txs = data.map(rowToTx);
          cache[STORAGE_KEYS.TRANSACTIONS] = txs;
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
        }
      } else if (table === 'labels') {
        const { data } = await supabase.from('labels').select(DB_COLUMNS.LABELS).order('timestamp', { ascending: false }).limit(100);
        if (data) {
          const lbls = data.map(rowToTx);
          cache['wip_labels'] = lbls;
          localStorage.setItem('wip_labels', JSON.stringify(lbls));
        }
      } else if (table === 'production_orders') {
        const { data } = await supabase.from('production_orders').select(DB_COLUMNS.PRODUCTION_ORDERS);
        if (data) {
          const pos = data.map(rowToPo);
          cache[STORAGE_KEYS.PRODUCTION_ORDERS] = pos;
          localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(pos));
        }
      } else if (table === 'bom_definitions') {
        const { data } = await supabase.from('bom_definitions').select(DB_COLUMNS.BOM);
        if (data) {
          const bom = data.map(rowToBom);
          cache[STORAGE_KEYS.BOM] = bom;
          localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(bom));
        }
      } else if (table === 'bom_v2_definitions') {
        const { data } = await supabase.from('bom_v2_definitions').select(DB_COLUMNS.BOM_V2);
        if (data) {
          const bomV2 = data.map(rowToBomV2);
          cache[STORAGE_KEYS.BOM_V2] = bomV2;
          localStorage.setItem(STORAGE_KEYS.BOM_V2, JSON.stringify(bomV2));
        }
      } else if (table === 'model_bom_definitions') {
        const { data } = await supabase.from('model_bom_definitions').select(DB_COLUMNS.MODEL_BOM);
        if (data) {
          const mb = data.map(rowToModelBom);
          cache[STORAGE_KEYS.MODEL_BOM] = mb;
          localStorage.setItem(STORAGE_KEYS.MODEL_BOM, JSON.stringify(mb));
        }
      } else if (table === 'productivity_norms') {
        const { data } = await supabase.from('productivity_norms').select(DB_COLUMNS.NORMS);
        if (data) {
          const norms = data.map(rowToNorm);
          cache[STORAGE_KEYS.NORMS] = norms;
          localStorage.setItem(STORAGE_KEYS.NORMS, JSON.stringify(norms));
        }
      } else if (table === 'laser_nesting') {
        const { data } = await supabase.from('laser_nesting').select(DB_COLUMNS.LASER_NESTING);
        if (data) {
          const nests = data.map(rowToNesting);
          cache[STORAGE_KEYS.LASER_NESTING] = nests;
          localStorage.setItem(STORAGE_KEYS.LASER_NESTING, JSON.stringify(nests));
        }
      } else if (table === 'shift_configs') {
        const { data } = await supabase.from('shift_configs').select(DB_COLUMNS.SHIFT_CONFIGS);
        if (data) {
          const shifts = data.map(rowToShift);
          cache[STORAGE_KEYS.SHIFT_CONFIGS] = shifts;
          localStorage.setItem(STORAGE_KEYS.SHIFT_CONFIGS, JSON.stringify(shifts));
        }
      } else if (table === 'part_transformations') {
        const { data } = await supabase.from('part_transformations').select(DB_COLUMNS.TRANSFORMATIONS);
        if (data) {
          const transfs = data.map(rowToTransf);
          cache[STORAGE_KEYS.TRANSFORMATIONS] = transfs;
          localStorage.setItem(STORAGE_KEYS.TRANSFORMATIONS, JSON.stringify(transfs));
        }
      } else if (table === 'glazing_plans') {
        const { data } = await supabase.from('glazing_plans').select(DB_COLUMNS.GLAZING_PLANS);
        if (data) {
          const gPlans = data.map(rowToGlazingPlan);
          cache[STORAGE_KEYS.GLAZING_PLANS] = gPlans;
          localStorage.setItem(STORAGE_KEYS.GLAZING_PLANS, JSON.stringify(gPlans));
        }
      } else if (table === 'system_settings') {
        const { data } = await supabase.from('system_settings').select(DB_COLUMNS.SYSTEM_SETTINGS);
        if (data) {
          data.forEach((s: any) => {
            cache[s.key] = s.value;
            localStorage.setItem(s.key, typeof s.value === 'string' ? s.value : JSON.stringify(s.value));
          });
        }
      }
    } catch (err) {
      console.error(`Error syncing table ${table} from Supabase:`, err);
    }
  },

  subscribeToRealtime(callback: (payload: any) => void): () => void {
    if (!isSupabaseConfigured) {
      return () => {};
    }
    try {
      realtimeCallbacks.add(callback);

      if (!activeRealtimeChannel) {
        // Clean up any stale or existing channels with matching names to avoid duplicate subscriptions
        try {
          const channels = supabase.getChannels();
          channels.forEach((ch: any) => {
            if (ch.topic && ch.topic.includes('wip-realtime')) {
              supabase.removeChannel(ch);
            }
          });
        } catch (cleanupErr) {
          // Ignore cleanup error
        }

        const channelName = `wip-realtime-${Date.now()}`;
        const channel = supabase.channel(channelName);

        // Only maintain Realtime listeners for frequently fluctuating data tables:
        // inventory, transactions, production_orders, and labels to minimize Egress on Supabase Free
        const realtimeTables = ['inventory', 'transactions', 'production_orders', 'labels'];
        realtimeTables.forEach((table) => {
          channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            async (payload: any) => {
              console.log(`[Supabase Realtime] Table change detected on ${table}:`, payload.eventType);

              let appliedFromPayload = false;
              try {
                if (table === 'inventory' && payload.new) {
                  const inv = storageService.getInventory();
                  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const item = rowToInv(payload.new);
                    const idx = inv.findIndex(i => {
                      const orig = i.originalPartId || 'NONE';
                      const itemOrig = item.originalPartId || 'NONE';
                      return i.partId === item.partId && i.stageId === item.stageId && i.location === item.location && orig === itemOrig;
                    });
                    if (idx >= 0) {
                      inv[idx] = item;
                    } else {
                      inv.push(item);
                    }
                    cache[STORAGE_KEYS.INVENTORY] = inv;
                    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inv));
                    appliedFromPayload = true;
                  }
                } else if (table === 'inventory' && payload.eventType === 'DELETE' && payload.old) {
                  const inv = storageService.getInventory();
                  const targetId = payload.old.id;
                  const filtered = inv.filter(i => {
                    const orig = i.originalPartId || 'NONE';
                    return `${i.partId}_${i.stageId}_${i.location}_${orig}` !== targetId;
                  });
                  cache[STORAGE_KEYS.INVENTORY] = filtered;
                  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(filtered));
                  appliedFromPayload = true;
                } else if (table === 'transactions') {
                  const txs = storageService.getTransactions();
                  if (payload.eventType === 'INSERT' && payload.new) {
                    const tx = rowToTx(payload.new);
                    if (!txs.some(t => t.id === tx.id)) {
                      txs.unshift(tx);
                      if (txs.length > 100) txs.length = 100;
                      cache[STORAGE_KEYS.TRANSACTIONS] = txs;
                      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
                    }
                    appliedFromPayload = true;
                  } else if (payload.eventType === 'DELETE' && payload.old) {
                    const filtered = txs.filter(t => t.id !== payload.old.id);
                    cache[STORAGE_KEYS.TRANSACTIONS] = filtered;
                    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(filtered));
                    appliedFromPayload = true;
                  }
                } else if (table === 'labels') {
                  const lbls = storageService.getLabels();
                  if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
                    const lbl = rowToTx(payload.new);
                    const idx = lbls.findIndex(l => l.id === lbl.id);
                    if (idx >= 0) {
                      lbls[idx] = lbl;
                    } else {
                      lbls.unshift(lbl);
                      if (lbls.length > 100) lbls.length = 100;
                    }
                    cache['wip_labels'] = lbls;
                    localStorage.setItem('wip_labels', JSON.stringify(lbls));
                    appliedFromPayload = true;
                  } else if (payload.eventType === 'DELETE' && payload.old) {
                    const filtered = lbls.filter(l => l.id !== payload.old.id);
                    cache['wip_labels'] = filtered;
                    localStorage.setItem('wip_labels', JSON.stringify(filtered));
                    appliedFromPayload = true;
                  }
                } else if (table === 'production_orders') {
                  const pos = storageService.getProductionOrdersSync();
                  if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
                    const po = rowToPo(payload.new);
                    const idx = pos.findIndex(p => p.id === po.id);
                    if (idx >= 0) {
                      pos[idx] = po;
                    } else {
                      pos.unshift(po);
                    }
                    cache[STORAGE_KEYS.PRODUCTION_ORDERS] = pos;
                    localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(pos));
                    appliedFromPayload = true;
                  } else if (payload.eventType === 'DELETE' && payload.old) {
                    const filtered = pos.filter(p => p.id !== payload.old.id);
                    cache[STORAGE_KEYS.PRODUCTION_ORDERS] = filtered;
                    localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(filtered));
                    appliedFromPayload = true;
                  }
                }
              } catch (applyErr) {
                console.warn('[Supabase Realtime] Payload fast-apply error, falling back to fetch:', applyErr);
                appliedFromPayload = false;
              }

              if (!appliedFromPayload) {
                await storageService.syncTableFromSupabase(payload.table || table);
              }

              realtimeCallbacks.forEach((cb) => {
                try {
                  cb(payload);
                } catch (cbErr) {
                  console.error('[Supabase Realtime] Callback error:', cbErr);
                }
              });
            }
          );
        });

        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Supabase Realtime] Subscribed successfully on channel:', channelName);
          }
        });

        activeRealtimeChannel = channel;
      }

      // Cleanup function to avoid duplicate connections upon component re-render
      return () => {
        realtimeCallbacks.delete(callback);
        if (realtimeCallbacks.size === 0 && activeRealtimeChannel) {
          try {
            supabase.removeChannel(activeRealtimeChannel);
          } catch (removeErr) {
            // Ignore remove error
          }
          activeRealtimeChannel = null;
        }
      };
    } catch (err) {
      console.error('Failed to initialize Realtime subscription:', err);
      return () => {};
    }
  },

  getLabelSettings() {
    return getCached(STORAGE_KEYS.LABEL_SETTINGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.LABEL_SETTINGS);
      // Ensure settings align with standard A7 (75x100mm portrait)
      if (data) {
        try {
          let parsed = JSON.parse(data);
          if (
            !parsed.width || !parsed.height ||
            parsed.width > 150 || parsed.height > 180 ||
            parsed.width < 50 || parsed.height < 50 ||
            parsed.qrSize > 150 || parsed.qrSize < 50 ||
            parsed.fontSize > 16 || parsed.fontSize < 6
          ) {
            parsed = { width: 75, height: 100, fontSize: 10, qrSize: 110 };
            localStorage.setItem(STORAGE_KEYS.LABEL_SETTINGS, JSON.stringify(parsed));
          }
          return parsed;
        } catch {
          // invalid json fallback
        }
      }
      const defaultSettings = { width: 75, height: 100, fontSize: 10, qrSize: 110 };
      localStorage.setItem(STORAGE_KEYS.LABEL_SETTINGS, JSON.stringify(defaultSettings));
      return defaultSettings;
    });
  },

  async saveLabelSettings(settings: any): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.LABEL_SETTINGS, JSON.stringify(settings));
    cache[STORAGE_KEYS.LABEL_SETTINGS] = settings;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.LABEL_SETTINGS,
          value: settings,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveLabelSettings error:', err);
      }
    }
  },

  getPartsSync(): Part[] {
    const data = getCached(STORAGE_KEYS.PARTS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PARTS);
      return data ? JSON.parse(data) : INITIAL_PARTS;
    });
    return [...data];
  },

  async fetchParts(): Promise<Part[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('parts').select(DB_COLUMNS.PARTS);
        if (!error && data) {
          const parts = data.map(rowToPart);
          cache[STORAGE_KEYS.PARTS] = parts;
          localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(parts));
          return [...parts];
        }
      } catch (err) {
        console.error('Supabase fetchParts error:', err);
      }
    }
    return this.getPartsSync();
  },

  getParts(): Part[] & Promise<Part[]> {
    const syncData = this.getPartsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchParts() : undefined);
  },

  async saveParts(parts: Part[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(parts));
    cache[STORAGE_KEYS.PARTS] = parts;
    if (isSupabaseConfigured) {
      try {
        if (parts.length > 0) {
          await supabase.from('parts').upsert(parts.map(partToRow));
        }
      } catch (err) {
        console.error('Supabase saveParts error:', err);
      }
    }
  },

  async addPart(part: Part): Promise<void> {
    const current = this.getPartsSync();
    const updated = [...current, part];
    await this.saveParts(updated);
  },

  async updatePart(part: Part): Promise<void> {
    const current = this.getPartsSync();
    const updated = current.map(p => p.id === part.id ? part : p);
    await this.saveParts(updated);
  },

  async deletePart(id: string): Promise<void> {
    const current = this.getPartsSync();
    const updated = current.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(updated));
    cache[STORAGE_KEYS.PARTS] = updated;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('parts').delete().eq('id', id);
      } catch (err) {
        console.error('Supabase deletePart error:', err);
      }
    }
  },

  getBOMSync(): BOMDefinition[] {
    return getCached(STORAGE_KEYS.BOM, () => {
      const data = localStorage.getItem(STORAGE_KEYS.BOM);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchBOM(): Promise<BOMDefinition[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('bom_definitions').select(DB_COLUMNS.BOM);
        if (!error && data) {
          const bom = data.map(rowToBom);
          cache[STORAGE_KEYS.BOM] = bom;
          localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(bom));
          return [...bom];
        }
      } catch (err) {
        console.error('Supabase fetchBOM error:', err);
      }
    }
    return this.getBOMSync();
  },

  getBOM(): BOMDefinition[] & Promise<BOMDefinition[]> {
    const syncData = this.getBOMSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchBOM() : undefined);
  },

  async saveBOM(bom: BOMDefinition[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(bom));
    cache[STORAGE_KEYS.BOM] = bom;
    if (isSupabaseConfigured) {
      try {
        if (bom.length > 0) {
          await supabase.from('bom_definitions').upsert(bom.map(bomToRow));
        }
      } catch (err) {
        console.error('Supabase saveBOM error:', err);
      }
    }
  },

  getBOMV2Sync(): BOMDefinitionV2[] {
    return getCached(STORAGE_KEYS.BOM_V2, () => {
      const data = localStorage.getItem(STORAGE_KEYS.BOM_V2);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchBOMV2(): Promise<BOMDefinitionV2[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('bom_v2_definitions').select(DB_COLUMNS.BOM_V2);
        if (!error && data) {
          const bomV2 = data.map(rowToBomV2);
          cache[STORAGE_KEYS.BOM_V2] = bomV2;
          localStorage.setItem(STORAGE_KEYS.BOM_V2, JSON.stringify(bomV2));
          return [...bomV2];
        }
      } catch (err) {
        console.error('Supabase fetchBOMV2 error:', err);
      }
    }
    return this.getBOMV2Sync();
  },

  getBOMV2(): BOMDefinitionV2[] & Promise<BOMDefinitionV2[]> {
    const syncData = this.getBOMV2Sync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchBOMV2() : undefined);
  },

  async saveBOMV2(bom: BOMDefinitionV2[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.BOM_V2, JSON.stringify(bom));
    cache[STORAGE_KEYS.BOM_V2] = bom;
    if (isSupabaseConfigured) {
      try {
        if (bom.length > 0) {
          await supabase.from('bom_v2_definitions').upsert(bom.map(bomV2ToRow));
        }
      } catch (err) {
        console.error('Supabase saveBOMV2 error:', err);
      }
    }
  },

  getModelBOMSync(): ModelBOMDefinition[] {
    return getCached(STORAGE_KEYS.MODEL_BOM, () => {
      const data = localStorage.getItem(STORAGE_KEYS.MODEL_BOM);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchModelBOM(): Promise<ModelBOMDefinition[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('model_bom_definitions').select(DB_COLUMNS.MODEL_BOM);
        if (!error && data) {
          const modelBom = data.map(rowToModelBom);
          cache[STORAGE_KEYS.MODEL_BOM] = modelBom;
          localStorage.setItem(STORAGE_KEYS.MODEL_BOM, JSON.stringify(modelBom));
          return [...modelBom];
        }
      } catch (err) {
        console.error('Supabase fetchModelBOM error:', err);
      }
    }
    return this.getModelBOMSync();
  },

  getModelBOM(): ModelBOMDefinition[] & Promise<ModelBOMDefinition[]> {
    const syncData = this.getModelBOMSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchModelBOM() : undefined);
  },

  async saveModelBOM(bom: ModelBOMDefinition[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.MODEL_BOM, JSON.stringify(bom));
    cache[STORAGE_KEYS.MODEL_BOM] = bom;
    if (isSupabaseConfigured) {
      try {
        if (bom.length > 0) {
          await supabase.from('model_bom_definitions').upsert(bom.map(modelBomToRow));
        }
      } catch (err) {
        console.error('Supabase saveModelBOM error:', err);
      }
    }
  },
  
  getNormsSync(): ProductivityNorm[] {
    return getCached(STORAGE_KEYS.NORMS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.NORMS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchNorms(): Promise<ProductivityNorm[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('productivity_norms').select(DB_COLUMNS.NORMS);
        if (!error && data) {
          const norms = data.map(rowToNorm);
          cache[STORAGE_KEYS.NORMS] = norms;
          localStorage.setItem(STORAGE_KEYS.NORMS, JSON.stringify(norms));
          return [...norms];
        }
      } catch (err) {
        console.error('Supabase fetchNorms error:', err);
      }
    }
    return this.getNormsSync();
  },

  getNorms(): ProductivityNorm[] & Promise<ProductivityNorm[]> {
    const syncData = this.getNormsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchNorms() : undefined);
  },

  async saveNorms(norms: ProductivityNorm[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.NORMS, JSON.stringify(norms));
    cache[STORAGE_KEYS.NORMS] = norms;
    if (isSupabaseConfigured) {
      try {
        if (norms.length > 0) {
          await supabase.from('productivity_norms').upsert(norms.map(normToRow));
        }
      } catch (err) {
        console.error('Supabase saveNorms error:', err);
      }
    }
  },

  getLaserNestingSync(): LaserNesting[] {
    return getCached(STORAGE_KEYS.LASER_NESTING, () => {
      const data = localStorage.getItem(STORAGE_KEYS.LASER_NESTING);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchLaserNesting(): Promise<LaserNesting[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('laser_nesting').select(DB_COLUMNS.LASER_NESTING);
        if (!error && data) {
          const nesting = data.map(rowToNesting);
          cache[STORAGE_KEYS.LASER_NESTING] = nesting;
          localStorage.setItem(STORAGE_KEYS.LASER_NESTING, JSON.stringify(nesting));
          return [...nesting];
        }
      } catch (err) {
        console.error('Supabase fetchLaserNesting error:', err);
      }
    }
    return this.getLaserNestingSync();
  },

  getLaserNesting(): LaserNesting[] & Promise<LaserNesting[]> {
    const syncData = this.getLaserNestingSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchLaserNesting() : undefined);
  },

  async saveLaserNesting(nesting: LaserNesting[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.LASER_NESTING, JSON.stringify(nesting));
    cache[STORAGE_KEYS.LASER_NESTING] = nesting;
    if (isSupabaseConfigured) {
      try {
        if (nesting.length > 0) {
          await supabase.from('laser_nesting').upsert(nesting.map(nestingToRow));
        }
      } catch (err) {
        console.error('Supabase saveLaserNesting error:', err);
      }
    }
  },
  
  getShiftConfigsSync(): ShiftConfig[] {
    return getCached(STORAGE_KEYS.SHIFT_CONFIGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.SHIFT_CONFIGS);
      let configs: ShiftConfig[] = data ? JSON.parse(data) : [];
      
      const defaults: ShiftConfig[] = [
        {
          stageId: 'LASER',
          workerCount: 1,
          shifts: [{ start: '06:00', end: '18:00' }, { start: '18:00', end: '06:00' }],
          breaks: [{ start: '10:00', end: '10:10' }, { start: '11:50', end: '13:00' }, { start: '15:00', end: '15:10' }, { start: '18:00', end: '18:30' }]
        },
        {
          stageId: 'BENDING',
          workerCount: 2,
          shifts: [{ start: '08:00', end: '20:00' }],
          breaks: [{ start: '10:00', end: '10:10' }, { start: '11:50', end: '13:00' }, { start: '15:00', end: '15:10' }]
        },
        {
          stageId: 'WELDING',
          workerCount: 5,
          shifts: [{ start: '08:00', end: '20:00' }],
          breaks: [{ start: '10:00', end: '10:10' }, { start: '11:50', end: '13:00' }, { start: '15:00', end: '15:10' }, { start: '17:00', end: '17:10' }]
        },
        {
          stageId: 'PAINTING',
          workerCount: 1,
          shifts: [{ start: '08:00', end: '20:00' }],
          breaks: [{ start: '10:00', end: '10:10' }, { start: '11:50', end: '13:00' }, { start: '15:00', end: '15:10' }, { start: '17:00', end: '17:10' }]
        },
        {
          stageId: 'GLAZING',
          workerCount: 2,
          shifts: [{ start: '08:00', end: '20:00' }],
          breaks: [{ start: '10:00', end: '10:10' }, { start: '11:50', end: '13:00' }, { start: '15:00', end: '15:10' }, { start: '17:00', end: '17:10' }]
        }
      ];

      defaults.forEach(def => {
        if (!configs.find(c => c.stageId === def.stageId)) {
          configs.push(def);
        }
      });
      
      return configs;
    });
  },

  async fetchShiftConfigs(): Promise<ShiftConfig[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('shift_configs').select(DB_COLUMNS.SHIFT_CONFIGS);
        if (!error && data && data.length > 0) {
          const shifts = data.map(rowToShift);
          cache[STORAGE_KEYS.SHIFT_CONFIGS] = shifts;
          localStorage.setItem(STORAGE_KEYS.SHIFT_CONFIGS, JSON.stringify(shifts));
          return [...shifts];
        }
      } catch (err) {
        console.error('Supabase fetchShiftConfigs error:', err);
      }
    }
    return this.getShiftConfigsSync();
  },

  getShiftConfigs(): ShiftConfig[] & Promise<ShiftConfig[]> {
    const syncData = this.getShiftConfigsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchShiftConfigs() : undefined);
  },

  async saveShiftConfigs(configs: ShiftConfig[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.SHIFT_CONFIGS, JSON.stringify(configs));
    cache[STORAGE_KEYS.SHIFT_CONFIGS] = configs;
    if (isSupabaseConfigured) {
      try {
        if (configs.length > 0) {
          await supabase.from('shift_configs').upsert(configs.map(shiftToRow));
        }
      } catch (err) {
        console.error('Supabase saveShiftConfigs error:', err);
      }
    }
  },

  getTransformationsSync(): PartTransformation[] {
    return getCached(STORAGE_KEYS.TRANSFORMATIONS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSFORMATIONS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchTransformations(): Promise<PartTransformation[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('part_transformations').select(DB_COLUMNS.TRANSFORMATIONS);
        if (!error && data) {
          const transfs = data.map(rowToTransf);
          cache[STORAGE_KEYS.TRANSFORMATIONS] = transfs;
          localStorage.setItem(STORAGE_KEYS.TRANSFORMATIONS, JSON.stringify(transfs));
          return [...transfs];
        }
      } catch (err) {
        console.error('Supabase fetchTransformations error:', err);
      }
    }
    return this.getTransformationsSync();
  },

  getTransformations(): PartTransformation[] & Promise<PartTransformation[]> {
    const syncData = this.getTransformationsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchTransformations() : undefined);
  },

  async saveTransformations(transformations: PartTransformation[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.TRANSFORMATIONS, JSON.stringify(transformations));
    cache[STORAGE_KEYS.TRANSFORMATIONS] = transformations;
    if (isSupabaseConfigured) {
      try {
        if (transformations.length > 0) {
          await supabase.from('part_transformations').upsert(transformations.map(transfToRow));
        }
      } catch (err) {
        console.error('Supabase saveTransformations error:', err);
      }
    }
  },

  getGlazingConfigsSync(): import('./types').GlazingConfig[] {
    return getCached(STORAGE_KEYS.GLAZING_CONFIGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_CONFIGS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchGlazingConfigs(): Promise<import('./types').GlazingConfig[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error }: any = await (supabase.from('system_settings').select(DB_COLUMNS.SYSTEM_SETTINGS) as any).eq('key', STORAGE_KEYS.GLAZING_CONFIGS).single();
        if (!error && data && data.value) {
          const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          cache[STORAGE_KEYS.GLAZING_CONFIGS] = val;
          localStorage.setItem(STORAGE_KEYS.GLAZING_CONFIGS, JSON.stringify(val));
          return [...val];
        }
      } catch (err) {
        console.error('Supabase fetchGlazingConfigs error:', err);
      }
    }
    return this.getGlazingConfigsSync();
  },

  getGlazingConfigs(): import('./types').GlazingConfig[] & Promise<import('./types').GlazingConfig[]> {
    const syncData = this.getGlazingConfigsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchGlazingConfigs() : undefined);
  },

  async saveGlazingConfigs(configs: import('./types').GlazingConfig[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.GLAZING_CONFIGS, JSON.stringify(configs));
    cache[STORAGE_KEYS.GLAZING_CONFIGS] = configs;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.GLAZING_CONFIGS,
          value: configs,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveGlazingConfigs error:', err);
      }
    }
  },

  getGlazingOutConfigsSync(): import('./types').GlazingOutConfig[] {
    return getCached(STORAGE_KEYS.GLAZING_OUT_CONFIGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_OUT_CONFIGS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchGlazingOutConfigs(): Promise<import('./types').GlazingOutConfig[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error }: any = await (supabase.from('system_settings').select(DB_COLUMNS.SYSTEM_SETTINGS) as any).eq('key', STORAGE_KEYS.GLAZING_OUT_CONFIGS).single();
        if (!error && data && data.value) {
          const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          cache[STORAGE_KEYS.GLAZING_OUT_CONFIGS] = val;
          localStorage.setItem(STORAGE_KEYS.GLAZING_OUT_CONFIGS, JSON.stringify(val));
          return [...val];
        }
      } catch (err) {
        console.error('Supabase fetchGlazingOutConfigs error:', err);
      }
    }
    return this.getGlazingOutConfigsSync();
  },

  getGlazingOutConfigs(): import('./types').GlazingOutConfig[] & Promise<import('./types').GlazingOutConfig[]> {
    const syncData = this.getGlazingOutConfigsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchGlazingOutConfigs() : undefined);
  },

  async saveGlazingOutConfigs(configs: import('./types').GlazingOutConfig[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.GLAZING_OUT_CONFIGS, JSON.stringify(configs));
    cache[STORAGE_KEYS.GLAZING_OUT_CONFIGS] = configs;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.GLAZING_OUT_CONFIGS,
          value: configs,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveGlazingOutConfigs error:', err);
      }
    }
  },

  getQuickPrintPartsSync(): {id: string, name: string, quantity: number}[] {
    return getCached(STORAGE_KEYS.QUICK_PRINT_PARTS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.QUICK_PRINT_PARTS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchQuickPrintParts(): Promise<{id: string, name: string, quantity: number}[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error }: any = await (supabase.from('system_settings').select(DB_COLUMNS.SYSTEM_SETTINGS) as any).eq('key', STORAGE_KEYS.QUICK_PRINT_PARTS).single();
        if (!error && data && data.value) {
          const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          cache[STORAGE_KEYS.QUICK_PRINT_PARTS] = val;
          localStorage.setItem(STORAGE_KEYS.QUICK_PRINT_PARTS, JSON.stringify(val));
          return [...val];
        }
      } catch (err) {
        console.error('Supabase fetchQuickPrintParts error:', err);
      }
    }
    return this.getQuickPrintPartsSync();
  },

  getQuickPrintParts(): {id: string, name: string, quantity: number}[] & Promise<{id: string, name: string, quantity: number}[]> {
    const syncData = this.getQuickPrintPartsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchQuickPrintParts() : undefined);
  },

  async saveQuickPrintParts(parts: {id: string, name: string, quantity: number}[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.QUICK_PRINT_PARTS, JSON.stringify(parts));
    cache[STORAGE_KEYS.QUICK_PRINT_PARTS] = parts;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.QUICK_PRINT_PARTS,
          value: parts,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveQuickPrintParts error:', err);
      }
    }
  },

  getGlazingPlanNormsSync(): import('./types').GlazingPlanNorm[] {
    return getCached(STORAGE_KEYS.GLAZING_PLAN_NORMS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_PLAN_NORMS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchGlazingPlanNorms(): Promise<import('./types').GlazingPlanNorm[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error }: any = await (supabase.from('system_settings').select(DB_COLUMNS.SYSTEM_SETTINGS) as any).eq('key', STORAGE_KEYS.GLAZING_PLAN_NORMS).single();
        if (!error && data && data.value) {
          const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          cache[STORAGE_KEYS.GLAZING_PLAN_NORMS] = val;
          localStorage.setItem(STORAGE_KEYS.GLAZING_PLAN_NORMS, JSON.stringify(val));
          return [...val];
        }
      } catch (err) {
        console.error('Supabase fetchGlazingPlanNorms error:', err);
      }
    }
    return this.getGlazingPlanNormsSync();
  },

  getGlazingPlanNorms(): import('./types').GlazingPlanNorm[] & Promise<import('./types').GlazingPlanNorm[]> {
    const syncData = this.getGlazingPlanNormsSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchGlazingPlanNorms() : undefined);
  },

  async saveGlazingPlanNorms(norms: import('./types').GlazingPlanNorm[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.GLAZING_PLAN_NORMS, JSON.stringify(norms));
    cache[STORAGE_KEYS.GLAZING_PLAN_NORMS] = norms;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.GLAZING_PLAN_NORMS,
          value: norms,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveGlazingPlanNorms error:', err);
      }
    }
  },

  getGlazingPlansSync(): import('./types').GlazingPlan[] {
    return getCached(STORAGE_KEYS.GLAZING_PLANS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_PLANS);
      return data ? JSON.parse(data) : [];
    });
  },

  async fetchGlazingPlans(): Promise<import('./types').GlazingPlan[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('glazing_plans').select(DB_COLUMNS.GLAZING_PLANS);
        if (!error && data) {
          const plans = data.map(rowToGlazingPlan);
          cache[STORAGE_KEYS.GLAZING_PLANS] = plans;
          localStorage.setItem(STORAGE_KEYS.GLAZING_PLANS, JSON.stringify(plans));
          return [...plans];
        }
      } catch (err) {
        console.error('Supabase fetchGlazingPlans error:', err);
      }
    }
    return this.getGlazingPlansSync();
  },

  getGlazingPlans(): import('./types').GlazingPlan[] & Promise<import('./types').GlazingPlan[]> {
    const syncData = this.getGlazingPlansSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchGlazingPlans() : undefined);
  },

  async saveGlazingPlans(plans: import('./types').GlazingPlan[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.GLAZING_PLANS, JSON.stringify(plans));
    cache[STORAGE_KEYS.GLAZING_PLANS] = plans;
    if (isSupabaseConfigured) {
      try {
        if (plans.length > 0) {
          await supabase.from('glazing_plans').upsert(plans.map(glazingPlanToRow));
        }
      } catch (err) {
        console.error('Supabase saveGlazingPlans error:', err);
      }
    }
  },

  getPeoplePerDay(): Record<string, number> {
    return getCached(STORAGE_KEYS.PEOPLE_PER_DAY, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PEOPLE_PER_DAY);
      return data ? JSON.parse(data) : {};
    });
  },

  async savePeoplePerDay(record: Record<string, number>): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.PEOPLE_PER_DAY, JSON.stringify(record));
    cache[STORAGE_KEYS.PEOPLE_PER_DAY] = record;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.PEOPLE_PER_DAY,
          value: record,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase savePeoplePerDay error:', err);
      }
    }
  },

  getMandaysPerDay(): Record<string, number> {
    return getCached(STORAGE_KEYS.MANDAYS_PER_DAY, () => {
      const data = localStorage.getItem(STORAGE_KEYS.MANDAYS_PER_DAY);
      return data ? JSON.parse(data) : {};
    });
  },

  async saveMandaysPerDay(record: Record<string, number>): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.MANDAYS_PER_DAY, JSON.stringify(record));
    cache[STORAGE_KEYS.MANDAYS_PER_DAY] = record;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.MANDAYS_PER_DAY,
          value: record,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveMandaysPerDay error:', err);
      }
    }
  },

  getExportWeekName(): string {
    return getCached(STORAGE_KEYS.EXPORT_WEEK_NAME, () => {
      return localStorage.getItem(STORAGE_KEYS.EXPORT_WEEK_NAME) || "";
    });
  },

  async saveExportWeekName(weekName: string): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.EXPORT_WEEK_NAME, weekName);
    cache[STORAGE_KEYS.EXPORT_WEEK_NAME] = weekName;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.EXPORT_WEEK_NAME,
          value: weekName,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveExportWeekName error:', err);
      }
    }
  },

  getHourlyPeoplePainting(): Record<string, number> {
    return getCached(STORAGE_KEYS.HOURLY_PEOPLE_PAINTING, () => {
      const data = localStorage.getItem(STORAGE_KEYS.HOURLY_PEOPLE_PAINTING);
      return data ? JSON.parse(data) : {};
    });
  },

  async saveHourlyPeoplePainting(record: Record<string, number>): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.HOURLY_PEOPLE_PAINTING, JSON.stringify(record));
    cache[STORAGE_KEYS.HOURLY_PEOPLE_PAINTING] = record;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.HOURLY_PEOPLE_PAINTING,
          value: record,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveHourlyPeoplePainting error:', err);
      }
    }
  },

  getHourlyPeopleGlazing(): Record<string, number> {
    return getCached(STORAGE_KEYS.HOURLY_PEOPLE_GLAZING, () => {
      const data = localStorage.getItem(STORAGE_KEYS.HOURLY_PEOPLE_GLAZING);
      return data ? JSON.parse(data) : {};
    });
  },

  async saveHourlyPeopleGlazing(record: Record<string, number>): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.HOURLY_PEOPLE_GLAZING, JSON.stringify(record));
    cache[STORAGE_KEYS.HOURLY_PEOPLE_GLAZING] = record;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.HOURLY_PEOPLE_GLAZING,
          value: record,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveHourlyPeopleGlazing error:', err);
      }
    }
  },

  getHourlyPeopleBending(): Record<string, number> {
    return getCached(STORAGE_KEYS.HOURLY_PEOPLE_BENDING, () => {
      const data = localStorage.getItem(STORAGE_KEYS.HOURLY_PEOPLE_BENDING);
      return data ? JSON.parse(data) : {};
    });
  },

  async saveHourlyPeopleBending(record: Record<string, number>): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.HOURLY_PEOPLE_BENDING, JSON.stringify(record));
    cache[STORAGE_KEYS.HOURLY_PEOPLE_BENDING] = record;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.HOURLY_PEOPLE_BENDING,
          value: record,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveHourlyPeopleBending error:', err);
      }
    }
  },

  getHourlyPeopleWelding(): Record<string, number> {
    return getCached(STORAGE_KEYS.HOURLY_PEOPLE_WELDING, () => {
      const data = localStorage.getItem(STORAGE_KEYS.HOURLY_PEOPLE_WELDING);
      return data ? JSON.parse(data) : {};
    });
  },

  async saveHourlyPeopleWelding(record: Record<string, number>): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.HOURLY_PEOPLE_WELDING, JSON.stringify(record));
    cache[STORAGE_KEYS.HOURLY_PEOPLE_WELDING] = record;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.HOURLY_PEOPLE_WELDING,
          value: record,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveHourlyPeopleWelding error:', err);
      }
    }
  },

  getBendingWeldingHSQD(): { partId: string; hsqd: number }[] {
    return getCached(STORAGE_KEYS.BENDING_WELDING_HSQD, () => {
      const data = localStorage.getItem(STORAGE_KEYS.BENDING_WELDING_HSQD);
      return data ? JSON.parse(data) : [];
    });
  },

  async saveBendingWeldingHSQD(data: { partId: string; hsqd: number }[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.BENDING_WELDING_HSQD, JSON.stringify(data));
    cache[STORAGE_KEYS.BENDING_WELDING_HSQD] = data;
    if (isSupabaseConfigured) {
      try {
        await supabase.from('system_settings').upsert({
          key: STORAGE_KEYS.BENDING_WELDING_HSQD,
          value: data,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase saveBendingWeldingHSQD error:', err);
      }
    }
  },

  createGlazingPlan(modelId: string, quantity: number, targetCompletion: number) {
    const plans = this.getGlazingPlans();
    const schedule = this.getGlazingSchedule(modelId, quantity, targetCompletion);
    
    const newPlan: import('./types').GlazingPlan = {
      id: `GLZ-PLN-${Date.now()}`,
      modelId,
      targetQuantity: quantity,
      targetCompletionTime: targetCompletion,
      plannedStartTime: schedule.start,
      expectedCompletionTime: schedule.end,
      createdAt: Date.now(),
      status: 'PENDING'
    };
    plans.push(newPlan);
    this.saveGlazingPlans(plans);
    return newPlan;
  },

  getGlazingSchedule(modelId: string, quantity: number, targetCompletion: number) {
    const norms = this.getGlazingPlanNorms().filter(n => n.appliedModel === modelId);
    const shiftConfigs = this.getShiftConfigs();
    const glazingConfig = shiftConfigs.find(c => c.stageId === 'GLAZING');
    const workerCount = glazingConfig?.workerCount || 2;

    const totalDurationMs = norms.length > 0 
      ? norms.reduce((sum, n) => sum + (n.norm * quantity * 1000) / workerCount, 0)
      : (quantity * 300 * 1000) / workerCount; // Default 5 min per unit if no norms

    const runForward = (baseStartTime: number) => {
      const actualStart = this.getNextWorkingTime(baseStartTime, 'GLAZING', shiftConfigs);
      const end = this.calculateEndTime(actualStart, totalDurationMs, 'GLAZING', shiftConfigs);
      return { start: actualStart, end };
    };

    let low = targetCompletion - 60 * 24 * 60 * 60 * 1000;
    let high = targetCompletion;
    let best = runForward(low);

    for (let i = 0; i < 60; i++) {
      const mid = low + Math.floor((high - low) / 2);
      const res = runForward(mid);
      if (res.end <= targetCompletion) {
        best = res;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  },

  calculateGlazingStartTime(modelId: string, quantity: number, targetCompletion: number) {
    const schedule = this.getGlazingSchedule(modelId, quantity, targetCompletion);
    return schedule.start;
  },

  deleteGlazingPlan(id: string) {
    const plans = this.getGlazingPlans().filter(p => p.id !== id);
    this.saveGlazingPlans(plans);
  },

  completeGlazingPlan(id: string) {
    const plans = this.getGlazingPlans();
    const planIndex = plans.findIndex(p => p.id === id);
    if (planIndex !== -1) {
      plans[planIndex].status = 'COMPLETED';
      this.saveGlazingPlans(plans);
    }
  },

  updateGlazingPlanProgress(planId: string, partId: string, quantity: number) {
    const plans = this.getGlazingPlans();
    const planIndex = plans.findIndex(p => p.id === planId);
    if (planIndex !== -1) {
      const plan = plans[planIndex];
      const producedQuantities = { ...(plan.producedQuantities || {}) };
      producedQuantities[partId] = (producedQuantities[partId] || 0) + quantity;
      
      plans[planIndex] = { ...plan, producedQuantities, status: 'IN_PROGRESS' };
      this.saveGlazingPlans(plans);
    }
  },

  updateGlazingPlanPrinted(planId: string, partId: string, quantity: number) {
    const plans = this.getGlazingPlans();
    const planIndex = plans.findIndex(p => p.id === planId);
    if (planIndex !== -1) {
      const plan = plans[planIndex];
      const printedQuantities = { ...(plan.printedQuantities || {}) };
      printedQuantities[partId] = (printedQuantities[partId] || 0) + quantity;
      plans[planIndex] = { ...plan, printedQuantities };
      this.saveGlazingPlans(plans);
    }
  },

  getInventory(): InventoryItem[] {
    const data = getCached(STORAGE_KEYS.INVENTORY, () => {
      const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
      return data ? JSON.parse(data) : [];
    });
    return [...data];
  },

  getTransactions(): Transaction[] {
    const data = getCached(STORAGE_KEYS.TRANSACTIONS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      let parsed = data ? JSON.parse(data) : [];
      // Optimal optimization: Auto purge data older than 35 days to save local storage limit
      const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
      const initialLength = parsed.length;
      parsed = parsed.filter((t: any) => t.timestamp >= cutoff);
      if (parsed.length !== initialLength) {
        localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(parsed));
      }
      return parsed;
    });
    return [...data];
  },

  saveInventory(inventory: InventoryItem[]) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
    cache[STORAGE_KEYS.INVENTORY] = inventory;
    if (isSupabaseConfigured && inventory.length > 0) {
      safeRun(supabase.from('inventory').upsert(inventory.map(invToRow)), 'saveInventory');
    }
  },

  async fetchInventory(): Promise<InventoryItem[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('inventory').select(DB_COLUMNS.INVENTORY);
        if (!error && data) {
          const inv = data.map(rowToInv);
          cache[STORAGE_KEYS.INVENTORY] = inv;
          localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inv));
          return [...inv];
        }
      } catch (err) {
        console.error('Supabase fetchInventory error:', err);
      }
    }
    return this.getInventory();
  },

  async fetchTransactions(): Promise<Transaction[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('transactions').select(DB_COLUMNS.TRANSACTIONS).order('timestamp', { ascending: false }).limit(100);
        if (!error && data) {
          const txs = data.map(rowToTx);
          cache[STORAGE_KEYS.TRANSACTIONS] = txs;
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
          return [...txs];
        }
      } catch (err) {
        console.error('Supabase fetchTransactions error:', err);
      }
    }
    return this.getTransactions();
  },

  async fetchLabels(): Promise<Transaction[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('labels').select(DB_COLUMNS.LABELS).order('timestamp', { ascending: false }).limit(100);
        if (!error && data) {
          const lbls = data.map(rowToTx);
          cache['wip_labels'] = lbls;
          localStorage.setItem('wip_labels', JSON.stringify(lbls));
          return [...lbls];
        }
      } catch (err) {
        console.error('Supabase fetchLabels error:', err);
      }
    }
    return this.getLabels();
  },

  async persistTransaction(tx: Transaction): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        await supabase.from('transactions').insert(txToRow(tx));
      } catch (err) {
        console.error('Supabase persistTransaction error:', err);
      }
    }
  },

  saveTransactions(transactions: Transaction[]) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    cache[STORAGE_KEYS.TRANSACTIONS] = transactions;
  },

  saveLabels(labels: Transaction[]) {
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
  },

  getLabels(): Transaction[] {
    const data = getCached('wip_labels', () => {
      const data = localStorage.getItem('wip_labels');
      let parsed = data ? JSON.parse(data) : [];
      // Optimal optimization: Auto purge data older than 35 days from local storage
      const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
      const initialLength = parsed.length;
      parsed = parsed.filter((t: any) => t.timestamp >= cutoff);
      if (parsed.length !== initialLength) {
        localStorage.setItem('wip_labels', JSON.stringify(parsed));
      }
      return parsed;
    });
    return [...data];
  },

  saveLabel(label: Transaction) {
    const labels = [label, ...this.getLabels()];
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
    if (isSupabaseConfigured) {
      safeRun(supabase.from('labels').upsert(txToRow(label)), 'saveLabel');
    }
  },

  deleteLabel(id: string) {
    const labels = this.getLabels().filter(l => l.id !== id);
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
    if (isSupabaseConfigured) {
      safeRun(supabase.from('labels').delete().eq('id', id), 'deleteLabel');
    }
  },

  markLabelAsPrinted(id: string) {
    const labels = this.getLabels().map(l => l.id === id ? { ...l, printed: true } : l);
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
    if (isSupabaseConfigured) {
      safeRun(supabase.from('labels').update({ printed: true }).eq('id', id), 'markLabelAsPrinted');
    }
  },

  rollbackTransaction(txId: string) {
    const transactions = this.getTransactions();
    const txIndex = transactions.findIndex(t => t.id === txId);
    
    if (txIndex === -1) {
      // Check labels if not in transactions
      const labels = this.getLabels();
      const label = labels.find(l => l.id === txId);
      if (!label) return;
      
      // Rollback logic for label (Export)
      // 1. Add back to inventory (OUT location is "OK" stock for the stage) (Only if it's not a Quick Print label which doesn't deduct inventory)
      if (!label.planId) {
        this.updateInventory(label.partId, label.stageId, 'OUT', label.quantity);
      }
      
      // 2. Update PO exportedQuantity if label has poId
      if (label.poId) {
        const pos = this.getProductionOrders();
        const po = pos.find(p => p.id === label.poId);
        if (po) {
          po.exportedQuantity = Math.max(0, (po.exportedQuantity || 0) - label.quantity);
          po.status = 'IN_PROGRESS';
          po.completedAt = undefined;
          
          if (po.masterPoId) {
            const masterPo = pos.find(p => p.id === po.masterPoId);
            if (masterPo) {
              masterPo.status = 'IN_PROGRESS';
              masterPo.completedAt = undefined;
            }
          }
          this.saveProductionOrders(pos);
        }
      }
      
      // Rollback Glazing Plan progress if planId exists
      if (label.planId) {
        const plans = this.getGlazingPlans();
        const planIndex = plans.findIndex(p => p.id === label.planId);
        if (planIndex > -1) {
          const plan = plans[planIndex];
          if (plan.producedQuantities && plan.producedQuantities[label.partId]) {
            plan.producedQuantities[label.partId] = Math.max(0, plan.producedQuantities[label.partId] - label.quantity);
          }
          plan.status = 'IN_PROGRESS';
          this.saveGlazingPlans(plans);
        }
      }

      this.deleteLabel(txId);
      return;
    }

    const tx = transactions[txIndex];
    
    // Rollback for standard transactions (STAGE_IN / STAGE_OUT)
    // 1. Revert inventory
    if (tx.type === 'STAGE_IN') {
      // If it was an inbound, deduct from inventory
      this.updateInventory(tx.partId, tx.stageId, tx.location || 'IN', -tx.quantity, tx.originalPartId);
      
      // If it updated producedQuantity (usually for OUT location inbound)
      if (tx.location === 'OUT' && tx.poId) {
        const pos = this.getProductionOrders();
        const po = pos.find(p => p.id === tx.poId);
        if (po) {
          po.producedQuantity = Math.max(0, po.producedQuantity - tx.quantity);
          po.status = 'IN_PROGRESS';
          po.completedAt = undefined;

          if (po.masterPoId) {
            const masterPo = pos.find(p => p.id === po.masterPoId);
            if (masterPo) {
              masterPo.status = 'IN_PROGRESS';
              masterPo.completedAt = undefined;
            }
          }
          this.saveProductionOrders(pos);
        }
      }
    } else if (tx.type === 'STAGE_OUT' || tx.type === 'DISPOSAL') {
      // If it was an outbound/disposal, add back to inventory
      this.updateInventory(tx.partId, tx.stageId, tx.location || 'OUT', tx.quantity, tx.originalPartId);

      // Rollback PO progress for STAGE_OUT
      if (tx.type === 'STAGE_OUT' && tx.poId) {
        const pos = this.getProductionOrders();
        const po = pos.find(p => p.id === tx.poId);
        if (po) {
          if (tx.location === 'IN') {
            // Rollback Move In -> Out (increased producedQty)
            po.producedQuantity = Math.max(0, po.producedQuantity - tx.quantity);
          } else if (tx.location === 'OUT') {
            // Rollback Export (increased exportedQty)
            po.exportedQuantity = Math.max(0, (po.exportedQuantity || 0) - tx.quantity);
            // If producedQuantity was automatically bumped to match exportedQty, pull it back too
            if (po.producedQuantity > po.exportedQuantity) {
               // We only pull back if it's likely it was bumped
               // A better way is to check the transaction history, but staying simple:
               // If producedQuantity == exportedQuantity (after subtracting), then it was likely synced
            }
            // Simple heuristic: if we were at 100/100 and rollback 100 export, go to 0/0
            if (po.producedQuantity > po.exportedQuantity + tx.quantity * 0.1) { 
               // If there was significantly more produced than exported, keep produced as is?
               // Actually, let's just match them if produced was only driven by export
               po.producedQuantity = Math.max(po.exportedQuantity, po.producedQuantity - tx.quantity);
            } else {
               po.producedQuantity = Math.max(0, po.producedQuantity - tx.quantity);
            }
          }
          po.status = 'IN_PROGRESS';
          po.completedAt = undefined;
          
          if (po.masterPoId) {
            const masterPo = pos.find(p => p.id === po.masterPoId);
            if (masterPo) {
              masterPo.status = 'IN_PROGRESS';
              masterPo.completedAt = undefined;
            }
          }
          this.saveProductionOrders(pos);
        }
      }
    }

    // Remove from transactions
    transactions.splice(txIndex, 1);
    this.saveTransactions(transactions);
    
    // Also remove any related labels if exist
    this.deleteLabel(txId);
    if (isSupabaseConfigured) {
      safeRun(supabase.from('transactions').delete().eq('id', txId), 'rollbackTransaction delete tx');
    }
  },

  getEffectivePartId(partId: string, stageId: StageId, poId?: string): string {
    if (!partId) return '';
    
    const transformationsList = this.getTransformations();
    const stageTransformations = transformationsList.filter(t => t.targetStageId === stageId);
    if (stageTransformations.length === 0) return partId;

    const std = (s: string) => s ? s.normalize('NFC').trim() : '';
    const inputStd = std(partId);
    const inputUpper = inputStd.toUpperCase();

    // Lấy thông tin từ danh mục để có Tên đầy đủ (vì Quy tắc thường lưu theo Tên)
    const parts = this.getParts();
    const partInCatalog = parts.find(p => p.id === partId || p.name === partId);
    const partIdInCatalog = partInCatalog ? std(partInCatalog.id) : '';
    const partNameInCatalog = partInCatalog ? std(partInCatalog.name) : '';

    let candidates = stageTransformations.filter(t => {
      const sId = std(t.sourcePartId);
      const sIdUpper = sId.toUpperCase();
      
      // 1. So khớp trực tiếp với chuỗi đầu vào
      if (sId === inputStd || sIdUpper === inputUpper) return true;
      
      // 2. So khớp với ID hoặc Tên từ danh mục linh kiện
      if (partIdInCatalog && (sId === partIdInCatalog || sIdUpper === partIdInCatalog.toUpperCase())) return true;
      if (partNameInCatalog && (sId === partNameInCatalog || sIdUpper === partNameInCatalog.toUpperCase())) return true;

      // 3. Chuẩn hóa nâng cao (bỏ tiền tố, hậu tố nhiễu)
      const normalize = (str: string) => {
        let res = str.toUpperCase().normalize('NFC');
        res = res.replace(/^(TẤM|CHI TIẾT|PHỤ TÙNG|BẢN|KHO|THÀNH PHẨM|L-)\s+/g, '');
        res = res.replace(/\s*-\s*(CD|H|C|P|G|W|B|L)$/g, ''); 
        return res.split(' (')[0].split('(')[0].trim();
      };
      
      const normRule = normalize(sId);
      if (normRule === normalize(inputStd)) return true;
      if (partNameInCatalog && normRule === normalize(partNameInCatalog)) return true;

      return false;
    });

    if (candidates.length === 0) return partId;

    let bestMatch = candidates[0];
    if (poId) {
      const orders = this.getProductionOrders();
      const po = orders.find(p => p.id === poId);
      const parentPoId = po?.masterPoId || poId;
      const modelPo = orders.find(p => p.id === parentPoId);
      
      if (modelPo) {
        const modelId = modelPo.partId.toUpperCase();
        const modelMatch = candidates.find(t => 
          t.applicableModel && 
          (modelId === t.applicableModel.trim().toUpperCase() || modelId.includes(t.applicableModel.trim().toUpperCase()))
        );
        if (modelMatch) bestMatch = modelMatch;
      }
    } else {
      const generic = candidates.find(t => !t.applicableModel || t.applicableModel.trim() === '');
      if (generic) bestMatch = generic;
    }

    const targetPartIdStr = bestMatch.targetPartId;
    // Map targetPartIdStr to catalog ID if catalog has it
    const upperTargetStr = targetPartIdStr.toUpperCase().normalize('NFC').replace(/\s+/g, '');
    const targetCatalogPart = parts.find(p => {
      const pId = p.id.toUpperCase();
      const pName = p.name.toUpperCase();
      if (p.id === targetPartIdStr || p.name === targetPartIdStr || pId === targetPartIdStr.toUpperCase() || pName === targetPartIdStr.toUpperCase()) return true;
      
      const combined1 = (pName + pId).normalize('NFC').replace(/\s+/g, '');
      const combined2 = (pId + pName).normalize('NFC').replace(/\s+/g, '');
      if (upperTargetStr === combined1 || upperTargetStr === combined2) return true;
      
      // If the target string contains the ID (which is usually highly specific) and it's longer than 5 chars
      if (pId.length > 5 && upperTargetStr.includes(pId.normalize('NFC').replace(/\s+/g, ''))) return true;
      
      return false;
    });
    return targetCatalogPart ? targetCatalogPart.id : targetPartIdStr;
  },

  setAbsoluteInventory(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', newQuantity: number) {
    const inventory = this.getInventory();
    const cleanIdUpper = partId.trim().toUpperCase();
    const parts = this.getParts();
    const partInCatalog = parts.find(p => p.id.toUpperCase() === cleanIdUpper || p.name.toUpperCase().trim() === cleanIdUpper);
    const targetNameUpper = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';

    // Remove all existing matching entries
    const newInventory = inventory.filter(item => {
      const itemPartId = item.partId.toUpperCase().trim();
      const matchesPart = itemPartId === cleanIdUpper || (targetNameUpper && itemPartId === targetNameUpper);
      return !(matchesPart && item.stageId === stageId && item.location === location);
    });

    const targetPartId = partInCatalog ? partInCatalog.id : cleanIdUpper;

    // Add back the new quantity if > 0
    if (newQuantity > 0) {
      newInventory.push({
        partId: targetPartId,
        stageId,
        location,
        quantity: newQuantity
      });
    }

    this.saveInventory(newInventory);

    if (isSupabaseConfigured) {
      const id = `${targetPartId}_${stageId}_${location}_NONE`;
      if (newQuantity <= 0) {
        safeRun(supabase.from('inventory').delete().eq('id', id), 'setAbsoluteInventory delete');
      } else {
        safeRun(supabase.from('inventory').upsert(invToRow({
          partId: targetPartId,
          stageId,
          location,
          quantity: newQuantity
        })), 'setAbsoluteInventory upsert');
      }
    }
  },

  updateInventory(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', delta: number, originalPartId?: string) {
    const inventory = this.getInventory();
    const parts = this.getParts();
    
    // Find absolute correct case in catalog if exists
    const cleanIdUpper = partId.trim().toUpperCase();
    const cleanOrigIdUpper = originalPartId?.trim().toUpperCase() || '';
    
    const partInCatalog = parts.find(p => p.id.toUpperCase() === cleanIdUpper || p.name.toUpperCase().trim() === cleanIdUpper);
    const targetId = partInCatalog ? partInCatalog.id : partId.trim();
    const targetNameUpper = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';
    
    const origPartInCatalog = originalPartId ? parts.find(p => p.id.toUpperCase() === cleanOrigIdUpper || p.name.toUpperCase().trim() === cleanOrigIdUpper) : undefined;
    const targetOrigId = origPartInCatalog ? origPartInCatalog.id : (originalPartId?.trim() || '');

    const index = inventory.findIndex(
      (item) => {
        const itemPartId = item.partId.toUpperCase().trim();
        const itemOrigId = (item.originalPartId || '').toUpperCase().trim();
        const matchesPart = itemPartId === cleanIdUpper || (targetNameUpper && itemPartId === targetNameUpper);
        return matchesPart && item.stageId === stageId && item.location === location && itemOrigId === cleanOrigIdUpper;
      }
    );

    if (index >= 0) {
      inventory[index].quantity += delta;
      inventory[index].quantity = Math.round(inventory[index].quantity * 10000) / 10000;
      if (inventory[index].quantity < 0) inventory[index].quantity = 0;
      // Option: update it to the proper case if it was wrong
      inventory[index].partId = targetId; 
      if (targetOrigId) inventory[index].originalPartId = targetOrigId;
    } else {
      if (delta > 0) {
        inventory.push({ 
          partId: targetId, 
          originalPartId: targetOrigId || undefined,
          stageId, 
          location, 
          quantity: Math.max(0, delta) 
        });
      }
    }

    this.saveInventory(inventory);

    if (isSupabaseConfigured) {
      const orig = targetOrigId || 'NONE';
      const id = `${targetId}_${stageId}_${location}_${orig}`;
      const item = index >= 0 ? inventory[index] : inventory[inventory.length - 1];
      if (item) {
        if (item.quantity <= 0) {
          safeRun(supabase.from('inventory').delete().eq('id', id), 'updateInventory delete');
        } else {
          safeRun(supabase.from('inventory').upsert(invToRow(item)), 'updateInventory upsert');
        }
      }
    }
  },

  setInventoryQuantity(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', quantity: number, originalPartId?: string) {
    const inventory = this.getInventory();
    const parts = this.getParts();
    
    // Find absolute correct case in catalog if exists
    const cleanIdUpper = partId.trim().toUpperCase();
    const cleanOrigIdUpper = originalPartId?.trim().toUpperCase() || '';
    
    const partInCatalog = parts.find(p => p.id.toUpperCase() === cleanIdUpper || p.name.toUpperCase().trim() === cleanIdUpper);
    const targetId = partInCatalog ? partInCatalog.id : partId.trim();
    const targetNameUpper = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';

    const origPartInCatalog = originalPartId ? parts.find(p => p.id.toUpperCase() === cleanOrigIdUpper || p.name.toUpperCase().trim() === cleanOrigIdUpper) : undefined;
    const targetOrigId = origPartInCatalog ? origPartInCatalog.id : (originalPartId?.trim() || '');

    const index = inventory.findIndex(
      (item) => {
        const itemPartId = item.partId.toUpperCase().trim();
        const itemOrigId = (item.originalPartId || '').toUpperCase().trim();
        const matchesPart = itemPartId === cleanIdUpper || (targetNameUpper && itemPartId === targetNameUpper);
        return matchesPart && item.stageId === stageId && item.location === location && itemOrigId === cleanOrigIdUpper;
      }
    );

    if (index >= 0) {
      inventory[index].quantity = Math.max(0, quantity);
      inventory[index].partId = targetId;
      if (targetOrigId) inventory[index].originalPartId = targetOrigId;
    } else {
      inventory.push({ 
        partId: targetId, 
        originalPartId: targetOrigId || undefined,
        stageId, 
        location, 
        quantity: Math.max(0, quantity) 
      });
    }

    this.saveInventory(inventory);

    if (isSupabaseConfigured) {
      const orig = targetOrigId || 'NONE';
      const id = `${targetId}_${stageId}_${location}_${orig}`;
      if (quantity <= 0) {
        safeRun(supabase.from('inventory').delete().eq('id', id), 'setInventoryQuantity delete');
      } else {
        safeRun(supabase.from('inventory').upsert(invToRow({
          partId: targetId,
          originalPartId: targetOrigId || undefined,
          stageId,
          location,
          quantity: Math.max(0, quantity)
        })), 'setInventoryQuantity upsert');
      }
    }
  },

  deleteInventoryItem(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', originalPartId?: string) {
    const inventory = this.getInventory();
    const parts = this.getParts();
    const cleanIdUpper = partId.trim().toUpperCase();
    const cleanOrigIdUpper = originalPartId?.trim().toUpperCase() || '';

    const partInCatalog = parts.find(p => p.id.toUpperCase() === cleanIdUpper || p.name.toUpperCase().trim() === cleanIdUpper);
    const targetNameUpper = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';
    const targetId = partInCatalog ? partInCatalog.id : cleanIdUpper;
    const origPartInCatalog = originalPartId ? parts.find(p => p.id.toUpperCase() === cleanOrigIdUpper || p.name.toUpperCase().trim() === cleanOrigIdUpper) : undefined;
    const targetOrigId = origPartInCatalog ? origPartInCatalog.id : (originalPartId?.trim() || '');

    const filtered = inventory.filter(
      (item) => {
        const itemPartId = item.partId.toUpperCase().trim();
        const itemOrigId = (item.originalPartId || '').toUpperCase().trim();
        const matchesPart = itemPartId === cleanIdUpper || (targetNameUpper && itemPartId === targetNameUpper);
        return !(matchesPart && item.stageId === stageId && item.location === location && itemOrigId === cleanOrigIdUpper);
      }
    );
    this.saveInventory(filtered);

    if (isSupabaseConfigured) {
      const orig = targetOrigId || 'NONE';
      const id = `${targetId}_${stageId}_${location}_${orig}`;
      safeRun(supabase.from('inventory').delete().eq('id', id), 'deleteInventoryItem');
    }
  },

  applyBOMDeduction(partId: string, stageId: StageId, quantity: number, poId?: string) {
    const parts = this.getParts();
    // Strip suffixes added by display logic (e.g., " - CD", " - H") to ensure BOM lookups match the original part ID
    const cleanId = partId.startsWith('GLZ-OUT-') ? partId : partId.split(' - ')[0];

    let currentModelId: string | undefined;
    if (poId) {
      const parentPoId = this.getProductionOrders().find(p => p.id === poId)?.masterPoId || poId;
      currentModelId = this.getProductionOrders().find(p => p.id === parentPoId)?.partId;
    }
    
    // Laser stage specific logic (BOM V1):
    // Deduct Level 3 parts from Laser IN based on BOM when Level 2 is produced
    if (stageId === 'LASER') {
      const bom = this.getBOM();
      const bomDef = bom.find(b => b.childPartId === cleanId);
      
      if (bomDef) {
        const totalConsumption = quantity * (bomDef.componentWeight + bomDef.scrapWeight);
        const totalScrap = quantity * bomDef.scrapWeight;
        
        const inventory = this.getInventory();
        const matchingStocks = inventory.filter(i => {
          const itPartId = i.partId.toUpperCase();
          const targetId = bomDef.parentPartId.toUpperCase();
          return itPartId === targetId && i.stageId === 'LASER' && i.location === 'IN';
        });
        const totalStock = matchingStocks.reduce((sum, i) => sum + i.quantity, 0);
        
        if (totalStock < totalConsumption) {
          const parentPart = parts.find(p => p.id === bomDef.parentPartId);
          throw new Error(`Lỗi: Không đủ tồn kho ${parentPart?.name || bomDef.parentPartId} tại LASER_IN. Cần ${totalConsumption.toFixed(4)} kg, hiện có ${totalStock} kg`);
        }
        
        let remainingToDeduct = totalConsumption;
        for (const stock of matchingStocks) {
          if (remainingToDeduct <= 0) break;
          const toTake = Math.min(stock.quantity, remainingToDeduct);
          this.updateInventory(stock.partId, 'LASER', 'IN', -toTake, stock.originalPartId);
          remainingToDeduct -= toTake;
        }
        const scrapPart = parts.find(p => p.id === 'PL-TON-SX' || p.name.toLowerCase().includes('phế liệu'));
        if (scrapPart) {
          this.updateInventory(scrapPart.id, 'LASER', 'OUT', totalScrap);
        }
      }
    }

    // Welding stage specific logic (BOM V2):
    if (stageId === 'WELDING') {
      const bomV2 = this.getBOMV2();
      // Only deduct ingredients that DON'T skip welding
      const allIngredients = bomV2.filter(b => b.resultPartId === cleanId && (!b.applicableModel || b.applicableModel === currentModelId));
      const ingredients = allIngredients.filter(ing => {
        const p = parts.find(part => part.id === ing.ingredientPartId);
        return !p?.skipWelding;
      });
      
      if (ingredients.length > 0) {
        const inventory = this.getInventory();
        for (const ing of ingredients) {
          const needed = quantity * ing.quantity;
          const effectiveIngId = this.getEffectivePartId(ing.ingredientPartId, 'WELDING', poId);
          
          const partInCatalog = parts.find(p => p.id.toUpperCase() === effectiveIngId.toUpperCase());
          const targetName = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';

          const matchingStocks = inventory.filter(i => {
            const itemPartId = i.partId.toUpperCase().trim();
            const matchesPart = itemPartId === effectiveIngId.toUpperCase() || (targetName && itemPartId === targetName);
            return matchesPart && i.stageId === 'WELDING' && i.location === 'IN';
          });
          const totalStock = matchingStocks.reduce((sum, i) => sum + i.quantity, 0);

          if (totalStock < needed) {
            const ingPart = parts.find(p => p.id === effectiveIngId);
            throw new Error(`Lỗi: Không đủ tồn kho ${ingPart?.name || effectiveIngId} tại WELDING_IN. Cần ${needed} ${ingPart?.unit || ''}, hiện có ${totalStock}`);
          }
        }
        for (const ing of ingredients) {
          const effectiveIngId = this.getEffectivePartId(ing.ingredientPartId, 'WELDING', poId);
          const partInCatalog = parts.find(p => p.id.toUpperCase() === effectiveIngId.toUpperCase());
          const targetName = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';
          const matchingStocks = inventory.filter(i => {
            const itemPartId = i.partId.toUpperCase().trim();
            const matchesPart = itemPartId === effectiveIngId.toUpperCase() || (targetName && itemPartId === targetName);
            return matchesPart && i.stageId === 'WELDING' && i.location === 'IN';
          });
          let remainingToDeduct = quantity * ing.quantity;
          for (const stock of matchingStocks) {
            if (remainingToDeduct <= 0) break;
            const toTake = Math.min(stock.quantity, remainingToDeduct);
            this.updateInventory(stock.partId, 'WELDING', 'IN', -toTake, stock.originalPartId);
            remainingToDeduct -= toTake;
          }
        }
      }
    }

    // Painting stage deduction for ingredients that skipped welding
    if (stageId === 'PAINTING') {
      // User request: Skip BOM V2 requirement when producing (IN->OUT) for Painting
      return;
    }
  },

  getNextValidStageId(partId: string, currentStageId: StageId): StageId | null {
    const parts = this.getParts();
    const part = parts.find(p => p.id === partId);
    if (!part) return null;

    const currentStageIndex = STAGES.findIndex(s => s.id === currentStageId);
    if (currentStageIndex === -1) return null;

    for (let i = currentStageIndex + 1; i < STAGES.length; i++) {
      const nextStage = STAGES[i];
      if (nextStage.id === 'LASER' && part.skipLaser) continue;
      if (nextStage.id === 'BENDING' && part.skipBending) continue;
      if (nextStage.id === 'WELDING' && part.skipWelding) continue;
      if (nextStage.id === 'PAINTING' && part.skipPainting) continue;
      return nextStage.id;
    }
    return null;
  },

  recordStageOut(partId: string, stageId: StageId, quantity: number, sourceLocation: 'IN' | 'OUT' = 'IN', targetStageId?: StageId, poId?: string, force?: boolean, customTimestamp?: number) {
    const cleanId = partId.startsWith('GLZ-OUT-') ? partId.trim().toUpperCase() : partId.split(' - ')[0].trim().toUpperCase();
    const pos = this.getProductionOrders();
    const poIndex = poId 
      ? pos.findIndex(p => p.id === poId)
      : pos.findIndex(p => p.partId === cleanId && p.stageId === stageId && p.status !== 'COMPLETED');
      
    let linkedPoId = poId;
    if (poIndex !== -1) {
      linkedPoId = pos[poIndex].id;
    }

    // Validation: Check if source location has enough quantity
    const inventory = this.getInventory();
    const effectiveId = this.getEffectivePartId(cleanId, stageId, linkedPoId);
    
    // 0. Update Production Order progress
    const isPaintingExempt = stageId === 'PAINTING' && sourceLocation === 'IN';
    if (sourceLocation === 'IN' && poIndex !== -1) {
      const po = pos[poIndex];
      // Validate PO limit before modifying state
      if (po.producedQuantity + quantity > po.targetQuantity && !isPaintingExempt && !force) {
        throw new Error(`OVER_PO:Số lượng sản xuất (${po.producedQuantity + quantity}) sẽ vượt quá mục tiêu PO (${po.targetQuantity}) cho ${cleanId} tại ${stageId}. Bạn có chắc chắn muốn báo cáo hoàn thành thêm?`);
      }
    }
    
    const partsInCatalog = this.getParts();
    const selectedPartInCatalog = partsInCatalog.find(p => p.id === cleanId || p.name === cleanId);
    const selectedPartName = selectedPartInCatalog?.name.toUpperCase();
    const selectedPartId = selectedPartInCatalog?.id.toUpperCase();

    const partInCatalogForEffectiveId = partsInCatalog.find(p => p.id.toUpperCase() === effectiveId.toUpperCase());
    const effectivePartName = partInCatalogForEffectiveId ? partInCatalogForEffectiveId.name.toUpperCase().trim() : '';

    const matchingStocks = inventory.filter((item) => {
      if (item.stageId === stageId && item.location === sourceLocation) {
        const itemPartId = item.partId.toUpperCase().trim();
        const targetId = effectiveId.toUpperCase();
        return itemPartId === targetId || (effectivePartName && itemPartId === effectivePartName);
      }
      return false;
    });
    const totalStock = matchingStocks.reduce((sum, item) => sum + item.quantity, 0);

    if (totalStock < quantity) {
      if (!force) {
        const part = this.getParts().find(p => p.id.toUpperCase() === effectiveId.toUpperCase());
        throw new Error(`Lỗi: Số lượng xuất (${quantity}) lớn hơn tổng tồn kho ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name}_${sourceLocation} (Hiện có ${totalStock})`);
      }
    }

    // 0. Update Production Order progress
    if (sourceLocation === 'IN' && poIndex !== -1) {
      const po = pos[poIndex];
      po.producedQuantity += quantity;
      const isProduced = po.producedQuantity >= po.targetQuantity;
      const isExported = (po.exportedQuantity || 0) >= po.targetQuantity;
      po.status = (isProduced && isExported) ? 'COMPLETED' : 'IN_PROGRESS';
      linkedPoId = po.id;

      if (po.masterPoId) {
        const masterPo = pos.find(p => p.id === po.masterPoId);
        if (masterPo) {
          const allSubsCompleted = po.status === 'COMPLETED' && pos.filter(p => p.masterPoId === po.masterPoId && p.id !== po.id).every(s => s.status === 'COMPLETED');
          masterPo.status = allSubsCompleted ? 'COMPLETED' : 'IN_PROGRESS';
        }
      }
      this.saveProductionOrders(pos);
    } else if (sourceLocation === 'OUT' && poIndex !== -1) {
      const po = pos[poIndex];
      if ((po.exportedQuantity || 0) + quantity > po.producedQuantity) {
        po.producedQuantity = (po.exportedQuantity || 0) + quantity;
      }
      po.exportedQuantity = (po.exportedQuantity || 0) + quantity;
      const isProduced = po.producedQuantity >= po.targetQuantity;
      const isExported = po.exportedQuantity >= po.targetQuantity;
      if (isProduced && isExported && po.status !== 'COMPLETED') po.completedAt = Date.now();
      po.status = (isProduced && isExported) ? 'COMPLETED' : 'IN_PROGRESS';

      if (po.masterPoId) {
        const masterPo = pos.find(p => p.id === po.masterPoId);
        if (masterPo && pos.filter(p => p.masterPoId === po.masterPoId).every(p => p.status === 'COMPLETED')) {
          if (masterPo.status !== 'COMPLETED') masterPo.completedAt = Date.now();
          masterPo.status = 'COMPLETED';
        }
      }
      this.saveProductionOrders(pos);
    }

    // 1. Inventory movement
    let remainingToDeduct = quantity;
    let lastOriginalId: string | undefined;
    matchingStocks.sort((a, b) => (a.originalPartId || '').localeCompare(b.originalPartId || ''));

    if (sourceLocation === 'IN') {
      this.applyBOMDeduction(cleanId, stageId, quantity, linkedPoId);
      for (const stock of matchingStocks) {
        if (remainingToDeduct <= 0) break;
        const toTake = Math.min(stock.quantity, remainingToDeduct);
        this.updateInventory(effectiveId, stageId, 'IN', -toTake, stock.originalPartId);
        this.updateInventory(effectiveId, stageId, 'OUT', toTake, stock.originalPartId);
        lastOriginalId = stock.originalPartId;
        remainingToDeduct -= toTake;
      }
    } else {
      for (const stock of matchingStocks) {
        if (remainingToDeduct <= 0) break;
        const toTake = Math.min(stock.quantity, remainingToDeduct);
        this.updateInventory(effectiveId, stageId, 'OUT', -toTake, stock.originalPartId);
        lastOriginalId = stock.originalPartId;
        remainingToDeduct -= toTake;
      }
    }

    // 2. Record transaction
    const transactions = this.getTransactions();
    const po = pos.find(p => p.id === linkedPoId);
    const masterPoId = po?.masterPoId || '';
    const subPoTargetQty = po?.targetQuantity || 0;
    const masterPo = masterPoId ? pos.find(p => p.id === masterPoId) : undefined;
    const masterPoTargetQty = masterPo?.targetQuantity || 0;
    
    const txId = Math.random().toString(36).substring(2, 12).toUpperCase();
    const timestamp = Date.now();
    const qrData = sourceLocation === 'OUT' 
      ? `${linkedPoId || effectiveId}|${quantity}|${stageId}|${timestamp}|${txId}|${targetStageId || ''}|${effectiveId}|${masterPoId}|${subPoTargetQty}|${masterPoTargetQty}`
      : undefined;

    const newTransaction: Transaction = {
      id: txId,
      type: 'STAGE_OUT',
      partId: effectiveId,
      partName: this.getParts().find(p => p.id === effectiveId)?.name || effectiveId,
      originalPartId: lastOriginalId,
      quantity,
      stageId,
      location: sourceLocation,
      targetStageId,
      timestamp: customTimestamp || Date.now(),
      qrData,
      poId: linkedPoId,
      printed: stageId === 'GLAZING' && sourceLocation === 'OUT' ? false : undefined,
      kpiRecorded: stageId === 'GLAZING' && sourceLocation === 'OUT' ? true : undefined
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    this.persistTransaction(newTransaction);

    if (qrData) {
      this.saveLabel(newTransaction);
    }

    return newTransaction;
  },

  setTransactionPrinted(txId: string, printed: boolean) {
    const transactions: Transaction[] = this.getTransactions();
    const idx = transactions.findIndex(t => t.id === txId);
    if (idx !== -1) {
      transactions[idx].printed = printed;
      // Also update in label history
      const labels: Transaction[] = this.getLabels();
      const lIdx = labels.findIndex(l => l.id === txId);
      if (lIdx !== -1) {
        labels[lIdx].printed = printed;
        this.saveLabels(labels);
      }
      this.saveTransactions(transactions);
    }
  },

  recordStageIn(qrData: string, currentStageId: StageId, targetLocation: 'IN' | 'OUT' = 'IN') {
    if (!qrData || typeof qrData !== 'string') {
      throw new Error('Mã QR không hợp lệ');
    }
    const parts = qrData.split('|');
    if (parts.length < 5) {
      throw new Error('Định dạng mã QR không hợp lệ hoặc không phải mã xuất kho OUT.');
    }
    
    // Format: poIdOrPartId|quantity|sourceStageId|timestamp|txId|targetStageId
    const [idOrPo, quantityStr, sourceStageId, , sourceTxId, targetStageId] = parts;

    if (idOrPo === 'DISPOSAL') {
      throw new Error('Lỗi: Đây là mã QR XUẤT HỦY. Hàng này không thể nhập lại vào kho sản xuất!');
    }

    const quantity = parseFloat(quantityStr);

    let partId = idOrPo.startsWith('GLZ-OUT-') ? idOrPo : idOrPo.split(' - ')[0];
    let linkedPoId: string | undefined;

    // Recognize PO IDs (PO- or REPAIR-)
    if (idOrPo.startsWith('PO-') || idOrPo.startsWith('REPAIR-')) {
      linkedPoId = idOrPo;
      const pos = this.getProductionOrders();
      const po = pos.find(p => p.id === idOrPo);
      if (po) {
        partId = po.partId;
      }
    }

    // 1. Check if this QR (Transaction ID) has already been scanned
    const transactions = this.getTransactions();
    
    // Interlock: Check if this label was marked as Defect (if we ever support that)
    const isDefect = transactions.some(tx => tx.id === sourceTxId && tx.type === 'DEFECT');
    if (isDefect) {
      throw new Error('CẢNH BÁO: Nhãn này đã bị đánh dấu là HÀNG LỖI (DEFECT). Không thể nhập kho công đoạn tiếp theo!');
    }

    const alreadyScanned = transactions.some(tx => tx.type === 'STAGE_IN' && tx.qrData?.includes(sourceTxId));
    if (alreadyScanned) {
      throw new Error('Lỗi: Mã QR này đã được sử dụng để nhập kho trước đó. Không thể nhập lại.');
    }

    // 2. Prevent scanning into the same stage it was exported from
    if (sourceStageId === currentStageId) {
      throw new Error('Lỗi: Không được phép nhập lại tại chính công đoạn đã xuất kho.');
    }

    // 3. If a target stage was specified, ensure it matches current stage
    if (targetStageId && targetStageId !== currentStageId) {
      const targetStageName = STAGES.find(s => s.id === targetStageId)?.name || targetStageId;
      throw new Error(`Lỗi: Nhãn này được chỉ định cho công đoạn ${targetStageName}. Bạn đang ở công đoạn ${STAGES.find(s => s.id === currentStageId)?.name}.`);
    }

    if (!linkedPoId && !partId.startsWith('GLZ-OUT-') && sourceStageId !== 'GLAZING') {
      throw new Error('Lỗi: Nhãn QR này không chứa thông tin Lệnh sản xuất (PO). Không thể nhập kho.');
    }

    // 3. Add to currentStage target location
    // FORCE targetLocation to 'IN' when scanning QR code as per user request
    const finalTargetLocation = 'IN';
    
    // Part Transformation Logic
    const finalPartId = this.getEffectivePartId(partId, currentStageId, linkedPoId);
    
    // So khớp chuẩn hóa để xác định xem có sự thay đổi thực sự không
    const std = (s: string) => s ? s.normalize('NFC').trim().toUpperCase() : '';
    const originalPartId = (std(finalPartId) !== std(partId)) ? partId : undefined;

    this.updateInventory(finalPartId, currentStageId, finalTargetLocation, quantity, originalPartId);

    // 4. Record transaction
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substring(2, 12).toUpperCase(),
      type: 'STAGE_IN',
      partId: finalPartId,
      originalPartId: originalPartId, // Track original if transformed
      quantity,
      stageId: currentStageId,
      location: finalTargetLocation,
      sourceStageId: sourceStageId as StageId,
      timestamp: Date.now(),
      qrData,
      poId: linkedPoId
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    this.persistTransaction(newTransaction);

    // 5. Update inventory for Level 2 parts if needed (BOM logic for Laser stage)
    // Actually, recordManualInbound has this logic, but recordStageIn should probably have it too if we scan a label.
    // Let's keep it consistent.
    
    return newTransaction;
  },

  recordManualInbound(partId: string, stageId: StageId, location: 'IN' | 'OUT', quantity: number, poId?: string, force?: boolean, customTimestamp?: number) {
    const cleanId = partId.startsWith('GLZ-OUT-') ? partId.trim().toUpperCase() : partId.split(' - ')[0].trim().toUpperCase();
    let linkedPoId = poId;

    // Check for required PO
    const pos = this.getProductionOrders();
    const poIndex = poId 
      ? pos.findIndex(p => p.id === poId)
      : pos.findIndex(p => p.partId === cleanId && p.stageId === stageId && p.status !== 'COMPLETED');
      
    const currentPoId = poIndex !== -1 ? pos[poIndex].id : poId;

    // Apply BOM logic if entering into OUT (Production result)
    if (location === 'OUT') {
      // Validate PO limit BEFORE deducting BOM and saving anything
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity && !force) {
          throw new Error(`OVER_PO:Số lượng thêm vào (${po.producedQuantity + quantity}) sẽ vượt quá mục tiêu PO (${po.targetQuantity}) cho ${cleanId} tại ${stageId}. Bạn có chắc chắn vẫn muốn thêm và tính tiêu hao?`);
        }
      }

      this.applyBOMDeduction(cleanId, stageId, quantity, currentPoId);

      // Update PO progress
      if (poIndex !== -1) {
        const po = pos[poIndex];
        po.producedQuantity += quantity;
        const isProduced = po.producedQuantity >= po.targetQuantity;
        const isExported = (po.exportedQuantity || 0) >= po.targetQuantity;
        po.status = (isProduced && isExported) ? 'COMPLETED' : 'IN_PROGRESS';
        linkedPoId = po.id;

        // Check if all sub-POs for this master are completed
        if (po.masterPoId) {
          const masterPo = pos.find(p => p.id === po.masterPoId);
          if (masterPo) {
            const otherSubs = pos.filter(p => p.masterPoId === po.masterPoId && p.id !== po.id);
            const allSubsCompleted = po.status === 'COMPLETED' && otherSubs.every(s => s.status === 'COMPLETED');
            if (allSubsCompleted) {
              masterPo.status = 'COMPLETED';
            } else {
              masterPo.status = 'IN_PROGRESS';
            }
          }
        }

        this.saveProductionOrders(pos);
      }
    }

    // Part Transformation Logic
    const finalPartId = this.getEffectivePartId(cleanId, stageId, currentPoId);
    
    const std = (s: string) => s ? s.normalize('NFC').trim().toUpperCase() : '';
    const originalPartId = (std(finalPartId) !== std(cleanId)) ? cleanId : undefined;

    this.updateInventory(finalPartId, stageId, location, quantity, originalPartId);
    
    const transactions = this.getTransactions();
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substring(2, 12).toUpperCase(),
      type: 'STAGE_IN',
      partId: finalPartId,
      originalPartId: originalPartId,
      quantity,
      stageId,
      location, // Store the target location (IN/OUT)
      timestamp: customTimestamp || Date.now(),
      qrData: 'MANUAL_ENTRY',
      poId: linkedPoId
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    this.persistTransaction(newTransaction);

    return newTransaction;
  },

  getInventoryAtStage(stageId: StageId) {
    const inventory = this.getInventory();
    return {
      in: inventory.filter((item) => item.stageId === stageId && item.location === 'IN'),
      out: inventory.filter((item) => item.stageId === stageId && item.location === 'OUT'),
      defect: inventory.filter((item) => item.stageId === stageId && item.location === 'DEFECT'),
    };
  },

  recordDefect(partId: string, stageId: StageId, location: 'IN' | 'OUT', quantity: number, reason: string, category: string, poId?: string) {
    const cleanId = partId.startsWith('GLZ-OUT-') ? partId.trim().toUpperCase() : partId.split(' - ')[0].trim().toUpperCase();
    
    // 1. Validation: Ensure we have enough stock in IN to mark as defect
    const inventory = this.getInventory();
    const effectiveId = this.getEffectivePartId(cleanId, stageId, poId);
    
    const partsInCatalog = this.getParts();
    const partInCatalogForEffectiveId = partsInCatalog.find(p => p.id.toUpperCase() === effectiveId.toUpperCase());
    const effectivePartName = partInCatalogForEffectiveId ? partInCatalogForEffectiveId.name.toUpperCase().trim() : '';

    const matchingStocks = inventory.filter(i => {
      const itPartId = i.partId.toUpperCase().trim();
      const targetId = effectiveId.toUpperCase();
      const matchesPart = itPartId === targetId || (effectivePartName && itPartId === effectivePartName);
      return matchesPart && i.stageId === stageId && i.location === location;  // Fix: Check specific location
    });
    const totalStock = matchingStocks.reduce((sum, item) => sum + item.quantity, 0);

    if (stageId !== 'GLAZING' && totalStock < quantity) {
      const part = this.getParts().find(p => p.id === effectiveId);
      throw new Error(`Lỗi: Số lượng báo lỗi (${quantity}) lớn hơn tổng tồn kho IN của ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name} (Hiện có ${totalStock})`);
    }

    // 2. Inventory movement: Deduct from IN, Add to DEFECT
    let remainingToDeduct = quantity;
    let deductedFromOriginalId: string | undefined;

    matchingStocks.sort((a, b) => (a.originalPartId || '').localeCompare(b.originalPartId || ''));

    for (const stock of matchingStocks) {
      if (remainingToDeduct <= 0) break;
      const toTake = Math.min(stock.quantity, remainingToDeduct);
      this.updateInventory(effectiveId, stageId, location, -toTake, stock.originalPartId);
      this.updateInventory(effectiveId, stageId, 'DEFECT', toTake, stock.originalPartId);
      deductedFromOriginalId = stock.originalPartId;
      remainingToDeduct -= toTake;
    }

    if (remainingToDeduct > 0) {
      // Bypassed check cases (e.g. GLAZING)
      this.updateInventory(effectiveId, stageId, 'DEFECT', remainingToDeduct, deductedFromOriginalId);
    }

    // 3. Record transaction
    const transactions = this.getTransactions();
    const txId = `DF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const timestamp = Date.now();
    const qrData = stageId === 'GLAZING' ? `DISPOSAL|${quantity}|${stageId}|${timestamp}|${txId}|DEFECT_ONLY|${reason || ''}|${category || ''}` : undefined;
    
    const newTransaction: Transaction = {
      id: txId,
      type: 'DEFECT',
      partId: effectiveId,
      originalPartId: deductedFromOriginalId,
      quantity,
      stageId,
      timestamp,
      defectReason: reason,
      defectCategory: category,
      poId: poId,
      qrData
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    this.persistTransaction(newTransaction);

    // Auto-create supplementary POs for compensation for any stage
    if (stageId !== 'LASER') {
      try {
        const repairId = deductedFromOriginalId || cleanId;
        this.createMasterPO(repairId, quantity, Date.now(), undefined, "REPAIR", stageId);
      } catch (err) {
        console.error("Failed to create supplementary PO:", err);
      }
    }

    return newTransaction;
  },

  recordDisposal(partId: string, stageId: StageId, quantity: number, reasonName?: string, categoryName?: string) {
    const cleanId = partId.startsWith('GLZ-OUT-') ? partId.trim().toUpperCase() : partId.split(' - ')[0].trim().toUpperCase();
    
    // 1. Validation
    const inventory = this.getInventory();
    const effectiveId = this.getEffectivePartId(cleanId, stageId);
    const partsInCatalog = this.getParts();
    const partInCatalogForEffectiveId = partsInCatalog.find(p => p.id.toUpperCase() === effectiveId.toUpperCase());
    const effectivePartName = partInCatalogForEffectiveId ? partInCatalogForEffectiveId.name.toUpperCase().trim() : '';
    const matchingStocks = inventory.filter(i => {
      const itPartId = i.partId.toUpperCase().trim();
      const targetId = effectiveId.toUpperCase();
      const matchesPart = itPartId === targetId || (effectivePartName && itPartId === effectivePartName);
      return matchesPart && i.stageId === stageId && i.location === 'DEFECT';
    });
    const totalStock = matchingStocks.reduce((sum, i) => sum + i.quantity, 0);

    if (totalStock < quantity) {
      const part = this.getParts().find(p => p.id === effectiveId);
      throw new Error(`Lỗi: Số lượng xuất hủy (${quantity}) lớn hơn tồn kho DEFECT của ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name} (Hiện có ${totalStock})`);
    }

    // 2. Inventory move: Deduct from DEFECT
    let remainingToDeduct = quantity;
    for (const stock of matchingStocks) {
      if (remainingToDeduct <= 0) break;
      const toTake = Math.min(stock.quantity, remainingToDeduct);
      this.updateInventory(stock.partId, stageId, 'DEFECT', -toTake, stock.originalPartId);
      remainingToDeduct -= toTake;
    }

    // 3. Record transaction
    const transactions = this.getTransactions();
    const txId = `DS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const timestamp = Date.now();
    
    // QR data for disposal
    const qrData = `DISPOSAL|${quantity}|${stageId}|${timestamp}|${txId}|DISPOSAL_ONLY|${reasonName || ''}|${categoryName || ''}`;

    const newTransaction: Transaction = {
      id: txId,
      type: 'DISPOSAL',
      partId: effectiveId,
      originalPartId: (effectiveId !== cleanId) ? cleanId : undefined,
      quantity,
      stageId,
      timestamp,
      qrData,
      defectReason: reasonName,
      defectCategory: categoryName,
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    this.persistTransaction(newTransaction);
    
    // Save to label history for reprint
    this.saveLabel(newTransaction);

    return newTransaction;
  },

  getProductionOrdersSync(): ProductionOrder[] {
    const data = getCached(STORAGE_KEYS.PRODUCTION_ORDERS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTION_ORDERS);
      return data ? JSON.parse(data) : [];
    });
    return [...data];
  },

  async fetchProductionOrders(): Promise<ProductionOrder[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('production_orders').select(DB_COLUMNS.PRODUCTION_ORDERS);
        if (!error && data) {
          const pos = data.map(rowToPo);
          cache[STORAGE_KEYS.PRODUCTION_ORDERS] = pos;
          localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(pos));
          return [...pos];
        }
      } catch (err) {
        console.error('Supabase fetchProductionOrders error:', err);
      }
    }
    return this.getProductionOrdersSync();
  },

  getProductionOrders(): ProductionOrder[] & Promise<ProductionOrder[]> {
    const syncData = this.getProductionOrdersSync();
    return makeAsyncArray(syncData, isSupabaseConfigured ? this.fetchProductionOrders() : undefined);
  },

  async saveProductionOrders(orders: ProductionOrder[]): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(orders));
    cache[STORAGE_KEYS.PRODUCTION_ORDERS] = orders;
    if (isSupabaseConfigured) {
      try {
        if (orders.length > 0) {
          await supabase.from('production_orders').upsert(orders.map(poToRow));
        }
      } catch (err) {
        console.error('Supabase saveProductionOrders error:', err);
      }
    }
  },

  resetShiftConfigs() {
    localStorage.removeItem(STORAGE_KEYS.SHIFT_CONFIGS);
    clearCache(STORAGE_KEYS.SHIFT_CONFIGS);
  },

  getNextWorkingTime(timestamp: number, stageId: StageId, shiftConfigs: ShiftConfig[]): number {
    const config = shiftConfigs.find(c => c.stageId === stageId);
    if (!config) return timestamp;

    const timeToDate = (timeStr: string, baseDate: Date) => {
      const [h, m] = timeStr.split(':').map(Number);
      return setSeconds(setMinutes(setHours(baseDate, h), m), 0);
    };

    let checkTime = new Date(timestamp);
    for (let day = 0; day < 100; day++) { // Increase day limit
      const baseDay = startOfDay(checkTime);
      const workingIntervals: { start: Date, end: Date }[] = [];
      
      if (!(baseDay.getDay() === 0 && !config.workOnSunday)) {
        config.shifts.forEach(shift => {
          const s = timeToDate(shift.start, baseDay);
          let e = timeToDate(shift.end, baseDay);
          if (isBefore(e, s)) e = addDays(e, 1);
          
          let intervals = [{ start: s, end: e }];
          config.breaks.forEach(brk => {
            const bs = timeToDate(brk.start, baseDay);
            const be = timeToDate(brk.end, baseDay);
            const newIntervals: typeof intervals = [];
            intervals.forEach(inv => {
              if (isAfter(be, inv.start) && isBefore(bs, inv.end)) {
                if (isAfter(bs, inv.start)) newIntervals.push({ start: inv.start, end: bs });
                if (isBefore(be, inv.end)) newIntervals.push({ start: be, end: inv.end });
              } else {
                newIntervals.push(inv);
              }
            });
            intervals = newIntervals;
          });
          workingIntervals.push(...intervals);
        });
        workingIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());

        for (const inv of workingIntervals) {
          if (isBefore(checkTime, inv.end)) {
            if (isBefore(checkTime, inv.start)) return inv.start.getTime();
            else return checkTime.getTime();
          }
        }
      }
      checkTime = startOfDay(addDays(baseDay, 1));
    }
    return timestamp;
  },

  getPreviousWorkingTime(timestamp: number, stageId: StageId, shiftConfigs: ShiftConfig[]): number {
    const config = shiftConfigs.find(c => c.stageId === stageId);
    if (!config) return timestamp;

    const timeToDate = (timeStr: string, baseDate: Date) => {
      const [h, m] = timeStr.split(':').map(Number);
      return setSeconds(setMinutes(setHours(baseDate, h), m), 0);
    };

    let checkTime = new Date(timestamp);
    for (let day = 0; day < 100; day++) { // Increase day limit
      const baseDay = startOfDay(checkTime);
      const workingIntervals: { start: Date, end: Date }[] = [];
      
      if (!(baseDay.getDay() === 0 && !config.workOnSunday)) {
        config.shifts.forEach(shift => {
          const s = timeToDate(shift.start, baseDay);
          let e = timeToDate(shift.end, baseDay);
          if (isBefore(e, s)) e = addDays(e, 1);
          
          let intervals = [{ start: s, end: e }];
          config.breaks.forEach(brk => {
            const bs = timeToDate(brk.start, baseDay);
            const be = timeToDate(brk.end, baseDay);
            const newIntervals: typeof intervals = [];
            intervals.forEach(inv => {
              if (isAfter(be, inv.start) && isBefore(bs, inv.end)) {
                if (isAfter(bs, inv.start)) newIntervals.push({ start: inv.start, end: bs });
                if (isBefore(be, inv.end)) newIntervals.push({ start: be, end: inv.end });
              } else {
                newIntervals.push(inv);
              }
            });
            intervals = newIntervals;
          });
          workingIntervals.push(...intervals);
        });
        // Sort intervals descending to easily find previous time
        workingIntervals.sort((a, b) => b.start.getTime() - a.start.getTime());

        for (const inv of workingIntervals) {
          if (isAfter(checkTime, inv.start)) {
            if (isAfter(checkTime, inv.end)) return inv.end.getTime();
            else return checkTime.getTime();
          }
        }
      }
      checkTime = new Date(baseDay.getTime() - 1); // 23:59:59.999 of previous day
    }
    return timestamp;
  },

  calculateStartTime(endTime: number, durationMs: number, stageId: StageId, shiftConfigs: ShiftConfig[]): number {
    if (durationMs <= 0) return endTime;
    let remaining = durationMs;
    let currentTime = this.getPreviousWorkingTime(endTime, stageId, shiftConfigs);
    const config = shiftConfigs.find(c => c.stageId === stageId);
    if (!config) return endTime - durationMs;

    const timeToDate = (timeStr: string, baseDate: Date) => {
      const [h, m] = timeStr.split(':').map(Number);
      return setSeconds(setMinutes(setHours(baseDate, h), m), 0);
    };

    while (remaining > 0) {
      const baseDay = startOfDay(new Date(currentTime));
      const workingIntervals: { start: Date, end: Date }[] = [];
      
      if (!(baseDay.getDay() === 0 && !config.workOnSunday)) {
        config.shifts.forEach(shift => {
          const s = timeToDate(shift.start, baseDay);
          let e = timeToDate(shift.end, baseDay);
          if (isBefore(e, s)) e = addDays(e, 1);
          let intervals = [{ start: s, end: e }];
          config.breaks.forEach(brk => {
            const bs = timeToDate(brk.start, baseDay);
            const be = timeToDate(brk.end, baseDay);
            const newIntervals: typeof intervals = [];
            intervals.forEach(inv => {
              if (isAfter(be, inv.start) && isBefore(bs, inv.end)) {
                if (isAfter(bs, inv.start)) newIntervals.push({ start: inv.start, end: bs });
                if (isBefore(be, inv.end)) newIntervals.push({ start: be, end: inv.end });
              } else {
                newIntervals.push(inv);
              }
            });
            intervals = newIntervals;
          });
          workingIntervals.push(...intervals);
        });
        // Sort descending for backward search
        workingIntervals.sort((a, b) => b.end.getTime() - a.end.getTime());
      }

      let moved = false;
      for (const inv of workingIntervals) {
        if (isAfter(currentTime, inv.start)) {
          const endInInv = isBefore(currentTime, inv.end) ? currentTime : inv.end.getTime();
          const available = endInInv - inv.start.getTime();
          const consume = Math.min(remaining, available);
          remaining -= consume;
          currentTime = endInInv - consume;
          if (remaining <= 0) return currentTime;
          moved = true;
        }
      }
      if (!moved || remaining > 0) {
        currentTime = this.getPreviousWorkingTime(currentTime, stageId, shiftConfigs);
      }
    }
    return currentTime;
  },

  calculateEndTime(startTime: number, durationMs: number, stageId: StageId, shiftConfigs: ShiftConfig[]): number {
    if (durationMs <= 0) return startTime;
    let remaining = durationMs;
    let currentTime = this.getNextWorkingTime(startTime, stageId, shiftConfigs);
    const config = shiftConfigs.find(c => c.stageId === stageId);
    if (!config) return startTime + durationMs;

    const timeToDate = (timeStr: string, baseDate: Date) => {
      const [h, m] = timeStr.split(':').map(Number);
      return setSeconds(setMinutes(setHours(baseDate, h), m), 0);
    };

    while (remaining > 0) {
      const baseDay = startOfDay(new Date(currentTime));
      const workingIntervals: { start: Date, end: Date }[] = [];
      
      if (!(baseDay.getDay() === 0 && !config.workOnSunday)) {
        config.shifts.forEach(shift => {
          const s = timeToDate(shift.start, baseDay);
          let e = timeToDate(shift.end, baseDay);
          if (isBefore(e, s)) e = addDays(e, 1);
          let intervals = [{ start: s, end: e }];
          config.breaks.forEach(brk => {
            const bs = timeToDate(brk.start, baseDay);
            const be = timeToDate(brk.end, baseDay);
            const newIntervals: typeof intervals = [];
            intervals.forEach(inv => {
              if (isAfter(be, inv.start) && isBefore(bs, inv.end)) {
                if (isAfter(bs, inv.start)) newIntervals.push({ start: inv.start, end: bs });
                if (isBefore(be, inv.end)) newIntervals.push({ start: be, end: inv.end });
              } else {
                newIntervals.push(inv);
              }
            });
            intervals = newIntervals;
          });
          workingIntervals.push(...intervals);
        });
        workingIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());
      }

      let moved = false;
      for (const inv of workingIntervals) {
        if (isBefore(currentTime, inv.end)) {
          const startInInv = isAfter(currentTime, inv.start) ? currentTime : inv.start.getTime();
          const available = inv.end.getTime() - startInInv;
          const consume = Math.min(remaining, available);
          remaining -= consume;
          currentTime = startInInv + consume;
          if (remaining <= 0) return currentTime;
          moved = true;
        }
      }
      if (!moved || remaining > 0) {
        currentTime = this.getNextWorkingTime(currentTime, stageId, shiftConfigs);
      }
    }
    return currentTime;
  },

  forceCompleteMasterPO(masterPoId: string) {
    const pos = this.getProductionOrders();
    const masterPo = pos.find(p => p.id === masterPoId);
    if (!masterPo) return;
    
    // Complete master PO
    masterPo.status = 'COMPLETED';
    if (!masterPo.completedAt) masterPo.completedAt = Date.now();
    
    // Complete sub POs that are not already completed
    const subPos = pos.filter(p => p.masterPoId === masterPoId);
    subPos.forEach(sub => {
      sub.status = 'COMPLETED';
      if (!sub.completedAt) sub.completedAt = Date.now();
    });
    
    this.saveProductionOrders(pos);
  },

  createMasterPO(modelId: string, quantity: number, plannedStartTime?: number, customLeadTime?: number, idPrefix: string = "PO", targetStageId?: string) {
    const { masterPo, allChildPOs } = this.calculateMasterPOSchedule(modelId, quantity, plannedStartTime, customLeadTime, idPrefix, targetStageId);
    const pos = this.getProductionOrders();
    const updatedPOs = [masterPo, ...allChildPOs, ...pos];
    this.saveProductionOrders(updatedPOs);
    return masterPo;
  },

  previewMasterPOStart(modelId: string, quantity: number, targetCompletionTime?: number, customLeadTime?: number): number {
    const { masterPo } = this.calculateMasterPOSchedule(modelId, quantity, targetCompletionTime, customLeadTime, "PO");
    return masterPo.plannedStartTime || Date.now();
  },

  calculateMasterPOSchedule(modelId: string, quantity: number, targetCompletionTime?: number, customLeadTime?: number, idPrefix: string = "PO", targetStageId?: string) {
    const pos = this.getProductionOrders(); // Still needed for unique ID check
    const timestamp = Date.now();
    const shiftConfigs = this.getShiftConfigs();
    const baseEndTime = targetCompletionTime || timestamp;
    const dateStr = format(baseEndTime, 'ddMM');
    const modelPrefix = modelId.length > 8 ? modelId.substring(0, 8).toUpperCase() : modelId.toUpperCase();
    const generateUniqueId = (prefix: string, suffix: string = "") => {
      let newId = "";
      do {
        newId = `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}${suffix}`;
      } while (pos.some(p => p.id === newId));
      return newId;
    };

    const masterPoId = generateUniqueId(`${idPrefix}-${modelPrefix}-${dateStr}`);
    const norms = this.getNorms();
    const partsList = this.getParts();
    const findPart = (id: string) => {
      const cleanId = id.trim().toUpperCase();
      return partsList.find(p => p.id.trim().toUpperCase() === cleanId);
    };
    const modelBom = this.getModelBOM();
    const bomV2 = this.getBOMV2();

    const requiredParts = new Map<string, { qty: number; minLevel: number; }>();
    const level1Children = new Map<string, string[]>();
    const parentsMap = new Map<string, string[]>();

    const traverseBOM = (currentId: string, currentQty: number, level: number, parentId: string | null) => {
      if (level > 20) return; // infinite loop guard
      if (level > 0 || (idPrefix.startsWith("REPAIR") && level === 0)) {
        const existing = requiredParts.get(currentId);
        if (!existing) {
          requiredParts.set(currentId, { qty: currentQty, minLevel: level });
        } else {
          requiredParts.set(currentId, { qty: existing.qty + currentQty, minLevel: Math.min(existing.minLevel, level) });
        }
        if (level >= 2 && parentId) {
          const children = level1Children.get(parentId) || [];
          if (!children.includes(currentId)) children.push(currentId);
          level1Children.set(parentId, children);
        }
      }
      if (parentId) {
        const parents = parentsMap.get(currentId) || [];
        if (!parents.includes(parentId)) parents.push(parentId);
        parentsMap.set(currentId, parents);
      }
      const v1Idx = modelBom.filter(b => b.modelId === currentId);
      for (const ing of v1Idx) {
        traverseBOM(ing.partId, currentQty * ing.quantity, level + 1, (level === 0) ? null : (level === 1 ? currentId : parentId));
      }
      const v2Idx = bomV2.filter(b => b.resultPartId === currentId && (!b.applicableModel || b.applicableModel === modelId));
      for (const ing of v2Idx) {
        const nextParentId = (level === 1) ? currentId : (level >= 2 ? parentId : null);
        traverseBOM(ing.ingredientPartId, currentQty * ing.quantity, level + 1, nextParentId);
      }
    };
    traverseBOM(modelId, quantity, 0, null);

    const laserPOs: ProductionOrder[] = [];
    const bendingPOs: ProductionOrder[] = [];
    const weldingPOs: ProductionOrder[] = [];
    const paintingPOs: ProductionOrder[] = [];

    const STAGE_ORDER = ['LASER', 'BENDING', 'WELDING', 'PAINTING'];
    const targetStageIdx = targetStageId ? STAGE_ORDER.indexOf(targetStageId) : 999;

    const addPoToList = (partId: string, info: any, stageId: StageId, list: ProductionOrder[]) => {
      if (STAGE_ORDER.indexOf(stageId) >= targetStageIdx) return;
      const { qty, minLevel: level } = info;
      const part = findPart(partId);
      if (stageId === 'LASER' && part?.skipLaser) return;
      if (stageId === 'BENDING' && part?.skipBending) return;
      if (stageId === 'WELDING' && part?.skipWelding) return;
      if (stageId === 'PAINTING' && (part?.skipPainting || (level > 1 && !part?.hasPaintingPO))) return;
      let idSuffix = "";
      if (stageId === 'WELDING') idSuffix = "- H";
      else if (stageId === 'BENDING') idSuffix = "- CD";
      list.push({
        id: generateUniqueId(`${idPrefix}-${modelPrefix}-${dateStr}-${stageId}`, idSuffix),
        masterPoId: masterPoId,
        partId: partId,
        stageId: stageId,
        targetQuantity: qty,
        producedQuantity: 0,
        exportedQuantity: 0,
        status: 'PENDING',
        createdAt: timestamp
      });
    };

    requiredParts.forEach((info, partId) => {
      const { minLevel: level } = info;
      const hasIngredients = bomV2.some(b => b.resultPartId === partId && (!b.applicableModel || b.applicableModel === modelId));
      if (!hasIngredients) {
        addPoToList(partId, info, 'LASER', laserPOs);
        addPoToList(partId, info, 'BENDING', bendingPOs);
      }
      if (hasIngredients || level <= 1) {
        addPoToList(partId, info, 'WELDING', weldingPOs);
      }
      const part = findPart(partId);
      if (level <= 1 || part?.hasPaintingPO) {
        addPoToList(partId, info, 'PAINTING', paintingPOs);
      }
    });

    const sortByLevelDesc = (a: ProductionOrder, b: ProductionOrder) => {
      return (requiredParts.get(b.partId)?.minLevel || 0) - (requiredParts.get(a.partId)?.minLevel || 0);
    };

    laserPOs.sort(sortByLevelDesc);
    bendingPOs.sort(sortByLevelDesc);
    weldingPOs.sort(sortByLevelDesc);
    paintingPOs.sort(sortByLevelDesc);

    const laserNesting = this.getLaserNesting();

    const runForwardPass = (globalStart: number) => {
      const outChildPOs: ProductionOrder[] = [];
      const partStageFinishTime = new Map<string, Map<StageId, number>>(); 
      const recordFinish = (po: ProductionOrder, time: number) => {
        let stages = partStageFinishTime.get(po.partId);
        if (!stages) {
          stages = new Map<StageId, number>();
          partStageFinishTime.set(po.partId, stages);
        }
        stages.set(po.stageId as StageId, time);
      };
      const getFinishTime = (partId: string, stageId: StageId) => {
        return partStageFinishTime.get(partId)?.get(stageId) || globalStart;
      };

      // 1. LASER
      let fFreeLaser = globalStart;
      const laserConfig = shiftConfigs.find(c => c.stageId === 'LASER');
      
      if (laserNesting.length > 0) {
        const nestedGroupMap = new Map<string, ProductionOrder[]>();
        const individualLaserPOs: ProductionOrder[] = [];
        laserPOs.forEach(po => {
          const p = {...po};
          const nest = laserNesting.find(ln => ln.partId === po.partId && (!ln.applicableModel || ln.applicableModel === modelId));
          if (nest) {
            const group = nestedGroupMap.get(nest.nestingId) || [];
            group.push(p);
            nestedGroupMap.set(nest.nestingId, group);
          } else {
            individualLaserPOs.push(p);
          }
        });
        individualLaserPOs.forEach(p => {
          const start = this.getNextWorkingTime(fFreeLaser, 'LASER', shiftConfigs);
          p.plannedStartTime = start;
          const norm = norms.find(n => n.partId === p.partId && n.stageId === 'LASER');
          
          // Worker override for individual laser PO
          const partName = partsList.find(pl => pl.id === p.partId)?.name;
          const override = laserConfig?.workerOverrides?.find(o => o.modelId === p.partId || o.modelId === partName || o.modelId === modelId);
          const currentLaserWorkers = override ? override.workerCount : (laserConfig?.workerCount || 1);

          const duration = norm ? (p.targetQuantity * norm.secondsPerUnit * 1000) / currentLaserWorkers : 0;
          const end = this.calculateEndTime(start, duration, 'LASER', shiftConfigs);
          p.expectedCompletionTime = end;
          fFreeLaser = end;
          recordFinish(p, end);
          outChildPOs.push(p);
        });
        nestedGroupMap.forEach((groupPOs, nestingId) => {
          let maxPlates = 0;
          let secondsPerSheet = 0;
          
          // Find the best worker count for the nesting group
          let groupMaxWorkers = laserConfig?.workerCount || 1;
          const batchModelOverride = laserConfig?.workerOverrides?.find(o => o.modelId === modelId);
          if (batchModelOverride) groupMaxWorkers = batchModelOverride.workerCount;

          // Calculate max required plates for this nesting group
          groupPOs.forEach(p => {
            const nest = laserNesting.find(ln => ln.partId === p.partId && ln.nestingId === nestingId && (!ln.applicableModel || ln.applicableModel === modelId));
            if (nest && nest.qtyPerSheet > 0) {
              const plates = Math.ceil(p.targetQuantity / nest.qtyPerSheet);
              if (plates > maxPlates) maxPlates = plates;
              if (nest.secondsPerSheet) secondsPerSheet = nest.secondsPerSheet;
            }

            // Check if this specific part in the group has an override
            const partName = partsList.find(pl => pl.id === p.partId)?.name;
            const pOverride = laserConfig?.workerOverrides?.find(o => o.modelId === p.partId || o.modelId === partName);
            if (pOverride && pOverride.workerCount > groupMaxWorkers) {
              groupMaxWorkers = pOverride.workerCount;
            }
          });
          
          const totalDur = maxPlates * secondsPerSheet * 1000;
          const adjustedDur = totalDur / groupMaxWorkers;
          const start = this.getNextWorkingTime(fFreeLaser, 'LASER', shiftConfigs);
          const end = this.calculateEndTime(start, adjustedDur, 'LASER', shiftConfigs);
          groupPOs.forEach(p => {
            p.plannedStartTime = start;
            p.expectedCompletionTime = end;
            recordFinish(p, end);
            outChildPOs.push(p);
          });
          fFreeLaser = end;
        });
      } else {
        laserPOs.forEach(po => {
          const p = {...po};
          const start = this.getNextWorkingTime(fFreeLaser, 'LASER', shiftConfigs);
          p.plannedStartTime = start;
          const norm = norms.find(n => n.partId === p.partId && n.stageId === 'LASER');

          const partName = partsList.find(pl => pl.id === p.partId)?.name;
          const override = laserConfig?.workerOverrides?.find(o => o.modelId === p.partId || o.modelId === partName || o.modelId === modelId);
          const currentLaserWorkers = override ? override.workerCount : (laserConfig?.workerCount || 1);

          const duration = norm ? (p.targetQuantity * norm.secondsPerUnit * 1000) / currentLaserWorkers : 0;
          const end = this.calculateEndTime(start, duration, 'LASER', shiftConfigs);
          p.expectedCompletionTime = end;
          fFreeLaser = end;
          recordFinish(p, end);
          outChildPOs.push(p);
        });
      }

      // 2. BENDING
      let fFreeBending = globalStart;
      const bendConfig = shiftConfigs.find(c => c.stageId === 'BENDING');
      bendingPOs.forEach(po => {
        const p = {...po};
        const partName = partsList.find(pl => pl.id === p.partId)?.name;
        const override = bendConfig?.workerOverrides?.find(o => o.modelId === p.partId || o.modelId === partName || o.modelId === modelId);
        const bendWorkers = override ? override.workerCount : (bendConfig?.workerCount || 1);

        const laserEnd = getFinishTime(p.partId, 'LASER');
        const start = this.getNextWorkingTime(Math.max(fFreeBending, laserEnd), 'BENDING', shiftConfigs);
        p.plannedStartTime = start;
        const norm = norms.find(n => n.partId === p.partId && n.stageId === 'BENDING');
        const duration = norm ? (p.targetQuantity * norm.secondsPerUnit * 1000) / bendWorkers : 0;
        const end = this.calculateEndTime(start, duration, 'BENDING', shiftConfigs);
        p.expectedCompletionTime = end;
        fFreeBending = end;
        recordFinish(p, end);
        outChildPOs.push(p);
      });

      // 3. WELDING
      let fFreeWelding = globalStart;
      const weldConfig = shiftConfigs.find(c => c.stageId === 'WELDING');
      weldingPOs.forEach(po => {
        const p = {...po};
        const partName = partsList.find(pl => pl.id === p.partId)?.name;
        const override = weldConfig?.workerOverrides?.find(o => o.modelId === p.partId || o.modelId === partName || o.modelId === modelId);
        const weldWorkers = override ? override.workerCount : (weldConfig?.workerCount || 1);

        const children = level1Children.get(p.partId) || [];
        const componentsReadyTime = children.length === 0 ? globalStart : Math.max(...children.map(cid => {
          const wEnd = partStageFinishTime.get(cid)?.get('WELDING');
          if (wEnd !== undefined) return wEnd;
          const bEnd = partStageFinishTime.get(cid)?.get('BENDING');
          if (bEnd !== undefined) return bEnd;
          return getFinishTime(cid, 'LASER');
        }));
        
        let myBendingEnd = partStageFinishTime.get(p.partId)?.get('BENDING');
        let myLaserEnd = partStageFinishTime.get(p.partId)?.get('LASER');
        let myReadyTime = myBendingEnd !== undefined ? myBendingEnd : (myLaserEnd !== undefined ? myLaserEnd : globalStart);
        
        const start = this.getNextWorkingTime(Math.max(fFreeWelding, componentsReadyTime, myReadyTime), 'WELDING', shiftConfigs);
        p.plannedStartTime = start;
        const norm = norms.find(n => n.partId === p.partId && n.stageId === 'WELDING');
        const duration = norm ? (p.targetQuantity * norm.secondsPerUnit * 1000) / weldWorkers : 0;
        const end = this.calculateEndTime(start, duration, 'WELDING', shiftConfigs);
        p.expectedCompletionTime = end;
        fFreeWelding = end;
        recordFinish(p, end);
        outChildPOs.push(p);
      });

      // 4. PAINTING
      let fFreePainting = globalStart;
      const paintConfig = shiftConfigs.find(c => c.stageId === 'PAINTING');
      paintingPOs.forEach(po => {
        const p = {...po};
        const partName = partsList.find(pl => pl.id === p.partId)?.name;
        const override = paintConfig?.workerOverrides?.find(o => o.modelId === p.partId || o.modelId === partName || o.modelId === modelId);
        const paintWorkers = override ? override.workerCount : (paintConfig?.workerCount || 1);

        let weldEnd = partStageFinishTime.get(p.partId)?.get('WELDING');
        let bendEnd = partStageFinishTime.get(p.partId)?.get('BENDING');
        let laserEnd = partStageFinishTime.get(p.partId)?.get('LASER');
        let readyTime = weldEnd !== undefined ? weldEnd : (bendEnd !== undefined ? bendEnd : (laserEnd !== undefined ? laserEnd : globalStart));

        const start = this.getNextWorkingTime(Math.max(fFreePainting, readyTime), 'PAINTING', shiftConfigs);
        p.plannedStartTime = start;
        const norm = norms.find(n => n.partId === p.partId && n.stageId === 'PAINTING');
        const duration = norm ? (p.targetQuantity * norm.secondsPerUnit * 1000) / paintWorkers : 0;
        const end = this.calculateEndTime(start, duration, 'PAINTING', shiftConfigs);
        p.expectedCompletionTime = end;
        fFreePainting = end;
        recordFinish(p, end);
        outChildPOs.push(p);
      });

      const maxEnd = outChildPOs.length > 0 
        ? Math.max(...outChildPOs.filter(p => p.expectedCompletionTime).map(p => p.expectedCompletionTime!))
        : globalStart;
        
      const actualMinStart = outChildPOs.length > 0
        ? Math.min(...outChildPOs.filter(p => p.plannedStartTime).map(p => p.plannedStartTime!))
        : globalStart;

      return { outChildPOs, maxEnd, minStart: actualMinStart };
    };

    // Backward scheduling logic: find the latest globalStart that meets the target date
    // while respecting the machine queuing (maxExisting...End)
    let low = targetCompletionTime ? targetCompletionTime - 60 * 24 * 60 * 60 * 1000 : timestamp;
    let high = targetCompletionTime ? targetCompletionTime : timestamp;
    let bestChildPOs: ProductionOrder[] = [];
    let bestStart = low;
    let bestEnd = low;

    if (targetCompletionTime) {
        // Binary search for the latest start time that finishes by the deadline
        for (let i = 0; i < 60; i++) {
            const mid = low + Math.floor((high - low) / 2);
            const { outChildPOs, maxEnd, minStart } = runForwardPass(mid);
            if (maxEnd <= targetCompletionTime) {
                bestChildPOs = outChildPOs;
                bestStart = minStart;
                bestEnd = maxEnd;
                low = mid + 1; // Try starting later
            } else {
                high = mid - 1; // Too late, must start earlier
            }
        }
    }

    // Fallback or if no target date: Use Forward Scheduling starting from now (queuing)
    if (bestChildPOs.length === 0) {
        const { outChildPOs, maxEnd, minStart } = runForwardPass(timestamp);
        bestChildPOs = outChildPOs;
        bestStart = minStart;
        bestEnd = maxEnd;
    }

    const masterPo: ProductionOrder = {
      id: masterPoId,
      partId: modelId,
      targetQuantity: quantity,
      producedQuantity: 0,
      exportedQuantity: 0,
      status: 'PENDING',
      createdAt: timestamp,
      plannedStartTime: bestStart,
      leadTime: customLeadTime,
      expectedCompletionTime: bestEnd
    };
    return { masterPo, allChildPOs: bestChildPOs };
  },

  deletePO(id: string) {
    const pos = this.getProductionOrders();
    // If it's a master PO, delete all its children too
    const filtered = pos.filter(p => p.id !== id && p.masterPoId !== id);
    this.saveProductionOrders(filtered);
  },

  clearStageInventory(stageId: StageId, location: 'IN' | 'OUT') {
    const inventory = this.getInventory();
    const newInventory = inventory.filter(item => !(item.stageId === stageId && item.location === location));
    this.saveInventory(newInventory);
  },

  updateSubPoQty(id: string, qty: number) {
    const pos = this.getProductionOrders();
    const targetPo = pos.find(p => p.id === id);
    if (!targetPo) return;

    // Only update the specific target PO, not all related POs
    targetPo.targetQuantity = qty;
    
    // Recalculate status
    const isProduced = targetPo.producedQuantity >= targetPo.targetQuantity;
    const isExported = (targetPo.exportedQuantity || 0) >= targetPo.targetQuantity;
    
    // If it was already completed but now target is higher, put back to IN_PROGRESS. 
    // If it wasn't completed but now meets target, complete it.
    if (isProduced && isExported) {
      targetPo.status = 'COMPLETED';
      if (!targetPo.completedAt) targetPo.completedAt = Date.now();
    } else {
      targetPo.status = (targetPo.producedQuantity > 0 || (targetPo.exportedQuantity && targetPo.exportedQuantity > 0)) ? 'IN_PROGRESS' : 'PENDING';
      targetPo.completedAt = undefined;
    }

    this.saveProductionOrders(pos);
  },

  updateSubPoTime(id: string, newExpectedTime: number) {
    const pos = this.getProductionOrders();
    const targetPo = pos.find(p => p.id === id);
    if (!targetPo || !targetPo.expectedCompletionTime) return;

    const timeDiff = newExpectedTime - targetPo.expectedCompletionTime;
    targetPo.expectedCompletionTime = newExpectedTime;
    if (targetPo.plannedStartTime) {
      targetPo.plannedStartTime += timeDiff;
    }

    this.saveProductionOrders(pos);
  },

  getStorageStats() {
    const parts = this.getParts();
    const pos = this.getProductionOrders();
    const inventory = this.getInventory();
    const transactions = this.getTransactions();
    const labels = this.getLabels();
    const bom = this.getBOM();
    const bomV2 = this.getBOMV2();
    const modelBom = this.getModelBOM();
    const norms = this.getNorms();
    const laserNesting = this.getLaserNesting();
    const shiftConfigs = this.getShiftConfigs();
    const transformations = this.getTransformations();
    const glazingPlans = this.getGlazingPlans();

    let totalBytes = 0;
    let totalKeys = 0;
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('wip_') || Object.values(STORAGE_KEYS).includes(key) || key === 'wip_labels')) {
          totalKeys++;
          const val = localStorage.getItem(key) || '';
          totalBytes += (key.length + val.length) * 2;
        }
      }
    }

    return {
      partsCount: parts.length,
      posCount: pos.length,
      inventoryCount: inventory.length,
      transactionsCount: transactions.length,
      labelsCount: labels.length,
      bomCount: bom.length,
      bomV2Count: bomV2.length,
      modelBomCount: modelBom.length,
      normsCount: norms.length,
      laserNestingCount: laserNesting.length,
      shiftConfigsCount: shiftConfigs.length,
      transformationsCount: transformations.length,
      glazingPlansCount: glazingPlans.length,
      totalKeys,
      totalBytes,
      sizeFormatted: totalBytes > 1024 * 1024 
        ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB` 
        : `${(totalBytes / 1024).toFixed(1)} KB`
    };
  },

  exportBackupData() {
    const stats = this.getStorageStats();
    const storageDump: Record<string, any> = {};

    if (typeof window !== 'undefined' && window.localStorage) {
      // 1. Gather all known STORAGE_KEYS
      Object.values(STORAGE_KEYS).forEach(k => {
        const val = localStorage.getItem(k);
        if (val !== null) {
          try {
            storageDump[k] = JSON.parse(val);
          } catch {
            storageDump[k] = val;
          }
        }
      });

      // 2. Gather wip_labels and any other dynamic wip_ keys
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('wip_') || k === 'wip_labels')) {
          if (!(k in storageDump)) {
            const val = localStorage.getItem(k);
            if (val !== null) {
              try {
                storageDump[k] = JSON.parse(val);
              } catch {
                storageDump[k] = val;
              }
            }
          }
        }
      }
    }

    return {
      app: 'WIP_TRACKING_SYSTEM',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportDateFormatted: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
      summary: stats,
      storage: storageDump
    };
  },

  downloadBackupFile(customFilename?: string): string {
    const backup = this.exportBackupData();
    const dateStr = format(new Date(), 'yyyyMMdd_HHmmss');
    const filename = customFilename || `WIP_LocalStorage_Backup_${dateStr}.json`;
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return filename;
  },

  validateBackupJson(rawStringOrObject: any): { 
    valid: boolean; 
    error?: string; 
    storageData?: Record<string, any>; 
    metadata?: any;
    stats?: any;
  } {
    let parsed: any;
    if (typeof rawStringOrObject === 'string') {
      try {
        parsed = JSON.parse(rawStringOrObject);
      } catch (err: any) {
        return { valid: false, error: 'Tệp không phải định dạng JSON hợp lệ: ' + (err?.message || '') };
      }
    } else {
      parsed = rawStringOrObject;
    }

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Dữ liệu JSON rỗng hoặc không đúng cấu trúc đối tượng' };
    }

    let storageData: Record<string, any> = {};
    let metadata: any = null;

    if (parsed.storage && typeof parsed.storage === 'object') {
      storageData = parsed.storage;
      metadata = {
        app: parsed.app,
        version: parsed.version,
        exportedAt: parsed.exportedAt,
        exportDateFormatted: parsed.exportDateFormatted,
        summary: parsed.summary
      };
    } else if (parsed.data && typeof parsed.data === 'object') {
      storageData = parsed.data;
      metadata = { exportedAt: parsed.exportedAt };
    } else {
      storageData = parsed;
    }

    const keys = Object.keys(storageData);
    const hasWipKeys = keys.some(k => k.startsWith('wip_') || Object.values(STORAGE_KEYS).includes(k) || k === 'wip_labels');

    if (!hasWipKeys) {
      return { 
        valid: false, 
        error: 'Không tìm thấy dữ liệu hợp lệ của hệ thống WIP (không có khóa dữ liệu wip_* nào trong file).' 
      };
    }

    const getCount = (kList: string[]): number => {
      for (const k of kList) {
        const val = storageData[k];
        if (Array.isArray(val)) return val.length;
        if (typeof val === 'string') {
          try {
            const parsedVal = JSON.parse(val);
            if (Array.isArray(parsedVal)) return parsedVal.length;
          } catch {}
        }
      }
      return 0;
    };

    const partsCount = getCount([STORAGE_KEYS.PARTS, 'wip_parts', 'parts']);
    const posCount = getCount([STORAGE_KEYS.PRODUCTION_ORDERS, 'wip_production_orders', 'production_orders']);
    const inventoryCount = getCount([STORAGE_KEYS.INVENTORY, 'wip_inventory', 'inventory']);
    const transactionsCount = getCount([STORAGE_KEYS.TRANSACTIONS, 'wip_transactions', 'transactions']);
    const labelsCount = getCount(['wip_labels', 'labels']);

    return {
      valid: true,
      storageData,
      metadata,
      stats: {
        totalKeys: keys.length,
        partsCount,
        posCount,
        inventoryCount,
        transactionsCount,
        labelsCount
      }
    };
  },

  async importBackupDataToSupabase(
    storageData: Record<string, any>,
    mode: 'overwrite' | 'merge' = 'overwrite',
    onProgress?: (progress: { message: string; percent?: number; stage?: string; currentCount?: number; totalCount?: number }) => void
  ): Promise<{
    success: boolean;
    keysRestored: number;
    message: string;
    details?: Record<string, number>;
  }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        keysRestored: 0,
        message: 'Chưa cấu hình Supabase URL hoặc Publishable Key trong hệ thống. Vui lòng kiểm tra file cấu hình supabaseClient.'
      };
    }

    try {
      const extractItems = <T = any>(possibleKeys: string[]): T[] => {
        for (const k of possibleKeys) {
          if (storageData[k] !== undefined && storageData[k] !== null) {
            let val = storageData[k];
            if (typeof val === 'string') {
              try {
                val = JSON.parse(val);
              } catch {}
            }
            if (Array.isArray(val)) return val as T[];
          }
        }
        return [];
      };

      const CHUNK_SIZE = 300;
      const results: Record<string, number> = {};

      // 1. Chế độ GHI ĐÈ HOÀN TOÀN: Xóa sạch dữ liệu cũ trên các bảng Supabase
      if (mode === 'overwrite') {
        onProgress?.({ message: 'Đang dọn dẹp dữ liệu cũ trên cơ sở dữ liệu Supabase Cloud...', percent: 5, stage: 'cleanup' });
        
        const clearTable = async (table: string, idCol: string = 'id') => {
          try {
            await supabase.from(table).delete().neq(idCol, '___DUMMY_NEVER_MATCH___');
          } catch (err) {
            console.warn(`Could not clear table ${table}:`, err);
          }
        };

        // Xóa theo thứ tự đảo chiều quan hệ phụ thuộc (child trước, parent sau)
        await clearTable('labels', 'id');
        await clearTable('transactions', 'id');
        await clearTable('inventory', 'id');
        await clearTable('glazing_plans', 'id');
        await clearTable('production_orders', 'id');
        await clearTable('bom_definitions', 'id');
        await clearTable('bom_v2_definitions', 'id');
        await clearTable('model_bom_definitions', 'id');
        await clearTable('productivity_norms', 'id');
        await clearTable('laser_nesting', 'id');
        await clearTable('part_transformations', 'id');
        await clearTable('parts', 'id');
        await clearTable('shift_configs', 'stage_id');
        await clearTable('system_settings', 'key');
      }

      // 2. Cơ chế chia nhỏ theo từng gói (Chunking 300 bản ghi) với bước LỌC TRÙNG LẶP (Deduplication) để upsert an toàn lên Supabase
      const uploadCategory = async <T extends Record<string, any>>(
        tableName: string,
        rows: T[],
        displayName: string,
        basePercent: number,
        weightPercent: number,
        primaryKeyField: string = 'id'
      ): Promise<number> => {
        if (!rows || rows.length === 0) return 0;

        // BƯỚC LỌC BỎ DỮ LIỆU TRÙNG LẶP (Deduplication theo Khóa chính)
        // Tránh lỗi PostgreSQL: "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const uniqueKeyMap = new Map<string, T>();
        for (const r of rows) {
          if (!r) continue;
          const pkVal = r[primaryKeyField] ?? r.id ?? r.stage_id ?? r.key;
          if (pkVal !== undefined && pkVal !== null) {
            uniqueKeyMap.set(String(pkVal), r);
          }
        }

        const deduplicatedRows = Array.from(uniqueKeyMap.values());
        const total = deduplicatedRows.length;
        if (total === 0) return 0;

        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = deduplicatedRows.slice(i, i + CHUNK_SIZE);
          const fromIdx = i + 1;
          const toIdx = Math.min(i + CHUNK_SIZE, total);
          const currentPercent = Math.min(96, Math.round(basePercent + (toIdx / total) * weightPercent));

          onProgress?.({
            message: `Đang nạp ${total} bản ghi vào bảng ${tableName} (gói ${fromIdx} - ${toIdx}/${total})...`,
            percent: currentPercent,
            stage: tableName,
            currentCount: toIdx,
            totalCount: total
          });

          // Đảm bảo không có ID trùng lặp trong cùng một câu lệnh upsert
          const { error } = await supabase.from(tableName).upsert(chunk as any);
          if (error) {
            console.error(`Error upserting ${tableName}:`, error);
            throw new Error(`Lỗi khi nạp dữ liệu vào bảng ${displayName} (${tableName}): ${error.message || JSON.stringify(error)}`);
          }
        }
        results[tableName] = total;
        return total;
      };

      // 3. Tiến hành nạp dữ liệu từng danh mục
      // 3.1 Danh mục linh kiện (parts)
      const rawParts = extractItems<Part>([STORAGE_KEYS.PARTS, 'wip_parts', 'parts']);
      const validParts = rawParts.filter(p => p && p.id);
      if (validParts.length > 0) {
        await uploadCategory('parts', validParts.map(partToRow), 'Linh kiện (parts)', 10, 10);
      }

      // 3.2 Lệnh sản xuất (production_orders)
      const rawPos = extractItems<ProductionOrder>([STORAGE_KEYS.PRODUCTION_ORDERS, 'wip_production_orders', 'production_orders']);
      const validPos = rawPos.filter(p => p && p.id);
      if (validPos.length > 0) {
        await uploadCategory('production_orders', validPos.map(poToRow), 'Lệnh sản xuất (production_orders)', 20, 10);
      }

      // 3.3 Tồn kho WIP (inventory)
      const rawInv = extractItems<InventoryItem>([STORAGE_KEYS.INVENTORY, 'wip_inventory', 'inventory']);
      const validInv = rawInv.filter(i => i && i.partId && i.stageId);
      if (validInv.length > 0) {
        await uploadCategory('inventory', validInv.map(invToRow), 'Tồn kho WIP (inventory)', 30, 10);
      }

      // 3.4 Định mức BOM v1 (bom_definitions)
      const rawBOM = extractItems<BOMDefinition>([STORAGE_KEYS.BOM, 'wip_bom', 'bom', 'bom_definitions']);
      const validBOM = rawBOM.filter(b => b && b.parentPartId && b.childPartId);
      if (validBOM.length > 0) {
        await uploadCategory('bom_definitions', validBOM.map(bomToRow), 'Định mức BOM v1', 40, 5);
      }

      // 3.5 Định mức Hàn BOM v2 (bom_v2_definitions)
      const rawBOMV2 = extractItems<BOMDefinitionV2>([STORAGE_KEYS.BOM_V2, 'wip_bom_v2', 'bom_v2', 'bom_v2_definitions']);
      const validBOMV2 = rawBOMV2.filter(b => b && b.resultPartId && b.ingredientPartId);
      if (validBOMV2.length > 0) {
        await uploadCategory('bom_v2_definitions', validBOMV2.map(bomV2ToRow), 'Định mức Hàn BOM v2', 45, 5);
      }

      // 3.6 BOM theo Model (model_bom_definitions)
      const rawModelBOM = extractItems<ModelBOMDefinition>([STORAGE_KEYS.MODEL_BOM, 'wip_model_bom', 'model_bom', 'model_bom_definitions']);
      const validModelBOM = rawModelBOM.filter(m => m && m.modelId && m.partId);
      if (validModelBOM.length > 0) {
        await uploadCategory('model_bom_definitions', validModelBOM.map(modelBomToRow), 'BOM theo Model', 50, 5);
      }

      // 3.7 Định mức năng suất (productivity_norms)
      const rawNorms = extractItems<ProductivityNorm>([STORAGE_KEYS.NORMS, 'wip_productivity_norms', 'norms', 'productivity_norms']);
      const validNorms = rawNorms.filter(n => n && n.partId && n.stageId);
      if (validNorms.length > 0) {
        await uploadCategory('productivity_norms', validNorms.map(normToRow), 'Định mức năng suất', 55, 5);
      }

      // 3.8 Định mức tổ hợp Laser (laser_nesting)
      const rawNesting = extractItems<LaserNesting>([STORAGE_KEYS.LASER_NESTING, 'wip_laser_nesting', 'laser_nesting']);
      const validNesting = rawNesting.filter(n => n && n.nestingId && n.partId);
      if (validNesting.length > 0) {
        await uploadCategory('laser_nesting', validNesting.map(nestingToRow), 'Định mức tổ hợp Laser', 60, 5);
      }

      // 3.9 Cấu hình ca làm việc & nhân sự (shift_configs)
      const rawShifts = extractItems<ShiftConfig>([STORAGE_KEYS.SHIFT_CONFIGS, 'wip_shift_configs', 'shift_configs']);
      const validShifts = rawShifts.filter(s => s && s.stageId);
      if (validShifts.length > 0) {
        await uploadCategory('shift_configs', validShifts.map(shiftToRow), 'Cấu hình ca làm việc', 65, 3);
      }

      // 3.10 Quy tắc chuyển đổi mã (part_transformations)
      const rawTransf = extractItems<PartTransformation>([STORAGE_KEYS.TRANSFORMATIONS, 'wip_transformations', 'transformations', 'part_transformations']);
      const validTransf = rawTransf.filter(t => t && t.sourcePartId && t.targetPartId);
      if (validTransf.length > 0) {
        await uploadCategory('part_transformations', validTransf.map(transfToRow), 'Quy tắc chuyển đổi mã', 68, 3);
      }

      // 3.11 Kế hoạch dán kính (glazing_plans)
      const rawGlazing = extractItems<import('./types').GlazingPlan>([STORAGE_KEYS.GLAZING_PLANS, 'wip_glazing_plans', 'glazing_plans']);
      const validGlazing = rawGlazing.filter(p => p && p.id && p.modelId);
      if (validGlazing.length > 0) {
        await uploadCategory('glazing_plans', validGlazing.map(glazingPlanToRow), 'Kế hoạch dán kính', 71, 4);
      }

      // 3.12 Nhãn QR (labels) - Danh mục lớn chia gói 300
      const rawLabels = extractItems<Transaction>(['wip_labels', 'labels']);
      const validLabels = rawLabels.filter(l => l && l.id);
      if (validLabels.length > 0) {
        await uploadCategory('labels', validLabels.map(txToRow), 'Nhãn QR (labels)', 75, 10);
      }

      // 3.13 Nhật ký quét kho (transactions) - Danh mục lớn chia gói 300
      const rawTxs = extractItems<Transaction>([STORAGE_KEYS.TRANSACTIONS, 'wip_transactions', 'transactions']);
      const validTxs = rawTxs.filter(t => t && t.id);
      if (validTxs.length > 0) {
        await uploadCategory('transactions', validTxs.map(txToRow), 'Nhật ký quét kho (transactions)', 85, 10);
      }

      // 3.14 Cài đặt hệ thống (system_settings)
      const settingsRows: { key: string; value: any; updated_at: string }[] = [];
      const handledTableKeys = new Set([
        STORAGE_KEYS.PARTS, 'wip_parts', 'parts',
        STORAGE_KEYS.PRODUCTION_ORDERS, 'wip_production_orders', 'production_orders',
        STORAGE_KEYS.INVENTORY, 'wip_inventory', 'inventory',
        STORAGE_KEYS.BOM, 'wip_bom', 'bom', 'bom_definitions',
        STORAGE_KEYS.BOM_V2, 'wip_bom_v2', 'bom_v2', 'bom_v2_definitions',
        STORAGE_KEYS.MODEL_BOM, 'wip_model_bom', 'model_bom', 'model_bom_definitions',
        STORAGE_KEYS.NORMS, 'wip_productivity_norms', 'norms', 'productivity_norms',
        STORAGE_KEYS.LASER_NESTING, 'wip_laser_nesting', 'laser_nesting',
        STORAGE_KEYS.SHIFT_CONFIGS, 'wip_shift_configs', 'shift_configs',
        STORAGE_KEYS.TRANSFORMATIONS, 'wip_transformations', 'transformations', 'part_transformations',
        STORAGE_KEYS.GLAZING_PLANS, 'wip_glazing_plans', 'glazing_plans',
        'wip_labels', 'labels',
        STORAGE_KEYS.TRANSACTIONS, 'wip_transactions', 'transactions'
      ]);

      for (const [key, val] of Object.entries(storageData)) {
        if (!handledTableKeys.has(key)) {
          let parsedVal = val;
          if (typeof val === 'string') {
            try { parsedVal = JSON.parse(val); } catch {}
          }
          settingsRows.push({
            key,
            value: parsedVal,
            updated_at: new Date().toISOString()
          });
        }
      }

      if (settingsRows.length > 0) {
        await uploadCategory('system_settings', settingsRows, 'Cài đặt hệ thống (system_settings)', 95, 3);
      }

      // 4. Đồng bộ lại dữ liệu từ Supabase về hệ thống hiển thị (không lưu chuỗi JSON khổng lồ vào LocalStorage)
      onProgress?.({ message: 'Đang đồng bộ và cập nhật dữ liệu hiển thị từ Supabase Cloud...', percent: 98, stage: 'sync' });
      await storageService.fetchAllFromSupabase();

      onProgress?.({ message: 'Hoàn tất quá trình nạp dữ liệu!', percent: 100, stage: 'done' });

      const totalRows = Object.values(results).reduce((a, b) => a + b, 0);

      return {
        success: true,
        keysRestored: Object.keys(results).length,
        message: `Đã nạp thành công ${totalRows.toLocaleString()} bản ghi vào ${Object.keys(results).length} bảng dữ liệu Supabase Cloud (${mode === 'overwrite' ? 'Ghi đè hoàn toàn' : 'Hợp nhất'}).`,
        details: results
      };
    } catch (err: any) {
      console.error('Import to Supabase error:', err);
      return {
        success: false,
        keysRestored: 0,
        message: 'Lỗi khi nạp dữ liệu lên Supabase Cloud: ' + (err?.message || '')
      };
    }
  },

  async importBackupData(
    storageData: Record<string, any>, 
    mode: 'overwrite' | 'merge' = 'overwrite',
    onProgress?: (progress: { message: string; percent?: number; stage?: string; currentCount?: number; totalCount?: number }) => void
  ) {
    return storageService.importBackupDataToSupabase(storageData, mode, onProgress);
  },


  async migrateLocalStorageToSupabase(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        message: 'Chưa cấu hình Supabase URL hoặc Anon Key trong biến môi trường.'
      };
    }

    try {
      const results: Record<string, number> = {};

      const dedupe = <T extends Record<string, any>>(items: T[], keyField: string = 'id'): T[] => {
        const m = new Map<string, T>();
        items.forEach(it => {
          if (!it) return;
          const k = it[keyField] ?? it.id ?? it.stage_id ?? it.key;
          if (k !== undefined && k !== null) m.set(String(k), it);
        });
        return Array.from(m.values());
      };

      const parts = this.getPartsSync();
      if (parts.length > 0) {
        const { error } = await supabase.from('parts').upsert(dedupe(parts.map(partToRow)));
        if (!error) results.parts = parts.length;
      }

      const inv = this.getInventorySync();
      if (inv.length > 0) {
        const { error } = await supabase.from('inventory').upsert(dedupe(inv.map(invToRow)));
        if (!error) results.inventory = inv.length;
      }

      const txs = this.getTransactionsSync();
      if (txs.length > 0) {
        const uniqueTxs = dedupe(txs.map(txToRow));
        for (let i = 0; i < uniqueTxs.length; i += 100) {
          const batch = uniqueTxs.slice(i, i + 100);
          await supabase.from('transactions').upsert(batch);
        }
        results.transactions = uniqueTxs.length;
      }

      const labels = this.getLabelsSync();
      if (labels.length > 0) {
        const uniqueLabels = dedupe(labels.map(txToRow));
        for (let i = 0; i < uniqueLabels.length; i += 100) {
          const batch = uniqueLabels.slice(i, i + 100);
          await supabase.from('labels').upsert(batch);
        }
        results.labels = uniqueLabels.length;
      }

      const pos = this.getProductionOrdersSync();
      if (pos.length > 0) {
        const { error } = await supabase.from('production_orders').upsert(dedupe(pos.map(poToRow)));
        if (!error) results.production_orders = pos.length;
      }

      const boms = this.getBOMSync();
      if (boms.length > 0) {
        const { error } = await supabase.from('bom_definitions').upsert(dedupe(boms.map(bomToRow)));
        if (!error) results.boms = boms.length;
      }

      const bomsV2 = this.getBOMV2Sync();
      if (bomsV2.length > 0) {
        const { error } = await supabase.from('bom_v2_definitions').upsert(dedupe(bomsV2.map(bomV2ToRow)));
        if (!error) results.bomsV2 = bomsV2.length;
      }

      const mboms = this.getModelBOMSync();
      if (mboms.length > 0) {
        const { error } = await supabase.from('model_bom_definitions').upsert(dedupe(mboms.map(modelBomToRow)));
        if (!error) results.modelBOM = mboms.length;
      }

      const norms = this.getNormsSync();
      if (norms.length > 0) {
        const { error } = await supabase.from('productivity_norms').upsert(dedupe(norms.map(normToRow)));
        if (!error) results.productivity_norms = norms.length;
      }

      const nesting = this.getLaserNestingSync();
      if (nesting.length > 0) {
        const { error } = await supabase.from('laser_nesting').upsert(dedupe(nesting.map(nestingToRow)));
        if (!error) results.laser_nesting = nesting.length;
      }

      const shifts = this.getShiftConfigsSync();
      if (shifts.length > 0) {
        const { error } = await supabase.from('shift_configs').upsert(dedupe(shifts.map(shiftToRow), 'stage_id'));
        if (!error) results.shift_configs = shifts.length;
      }

      const transformations = this.getTransformationsSync();
      if (transformations.length > 0) {
        const { error } = await supabase.from('part_transformations').upsert(dedupe(transformations.map(transfToRow)));
        if (!error) results.transformations = transformations.length;
      }

      const gPlans = this.getGlazingPlansSync();
      if (gPlans.length > 0) {
        const { error } = await supabase.from('glazing_plans').upsert(dedupe(gPlans.map(glazingPlanToRow)));
        if (!error) results.glazing_plans = gPlans.length;
      }

      // Settings
      const settingsPayloads = [
        { key: STORAGE_KEYS.LABEL_SETTINGS, value: this.getLabelSettings() },
        { key: STORAGE_KEYS.PEOPLE_PER_DAY, value: this.getPeoplePerDay() },
        { key: STORAGE_KEYS.MANDAYS_PER_DAY, value: this.getMandaysPerDay() },
        { key: STORAGE_KEYS.EXPORT_WEEK_NAME, value: this.getExportWeekName() },
        { key: STORAGE_KEYS.HOURLY_PEOPLE_PAINTING, value: this.getHourlyPeoplePainting() },
        { key: STORAGE_KEYS.HOURLY_PEOPLE_GLAZING, value: this.getHourlyPeopleGlazing() },
        { key: STORAGE_KEYS.HOURLY_PEOPLE_BENDING, value: this.getHourlyPeopleBending() },
        { key: STORAGE_KEYS.HOURLY_PEOPLE_WELDING, value: this.getHourlyPeopleWelding() },
        { key: STORAGE_KEYS.BENDING_WELDING_HSQD, value: this.getBendingWeldingHSQD() },
        { key: STORAGE_KEYS.GLAZING_CONFIGS, value: this.getGlazingConfigsSync() },
        { key: STORAGE_KEYS.GLAZING_OUT_CONFIGS, value: this.getGlazingOutConfigsSync() },
        { key: STORAGE_KEYS.QUICK_PRINT_PARTS, value: this.getQuickPrintPartsSync() },
        { key: STORAGE_KEYS.GLAZING_PLAN_NORMS, value: this.getGlazingPlanNormsSync() },
      ];

      for (const item of settingsPayloads) {
        await supabase.from('system_settings').upsert({
          key: item.key,
          value: item.value,
          updated_at: new Date().toISOString()
        });
      }
      results.settings = settingsPayloads.length;

      return {
        success: true,
        message: 'Đã đồng bộ toàn bộ dữ liệu từ LocalStorage lên Supabase thành công!',
        details: results
      };
    } catch (err: any) {
      console.error('Migration error:', err);
      return {
        success: false,
        message: 'Lỗi khi tải dữ liệu lên Supabase: ' + (err?.message || '')
      };
    }
  },

  clearCache() {
    clearCache();
  },

  resetAllData() {
    clearCache();
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('wip_') || Object.values(STORAGE_KEYS).includes(k) || k === 'wip_labels')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  },
};
