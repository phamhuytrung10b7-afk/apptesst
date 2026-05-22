/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, Transaction, StageId, STAGES, INITIAL_PARTS, Part, BOMDefinition, BOMDefinitionV2, ProductionOrder, ModelBOMDefinition, ProductivityNorm, LaserNesting, ShiftConfig, PartTransformation } from './types';
import { format, addMilliseconds, setHours, setMinutes, setSeconds, getHours, getMinutes, isBefore, isAfter, startOfDay, addDays } from 'date-fns';

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

  getLabelSettings() {
    return getCached(STORAGE_KEYS.LABEL_SETTINGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.LABEL_SETTINGS);
      return data ? JSON.parse(data) : { width: 100, height: 50, fontSize: 14, qrSize: 120 };
    });
  },

  saveLabelSettings(settings: any) {
    localStorage.setItem(STORAGE_KEYS.LABEL_SETTINGS, JSON.stringify(settings));
    cache[STORAGE_KEYS.LABEL_SETTINGS] = settings;
  },

  getParts(): Part[] {
    const data = getCached(STORAGE_KEYS.PARTS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PARTS);
      return data ? JSON.parse(data) : INITIAL_PARTS;
    });
    return [...data];
  },

  saveParts(parts: Part[]) {
    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(parts));
    cache[STORAGE_KEYS.PARTS] = parts;
  },

  getBOM(): BOMDefinition[] {
    return getCached(STORAGE_KEYS.BOM, () => {
      const data = localStorage.getItem(STORAGE_KEYS.BOM);
      return data ? JSON.parse(data) : [];
    });
  },

  saveBOM(bom: BOMDefinition[]) {
    localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(bom));
    cache[STORAGE_KEYS.BOM] = bom;
  },

  getBOMV2(): BOMDefinitionV2[] {
    return getCached(STORAGE_KEYS.BOM_V2, () => {
      const data = localStorage.getItem(STORAGE_KEYS.BOM_V2);
      return data ? JSON.parse(data) : [];
    });
  },

  saveBOMV2(bom: BOMDefinitionV2[]) {
    localStorage.setItem(STORAGE_KEYS.BOM_V2, JSON.stringify(bom));
    cache[STORAGE_KEYS.BOM_V2] = bom;
  },

  getModelBOM(): ModelBOMDefinition[] {
    return getCached(STORAGE_KEYS.MODEL_BOM, () => {
      const data = localStorage.getItem(STORAGE_KEYS.MODEL_BOM);
      return data ? JSON.parse(data) : [];
    });
  },

  saveModelBOM(bom: ModelBOMDefinition[]) {
    localStorage.setItem(STORAGE_KEYS.MODEL_BOM, JSON.stringify(bom));
    cache[STORAGE_KEYS.MODEL_BOM] = bom;
  },
  
  getNorms(): ProductivityNorm[] {
    return getCached(STORAGE_KEYS.NORMS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.NORMS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveNorms(norms: ProductivityNorm[]) {
    localStorage.setItem(STORAGE_KEYS.NORMS, JSON.stringify(norms));
    cache[STORAGE_KEYS.NORMS] = norms;
  },

  getLaserNesting(): LaserNesting[] {
    return getCached(STORAGE_KEYS.LASER_NESTING, () => {
      const data = localStorage.getItem(STORAGE_KEYS.LASER_NESTING);
      return data ? JSON.parse(data) : [];
    });
  },

  saveLaserNesting(nesting: LaserNesting[]) {
    localStorage.setItem(STORAGE_KEYS.LASER_NESTING, JSON.stringify(nesting));
    cache[STORAGE_KEYS.LASER_NESTING] = nesting;
  },
  
  getShiftConfigs(): ShiftConfig[] {
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

      // Add missing defaults to existing configs
      defaults.forEach(def => {
        if (!configs.find(c => c.stageId === def.stageId)) {
          configs.push(def);
        }
      });
      
      return configs;
    });
  },

  saveShiftConfigs(configs: ShiftConfig[]) {
    localStorage.setItem(STORAGE_KEYS.SHIFT_CONFIGS, JSON.stringify(configs));
    cache[STORAGE_KEYS.SHIFT_CONFIGS] = configs;
  },

  getTransformations(): PartTransformation[] {
    return getCached(STORAGE_KEYS.TRANSFORMATIONS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSFORMATIONS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveTransformations(transformations: PartTransformation[]) {
    localStorage.setItem(STORAGE_KEYS.TRANSFORMATIONS, JSON.stringify(transformations));
    cache[STORAGE_KEYS.TRANSFORMATIONS] = transformations;
  },

  getGlazingConfigs(): import('./types').GlazingConfig[] {
    return getCached(STORAGE_KEYS.GLAZING_CONFIGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_CONFIGS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveGlazingConfigs(configs: import('./types').GlazingConfig[]) {
    localStorage.setItem(STORAGE_KEYS.GLAZING_CONFIGS, JSON.stringify(configs));
    cache[STORAGE_KEYS.GLAZING_CONFIGS] = configs;
  },

  getGlazingOutConfigs(): import('./types').GlazingOutConfig[] {
    return getCached(STORAGE_KEYS.GLAZING_OUT_CONFIGS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_OUT_CONFIGS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveGlazingOutConfigs(configs: import('./types').GlazingOutConfig[]) {
    localStorage.setItem(STORAGE_KEYS.GLAZING_OUT_CONFIGS, JSON.stringify(configs));
    cache[STORAGE_KEYS.GLAZING_OUT_CONFIGS] = configs;
  },

  getQuickPrintParts(): {id: string, name: string, quantity: number}[] {
    return getCached(STORAGE_KEYS.QUICK_PRINT_PARTS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.QUICK_PRINT_PARTS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveQuickPrintParts(parts: {id: string, name: string, quantity: number}[]) {
    localStorage.setItem(STORAGE_KEYS.QUICK_PRINT_PARTS, JSON.stringify(parts));
    cache[STORAGE_KEYS.QUICK_PRINT_PARTS] = parts;
  },

  getGlazingPlanNorms(): import('./types').GlazingPlanNorm[] {
    return getCached(STORAGE_KEYS.GLAZING_PLAN_NORMS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_PLAN_NORMS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveGlazingPlanNorms(norms: import('./types').GlazingPlanNorm[]) {
    localStorage.setItem(STORAGE_KEYS.GLAZING_PLAN_NORMS, JSON.stringify(norms));
    cache[STORAGE_KEYS.GLAZING_PLAN_NORMS] = norms;
  },

  getGlazingPlans(): import('./types').GlazingPlan[] {
    return getCached(STORAGE_KEYS.GLAZING_PLANS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.GLAZING_PLANS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveGlazingPlans(plans: import('./types').GlazingPlan[]) {
    localStorage.setItem(STORAGE_KEYS.GLAZING_PLANS, JSON.stringify(plans));
    cache[STORAGE_KEYS.GLAZING_PLANS] = plans;
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

    const existingPlans = this.getGlazingPlans().filter(p => p.status !== 'COMPLETED' && p.expectedCompletionTime);
    const maxExistingEnd = existingPlans.length > 0 ? Math.max(...existingPlans.map(p => p.expectedCompletionTime!)) : Date.now();

    const runForward = (baseStartTime: number) => {
      const actualStart = this.getNextWorkingTime(Math.max(baseStartTime, maxExistingEnd), 'GLAZING', shiftConfigs);
      const end = this.calculateEndTime(actualStart, totalDurationMs, 'GLAZING', shiftConfigs);
      return { start: actualStart, end };
    };

    let low = Date.now();
    let high = targetCompletion > low ? targetCompletion : low;
    let best = runForward(low);

    if (high > low) {
      for (let i = 0; i < 20; i++) {
        const mid = Math.floor((low + high) / 2);
        const res = runForward(mid);
        if (res.end <= targetCompletion) {
          best = res;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
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
      
      // Update status if all components are "completed"?
      // But typically plans are completed manually or when 100% components done.
      // Let's just update the count.
      plans[planIndex] = { ...plan, producedQuantities, status: 'IN_PROGRESS' };
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
      return data ? JSON.parse(data) : [];
    });
    return [...data];
  },

  saveInventory(inventory: InventoryItem[]) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
    cache[STORAGE_KEYS.INVENTORY] = inventory;
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
      return data ? JSON.parse(data) : [];
    });
    return [...data];
  },

  saveLabel(label: Transaction) {
    const labels = [label, ...this.getLabels()];
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
  },

  deleteLabel(id: string) {
    const labels = this.getLabels().filter(l => l.id !== id);
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
  },

  markLabelAsPrinted(id: string) {
    const labels = this.getLabels().map(l => l.id === id ? { ...l, printed: true } : l);
    localStorage.setItem('wip_labels', JSON.stringify(labels));
    cache['wip_labels'] = labels;
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
      // 1. Add back to inventory (OUT location is "OK" stock for the stage)
      this.updateInventory(label.partId, label.stageId, 'OUT', label.quantity);
      
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
  },

  deleteInventoryItem(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', originalPartId?: string) {
    const inventory = this.getInventory();
    const parts = this.getParts();
    const cleanIdUpper = partId.trim().toUpperCase();
    const cleanOrigIdUpper = originalPartId?.trim().toUpperCase() || '';

    const partInCatalog = parts.find(p => p.id.toUpperCase() === cleanIdUpper || p.name.toUpperCase().trim() === cleanIdUpper);
    const targetNameUpper = partInCatalog ? partInCatalog.name.toUpperCase().trim() : '';

    const filtered = inventory.filter(
      (item) => {
        const itemPartId = item.partId.toUpperCase().trim();
        const itemOrigId = (item.originalPartId || '').toUpperCase().trim();
        const matchesPart = itemPartId === cleanIdUpper || (targetNameUpper && itemPartId === targetNameUpper);
        return !(matchesPart && item.stageId === stageId && item.location === location && itemOrigId === cleanOrigIdUpper);
      }
    );
    this.saveInventory(filtered);
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

  recordStageOut(partId: string, stageId: StageId, quantity: number, sourceLocation: 'IN' | 'OUT' = 'IN', targetStageId?: StageId, poId?: string, force?: boolean) {
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
      const part = this.getParts().find(p => p.id.toUpperCase() === effectiveId.toUpperCase());
      throw new Error(`Lỗi: Số lượng xuất (${quantity}) lớn hơn tổng tồn kho ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name}_${sourceLocation} (Hiện có ${totalStock})`);
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
      timestamp: Date.now(),
      qrData,
      poId: linkedPoId,
      printed: stageId === 'GLAZING' && sourceLocation === 'OUT' ? false : undefined
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);

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

    if (!linkedPoId && !partId.startsWith('GLZ-OUT-')) {
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

    // 5. Update inventory for Level 2 parts if needed (BOM logic for Laser stage)
    // Actually, recordManualInbound has this logic, but recordStageIn should probably have it too if we scan a label.
    // Let's keep it consistent.
    
    return newTransaction;
  },

  recordManualInbound(partId: string, stageId: StageId, location: 'IN' | 'OUT', quantity: number, poId?: string, force?: boolean) {
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
      timestamp: Date.now(),
      qrData: 'MANUAL_ENTRY',
      poId: linkedPoId
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);

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

    if (totalStock < quantity) {
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

    // 3. Record transaction
    const transactions = this.getTransactions();
    const txId = `DF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const newTransaction: Transaction = {
      id: txId,
      type: 'DEFECT',
      partId: effectiveId,
      originalPartId: deductedFromOriginalId,
      quantity,
      stageId,
      timestamp: Date.now(),
      defectReason: reason,
      defectCategory: category,
      poId: poId
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);

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

  recordDisposal(partId: string, stageId: StageId, quantity: number) {
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
    const qrData = `DISPOSAL|${quantity}|${stageId}|${timestamp}|${txId}|DISPOSAL_ONLY`;

    const newTransaction: Transaction = {
      id: txId,
      type: 'DISPOSAL',
      partId: effectiveId,
      originalPartId: (effectiveId !== cleanId) ? cleanId : undefined,
      quantity,
      stageId,
      timestamp,
      qrData,
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    
    // Save to label history for reprint
    this.saveLabel(newTransaction);

    return newTransaction;
  },

  getProductionOrders(): ProductionOrder[] {
    const data = getCached(STORAGE_KEYS.PRODUCTION_ORDERS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTION_ORDERS);
      return data ? JSON.parse(data) : [];
    });
    return [...data];
  },

  saveProductionOrders(orders: ProductionOrder[]) {
    localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(orders));
    cache[STORAGE_KEYS.PRODUCTION_ORDERS] = orders;
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

    const existingPOs = pos.filter(p => ['PENDING', 'IN_PROGRESS'].includes(p.status) && p.expectedCompletionTime);
    const getMaxExisting = (stageId: StageId) => {
      const stagePOs = existingPOs.filter(p => p.stageId === stageId && p.expectedCompletionTime);
      if (stagePOs.length === 0) return 0;
      return Math.max(...stagePOs.map(p => p.expectedCompletionTime!));
    };

    const maxExistingLaserEnd = getMaxExisting('LASER');
    const maxExistingBendingEnd = getMaxExisting('BENDING');
    const maxExistingWeldingEnd = getMaxExisting('WELDING');
    const maxExistingPaintingEnd = getMaxExisting('PAINTING');

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
      let fFreeLaser = Math.max(globalStart, maxExistingLaserEnd);
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
      let fFreeBending = Math.max(globalStart, maxExistingBendingEnd);
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
      let fFreeWelding = Math.max(globalStart, maxExistingWeldingEnd);
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
      let fFreePainting = Math.max(globalStart, maxExistingPaintingEnd);
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
    let low = timestamp;
    let high = targetCompletionTime && targetCompletionTime > timestamp ? targetCompletionTime : timestamp;
    let bestChildPOs: ProductionOrder[] = [];
    let bestStart = low;
    let bestEnd = low;

    if (high > low) {
        // Binary search for the latest start time that finishes by the deadline
        for (let i = 0; i < 30; i++) {
            const mid = low + Math.floor((high - low) / 2);
            const { outChildPOs, maxEnd, minStart } = runForwardPass(mid);
            if (maxEnd <= targetCompletionTime!) {
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

    // If it's a Master PO or has a Master PO, we might want to sync all related POs
    const masterPoId = targetPo.masterPoId || (targetPo.stageId ? null : targetPo.id);
    
    // Identify all POs to update
    const posToUpdate = masterPoId 
      ? pos.filter(p => p.id === masterPoId || p.masterPoId === masterPoId)
      : [targetPo];

    posToUpdate.forEach(po => {
      po.targetQuantity = qty;
      
      // Recalculate status
      const isProduced = po.producedQuantity >= po.targetQuantity;
      const isExported = (po.exportedQuantity || 0) >= po.targetQuantity;
      po.status = (isProduced && isExported) ? 'COMPLETED' : 'IN_PROGRESS';
      
      if (po.status === 'COMPLETED' && !po.completedAt) {
        po.completedAt = Date.now();
      } else if (po.status !== 'COMPLETED') {
        po.completedAt = undefined;
      }
    });

    this.saveProductionOrders(pos);
  },

  resetAllData() {
    localStorage.removeItem(STORAGE_KEYS.INVENTORY);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.PARTS);
    localStorage.removeItem(STORAGE_KEYS.BOM);
    localStorage.removeItem(STORAGE_KEYS.BOM_V2);
    localStorage.removeItem(STORAGE_KEYS.MODEL_BOM);
    localStorage.removeItem(STORAGE_KEYS.PRODUCTION_ORDERS);
    localStorage.removeItem(STORAGE_KEYS.NORMS);
    localStorage.removeItem('wip_labels');
  },
};
