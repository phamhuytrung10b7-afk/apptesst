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
    return getCached(STORAGE_KEYS.PARTS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PARTS);
      return data ? JSON.parse(data) : INITIAL_PARTS;
    });
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
      if (data) return JSON.parse(data);
      
      return [
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
        }
      ];
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

  getInventory(): InventoryItem[] {
    return getCached(STORAGE_KEYS.INVENTORY, () => {
      const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
      return data ? JSON.parse(data) : [];
    });
  },

  getTransactions(): Transaction[] {
    return getCached(STORAGE_KEYS.TRANSACTIONS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return data ? JSON.parse(data) : [];
    });
  },

  saveInventory(inventory: InventoryItem[]) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
    cache[STORAGE_KEYS.INVENTORY] = inventory;
  },

  saveTransactions(transactions: Transaction[]) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    cache[STORAGE_KEYS.TRANSACTIONS] = transactions;
  },

  getLabels(): Transaction[] {
    return getCached('wip_labels', () => {
      const data = localStorage.getItem('wip_labels');
      return data ? JSON.parse(data) : [];
    });
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
      // If not in transactions, check labels
      const labels = this.getLabels();
      const labelTx = labels.find(l => l.id === txId);
      if (!labelTx) return;
      
      // Rollback logic for label
      this.updateInventory(labelTx.partId, labelTx.stageId, 'OUT', labelTx.quantity);
      this.deleteLabel(txId);
      return;
    }

    const tx = transactions[txIndex];
    
    // Only rollback STAGE_OUT transactions that have QR data (meaning they were exported from OUT)
    if (tx.type === 'STAGE_OUT' && tx.qrData) {
      // Add quantity back to the source stage's OUT location
      this.updateInventory(tx.partId, tx.stageId, 'OUT', tx.quantity);
      
      // Remove from transactions
      transactions.splice(txIndex, 1);
      this.saveTransactions(transactions);
      
      // Remove from labels
      this.deleteLabel(txId);
    }
  },

  getEffectivePartId(partId: string, stageId: StageId): string {
    const cleanId = partId.split(' - ')[0].trim().toUpperCase();
    const transformations = this.getTransformations();
    const transformation = transformations.find(t => t.sourcePartId === cleanId && t.targetStageId === stageId);
    return transformation ? transformation.targetPartId : cleanId;
  },

  updateInventory(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', delta: number) {
    const inventory = this.getInventory();
    // Clean partId
    const cleanId = partId.split(' - ')[0].trim().toUpperCase();
    const index = inventory.findIndex(
      (item) => item.partId === cleanId && item.stageId === stageId && item.location === location
    );

    if (index >= 0) {
      inventory[index].quantity += delta;
      // Precision handling: round to 4 decimal places to avoid floating point issues
      inventory[index].quantity = Math.round(inventory[index].quantity * 10000) / 10000;
      if (inventory[index].quantity < 0) inventory[index].quantity = 0;
    } else {
      inventory.push({ partId: cleanId, stageId, location, quantity: Math.max(0, delta) });
    }

    this.saveInventory(inventory);
  },

  setInventoryQuantity(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT', quantity: number) {
    const inventory = this.getInventory();
    const cleanId = partId.split(' - ')[0];
    const index = inventory.findIndex(
      (item) => item.partId === cleanId && item.stageId === stageId && item.location === location
    );

    if (index >= 0) {
      inventory[index].quantity = Math.max(0, quantity);
    } else {
      inventory.push({ partId: cleanId, stageId, location, quantity: Math.max(0, quantity) });
    }

    this.saveInventory(inventory);
  },

  deleteInventoryItem(partId: string, stageId: StageId, location: 'IN' | 'OUT' | 'DEFECT') {
    const inventory = this.getInventory();
    const cleanId = partId.split(' - ')[0];
    const filtered = inventory.filter(
      (item) => !(item.partId === cleanId && item.stageId === stageId && item.location === location)
    );
    this.saveInventory(filtered);
  },

  applyBOMDeduction(partId: string, stageId: StageId, quantity: number) {
    const parts = this.getParts();
    // Strip suffixes added by display logic (e.g., " - CD", " - H") to ensure BOM lookups match the original part ID
    const cleanId = partId.split(' - ')[0];
    
    // Laser stage specific logic (BOM V1):
    // Deduct Level 3 parts from Laser IN based on BOM when Level 2 is produced
    if (stageId === 'LASER') {
      const bom = this.getBOM();
      const bomDef = bom.find(b => b.childPartId === cleanId);
      
      if (bomDef) {
        const totalConsumption = quantity * (bomDef.componentWeight + bomDef.scrapWeight);
        const totalScrap = quantity * bomDef.scrapWeight;
        
        const inventory = this.getInventory();
        const parentStock = inventory.find(i => i.partId === bomDef.parentPartId && i.stageId === 'LASER' && i.location === 'IN');
        
        if (!parentStock || parentStock.quantity < totalConsumption) {
          const parentPart = parts.find(p => p.id === bomDef.parentPartId);
          throw new Error(`Lỗi: Không đủ tồn kho ${parentPart?.name || bomDef.parentPartId} tại LASER_IN. Cần ${totalConsumption.toFixed(4)} kg, hiện có ${parentStock?.quantity || 0} kg`);
        }
        
        this.updateInventory(bomDef.parentPartId, 'LASER', 'IN', -totalConsumption);
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
      const allIngredients = bomV2.filter(b => b.resultPartId === cleanId);
      const ingredients = allIngredients.filter(ing => {
        const p = parts.find(part => part.id === ing.ingredientPartId);
        return !p?.skipWelding;
      });
      
      if (ingredients.length > 0) {
        const inventory = this.getInventory();
        for (const ing of ingredients) {
          const needed = quantity * ing.quantity;
          const effectiveIngId = this.getEffectivePartId(ing.ingredientPartId, 'WELDING');
          const stock = inventory.find(i => i.partId === effectiveIngId && i.stageId === 'WELDING' && i.location === 'IN');
          if (!stock || stock.quantity < needed) {
            const ingPart = parts.find(p => p.id === effectiveIngId);
            throw new Error(`Lỗi: Không đủ tồn kho ${ingPart?.name || effectiveIngId} tại WELDING_IN. Cần ${needed} ${ingPart?.unit || ''}, hiện có ${stock?.quantity || 0}`);
          }
        }
        for (const ing of ingredients) {
          const effectiveIngId = this.getEffectivePartId(ing.ingredientPartId, 'WELDING');
          this.updateInventory(effectiveIngId, 'WELDING', 'IN', -(quantity * ing.quantity));
        }
      }
    }

    // Painting stage deduction for ingredients that skipped welding
    if (stageId === 'PAINTING') {
      const bomV2 = this.getBOMV2();
      const allIngredients = bomV2.filter(b => b.resultPartId === cleanId);
      const skipWeldedIngredients = allIngredients.filter(ing => {
        const p = parts.find(part => part.id === ing.ingredientPartId);
        return p?.skipWelding;
      });

      if (skipWeldedIngredients.length > 0) {
        const inventory = this.getInventory();
        for (const ing of skipWeldedIngredients) {
          const needed = quantity * ing.quantity;
          const effectiveIngId = this.getEffectivePartId(ing.ingredientPartId, 'PAINTING');
          const stock = inventory.find(i => i.partId === effectiveIngId && i.stageId === 'PAINTING' && i.location === 'IN');
          if (!stock || stock.quantity < needed) {
            const ingPart = parts.find(p => p.id === effectiveIngId);
            throw new Error(`Lỗi: Không đủ tồn kho ${ingPart?.name || effectiveIngId} tại PAINTING_IN. Cần ${needed} ${ingPart?.unit || ''}, hiện có ${stock?.quantity || 0}`);
          }
        }
        for (const ing of skipWeldedIngredients) {
          const effectiveIngId = this.getEffectivePartId(ing.ingredientPartId, 'PAINTING');
          this.updateInventory(effectiveIngId, 'PAINTING', 'IN', -(quantity * ing.quantity));
        }
      }
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
      if (nextStage.id === 'BENDING' && part.skipBending) continue;
      if (nextStage.id === 'WELDING' && part.skipWelding) continue;
      return nextStage.id;
    }
    return null;
  },

  recordStageOut(partId: string, stageId: StageId, quantity: number, sourceLocation: 'IN' | 'OUT' = 'IN', targetStageId?: StageId, poId?: string) {
    const cleanId = partId.split(' - ')[0];
    // Validation: Check if source location has enough quantity
    const inventory = this.getInventory();
    const effectiveId = this.getEffectivePartId(cleanId, stageId);
    const stock = inventory.find(
      (item) => item.partId === effectiveId && item.stageId === stageId && item.location === sourceLocation
    );

    if (!stock || stock.quantity < quantity) {
      const part = this.getParts().find(p => p.id === effectiveId);
      throw new Error(`Lỗi: Số lượng xuất (${quantity}) lớn hơn tồn kho ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name}_${sourceLocation} (${stock?.quantity || 0})`);
    }

    let linkedPoId = poId;

    // 0. Update Production Order progress if producing (IN -> OUT)
    if (sourceLocation === 'IN') {
      const pos = this.getProductionOrders();
      // Find the specific PO or the first pending/in-progress one
      const poIndex = poId 
        ? pos.findIndex(p => p.id === poId)
        : pos.findIndex(p => p.partId === cleanId && p.stageId === stageId && p.status !== 'COMPLETED');
      
      if (poIndex === -1) {
        throw new Error(`Lỗi: Không tìm thấy lệnh PO sản xuất hợp lệ cho linh kiện ${cleanId} tại công đoạn ${STAGES.find(s => s.id === stageId)?.name}. Vui lòng tạo Lệnh sản xuất trước khi thực hiện.`);
      }

      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity) {
          throw new Error(`Lỗi: Số lượng sản xuất (${po.producedQuantity + quantity}) vượt quá mục tiêu PO (${po.targetQuantity}) cho ${cleanId} tại ${stageId}`);
        }
        
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
              // masterPo.producedQuantity = masterPo.targetQuantity; 
            } else {
              masterPo.status = 'IN_PROGRESS';
            }
          }
        }

        this.saveProductionOrders(pos);
      }
    } else if (sourceLocation === 'OUT') {
      // EXPORTING: Update exportedQuantity
      const pos = this.getProductionOrders();
      const poIndex = poId ? pos.findIndex(p => p.id === poId) : -1;
      
      if (poIndex === -1) {
        throw new Error(`Lỗi: Không tìm thấy lệnh PO sản xuất hợp lệ để thực hiện xuất kho QR cho linh kiện ${cleanId}.`);
      }

      if (poIndex !== -1) {
        const po = pos[poIndex];
        if ((po.exportedQuantity || 0) + quantity > po.producedQuantity) {
          throw new Error(`Lỗi: Số lượng xuất (${(po.exportedQuantity || 0) + quantity}) vượt quá số lượng đã sản xuất (${po.producedQuantity}) cho PO ${po.id}`);
        }
        po.exportedQuantity = (po.exportedQuantity || 0) + quantity;
        
        // PO is completed only if both production and export are done
        const isProduced = po.producedQuantity >= po.targetQuantity;
        const isExported = po.exportedQuantity >= po.targetQuantity;
        const newStatus = (isProduced && isExported) ? 'COMPLETED' : 'IN_PROGRESS';
        if (newStatus === 'COMPLETED' && po.status !== 'COMPLETED') {
          po.completedAt = Date.now();
        }
        po.status = newStatus;
        
        // Update master PO status if needed
        if (po.masterPoId) {
          const masterPo = pos.find(p => p.id === po.masterPoId);
          if (masterPo) {
            const allSubPos = pos.filter(p => p.masterPoId === po.masterPoId);
            const allCompleted = allSubPos.every(p => p.status === 'COMPLETED');
            if (allCompleted) {
              if (masterPo.status !== 'COMPLETED') masterPo.completedAt = Date.now();
              masterPo.status = 'COMPLETED';
            } else {
              masterPo.status = 'IN_PROGRESS';
            }
          }
        }

        this.saveProductionOrders(pos);
      }
    }

    // 1. Inventory movement
    if (sourceLocation === 'IN') {
      // Move IN -> OUT (Finish production)
      // Apply BOM deduction before updating inventory
      // We use cleanId for BOM lookup as the BOM schema uses the original IDs
      this.applyBOMDeduction(cleanId, stageId, quantity);
      
      this.updateInventory(effectiveId, stageId, 'IN', -quantity);
      this.updateInventory(effectiveId, stageId, 'OUT', quantity);
    } else {
      // Deduct from OUT (Export already finished items)
      this.updateInventory(effectiveId, stageId, 'OUT', -quantity);
    }

    // 2. Record transaction
    const transactions = this.getTransactions();
    const parts = this.getParts();
    // Get master PO ID and target quantities if exists
    const pos = this.getProductionOrders();
    const po = pos.find(p => p.id === linkedPoId);
    const masterPoId = po?.masterPoId || '';
    const subPoTargetQty = po?.targetQuantity || 0;
    const masterPo = masterPoId ? pos.find(p => p.id === masterPoId) : undefined;
    const masterPoTargetQty = masterPo?.targetQuantity || 0;
    
    // Generate a shorter unique ID: 10 chars should be enough for local context
    const txId = Math.random().toString(36).substring(2, 12).toUpperCase();
    const timestamp = Date.now();
    
    // ONLY generate QR data if exporting from OUT
    const qrData = sourceLocation === 'OUT' 
      ? `${linkedPoId || effectiveId}|${quantity}|${stageId}|${timestamp}|${txId}|${targetStageId || ''}||${masterPoId}|${subPoTargetQty}|${masterPoTargetQty}`
      : undefined;

    const newTransaction: Transaction = {
      id: txId,
      type: 'STAGE_OUT',
      partId: effectiveId,
      originalPartId: (effectiveId !== cleanId) ? cleanId : undefined,
      quantity,
      stageId,
      targetStageId,
      timestamp: Date.now(),
      qrData,
      poId: linkedPoId
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);

    // Save to label history if it's a QR label
    if (qrData) {
      this.saveLabel(newTransaction);
    }

    return newTransaction;
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

    let partId = idOrPo.split(' - ')[0];
    let linkedPoId: string | undefined;

    if (idOrPo.startsWith('PO-')) {
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

    if (!linkedPoId) {
      throw new Error('Lỗi: Nhãn QR này không chứa thông tin Lệnh sản xuất (PO). Không thể nhập kho.');
    }

    // 3. Add to currentStage target location
    // FORCE targetLocation to 'IN' when scanning QR code as per user request
    const finalTargetLocation = 'IN';
    
    // Part Transformation Logic: Only check for transformation at the moment of entry (IN)
    const finalPartId = this.getEffectivePartId(partId, currentStageId);
    const isTransformed = finalPartId !== partId.trim().toUpperCase();

    this.updateInventory(finalPartId, currentStageId, finalTargetLocation, quantity);

    // 4. Record transaction
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substring(2, 12).toUpperCase(),
      type: 'STAGE_IN',
      partId: finalPartId,
      originalPartId: isTransformed ? partId : undefined, // Track original if transformed
      quantity,
      stageId: currentStageId,
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

  recordManualInbound(partId: string, stageId: StageId, location: 'IN' | 'OUT', quantity: number, poId?: string) {
    const cleanId = partId.split(' - ')[0];
    let linkedPoId = poId;

    // Check for required PO
    const isLaserMaterialInbound = stageId === 'LASER' && location === 'IN';
    const pos = this.getProductionOrders();
    const poIndex = poId 
      ? pos.findIndex(p => p.id === poId)
      : pos.findIndex(p => p.partId === cleanId && p.stageId === stageId && p.status !== 'COMPLETED');
    
    if (poIndex === -1 && !isLaserMaterialInbound) {
      throw new Error(`Lỗi: Không tìm thấy lệnh PO sản xuất hợp lệ cho linh kiện ${cleanId} tại công đoạn ${STAGES.find(s => s.id === stageId)?.name}. Chức năng nhập kho thủ công cũng yêu cầu phải có PO.`);
    }

    // Apply BOM logic if entering into OUT (Production result)
    if (location === 'OUT') {
      this.applyBOMDeduction(cleanId, stageId, quantity);

      // Update PO progress
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity) {
          throw new Error(`Lỗi: Số lượng sản xuất (${po.producedQuantity + quantity}) vượt quá mục tiêu PO (${po.targetQuantity}) cho ${cleanId} tại ${stageId}`);
        }
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
              // masterPo.producedQuantity = masterPo.targetQuantity; 
            } else {
              masterPo.status = 'IN_PROGRESS';
            }
          }
        }

        this.saveProductionOrders(pos);
      }
    }

    // Part Transformation Logic
    const finalPartId = (location === 'IN') 
      ? this.getEffectivePartId(cleanId, stageId)
      : cleanId;
      
    const isTransformed = (location === 'IN' && finalPartId !== cleanId);

    this.updateInventory(finalPartId, stageId, location, quantity);
    
    const transactions = this.getTransactions();
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substring(2, 12).toUpperCase(),
      type: 'STAGE_IN',
      partId: finalPartId,
      originalPartId: isTransformed ? cleanId : undefined,
      quantity,
      stageId,
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

  recordDefect(partId: string, stageId: StageId, quantity: number, reason: string, category: string, poId?: string) {
    const cleanId = partId.split(' - ')[0].trim().toUpperCase();
    
    // 1. Validation: Ensure we have enough stock in IN to mark as defect
    const inventory = this.getInventory();
    const effectiveId = this.getEffectivePartId(cleanId, stageId);
    const stock = inventory.find(
      (item) => item.partId === effectiveId && item.stageId === stageId && item.location === 'IN'
    );

    if (!stock || stock.quantity < quantity) {
      const part = this.getParts().find(p => p.id === effectiveId);
      throw new Error(`Lỗi: Số lượng báo lỗi (${quantity}) lớn hơn tồn kho IN của ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name} (Hiện có ${stock?.quantity || 0})`);
    }

    // 2. Inventory movement: Deduct from IN, Add to DEFECT
    this.updateInventory(effectiveId, stageId, 'IN', -quantity);
    this.updateInventory(effectiveId, stageId, 'DEFECT', quantity);

    // 3. Record transaction
    const transactions = this.getTransactions();
    const txId = `DF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const newTransaction: Transaction = {
      id: txId,
      type: 'DEFECT',
      partId: effectiveId,
      originalPartId: (effectiveId !== cleanId) ? cleanId : undefined,
      quantity,
      stageId,
      timestamp: Date.now(),
      defectReason: reason,
      defectCategory: category,
      poId: poId
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);

    // Auto-create supplementary POs for compensation if stage is Bending, Welding, or Painting
    if (['BENDING', 'WELDING', 'PAINTING'].includes(stageId)) {
      try {
        const orders = this.getProductionOrders();
        const currentPo = poId ? orders.find(o => o.id === poId) : null;
        const targetMasterPoId = currentPo?.masterPoId || currentPo?.id || `SUPP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        // We use createMasterPO logic but we need to ensure it only targets this specific part and its sub-components
        // To avoid side effects, we can just manually trigger a small-scale creation if possible, 
        // OR just call createMasterPO with the partId as the "modelId".
        // Calling createMasterPO(effectiveId, quantity, Date.now()) is the most robust way to get the full BOM tree for compensation.
        // We use "REPAIR" as prefix to differentiate from regular POs
        this.createMasterPO(effectiveId, quantity, Date.now(), undefined, "REPAIR");
        
        // Optional: We could tag these new POs as supplementary in their IDs or a field
        // But createMasterPO already creates unique IDs.
      } catch (err) {
        console.error("Failed to create supplementary PO:", err);
      }
    }

    return newTransaction;
  },

  recordDisposal(partId: string, stageId: StageId, quantity: number) {
    const cleanId = partId.split(' - ')[0].trim().toUpperCase();
    
    // 1. Validation
    const inventory = this.getInventory();
    const effectiveId = this.getEffectivePartId(cleanId, stageId);
    const stock = inventory.find(
      (item) => item.partId === effectiveId && item.stageId === stageId && item.location === 'DEFECT'
    );

    if (!stock || stock.quantity < quantity) {
      const part = this.getParts().find(p => p.id === effectiveId);
      throw new Error(`Lỗi: Số lượng xuất hủy (${quantity}) lớn hơn tồn kho DEFECT của ${part?.name || effectiveId} tại ${STAGES.find(s => s.id === stageId)?.name} (Hiện có ${stock?.quantity || 0})`);
    }

    // 2. Inventory move: Deduct from DEFECT
    this.updateInventory(effectiveId, stageId, 'DEFECT', -quantity);

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
    return getCached(STORAGE_KEYS.PRODUCTION_ORDERS, () => {
      const data = localStorage.getItem(STORAGE_KEYS.PRODUCTION_ORDERS);
      return data ? JSON.parse(data) : [];
    });
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
    for (let day = 0; day < 10; day++) {
      const baseDay = startOfDay(checkTime);
      const workingIntervals: { start: Date, end: Date }[] = [];
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
      checkTime = startOfDay(addDays(baseDay, 1));
    }
    return timestamp;
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

  createMasterPO(modelId: string, quantity: number, plannedStartTime?: number, customLeadTime?: number, idPrefix: string = "PO") {
    const { masterPo, allChildPOs } = this.calculateMasterPOSchedule(modelId, quantity, plannedStartTime, customLeadTime, idPrefix);
    const pos = this.getProductionOrders();
    const updatedPOs = [masterPo, ...allChildPOs, ...pos];
    this.saveProductionOrders(updatedPOs);
    return masterPo;
  },

  previewMasterPOCompletion(modelId: string, quantity: number, plannedStartTime?: number, customLeadTime?: number): number {
    const { masterPo } = this.calculateMasterPOSchedule(modelId, quantity, plannedStartTime, customLeadTime, "PO");
    return masterPo.expectedCompletionTime || Date.now();
  },

  calculateMasterPOSchedule(modelId: string, quantity: number, plannedStartTime?: number, customLeadTime?: number, idPrefix: string = "PO") {
    const pos = this.getProductionOrders(); // Still needed for unique ID check
    const timestamp = Date.now();
    const shiftConfigs = this.getShiftConfigs();
    const baseStartTime = plannedStartTime || timestamp;
    const dateStr = format(baseStartTime, 'ddMM');
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
    const modelBom = this.getModelBOM();
    const bomV2 = this.getBOMV2();

    // 1. Build part dependency map and collect required parts
    const requiredParts = new Map<string, { qty: number; minLevel: number; }>();
    const level1Children = new Map<string, string[]>();

    const traverseBOM = (currentId: string, currentQty: number, level: number, parentId: string | null) => {
      if (level > 20) return;
      if (level > 0) {
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
      const v1Idx = modelBom.filter(b => b.modelId === currentId);
      for (const ing of v1Idx) {
        traverseBOM(ing.partId, currentQty * ing.quantity, level + 1, (level === 0) ? null : (level === 1 ? currentId : parentId));
      }
      const v2Idx = bomV2.filter(b => b.resultPartId === currentId);
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

    const addPoToList = (partId: string, info: any, stageId: StageId, list: ProductionOrder[]) => {
      const { qty, minLevel: level } = info;
      const part = partsList.find(p => p.id === partId);
      if (stageId === 'BENDING' && part?.skipBending) return;
      if (stageId === 'WELDING' && part?.skipWelding) return;
      if (stageId === 'PAINTING' && (part?.skipPainting || level > 1)) return;
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
      const hasIngredients = bomV2.some(b => b.resultPartId === partId);
      if (!hasIngredients) {
        addPoToList(partId, info, 'LASER', laserPOs);
        addPoToList(partId, info, 'BENDING', bendingPOs);
      }
      if (hasIngredients || level === 1) {
        addPoToList(partId, info, 'WELDING', weldingPOs);
      }
      if (level === 1) {
        addPoToList(partId, info, 'PAINTING', paintingPOs);
      }
    });

    const partStageFinishTime = new Map<string, Map<StageId, number>>(); 
    const allChildPOs: ProductionOrder[] = [];
    const laserNesting = this.getLaserNesting();

    const recordFinish = (po: ProductionOrder, time: number) => {
      let stages = partStageFinishTime.get(po.partId);
      if (!stages) {
        stages = new Map<StageId, number>();
        partStageFinishTime.set(po.partId, stages);
      }
      stages.set(po.stageId as StageId, time);
    };

    const getFinishTime = (partId: string, stageId: StageId) => {
      return partStageFinishTime.get(partId)?.get(stageId) || baseStartTime;
    };

    let mFreeLaser = baseStartTime;
    const laserConfig = shiftConfigs.find(c => c.stageId === 'LASER');
    const laserWorkers = laserConfig?.workerCount || 1;
    if (laserNesting.length > 0) {
      const nestedGroupMap = new Map<string, ProductionOrder[]>();
      const individualLaserPOs: ProductionOrder[] = [];
      laserPOs.forEach(po => {
        const nest = laserNesting.find(ln => ln.partId === po.partId);
        if (nest) {
          const group = nestedGroupMap.get(nest.nestingId) || [];
          group.push(po);
          nestedGroupMap.set(nest.nestingId, group);
        } else {
          individualLaserPOs.push(po);
        }
      });
      individualLaserPOs.forEach(po => {
        const start = this.getNextWorkingTime(mFreeLaser, 'LASER', shiftConfigs);
        po.plannedStartTime = start;
        const norm = norms.find(n => n.partId === po.partId && n.stageId === 'LASER');
        const duration = norm ? (po.targetQuantity * norm.secondsPerUnit * 1000) / laserWorkers : 0;
        po.expectedCompletionTime = this.calculateEndTime(start, duration, 'LASER', shiftConfigs);
        mFreeLaser = po.expectedCompletionTime;
        recordFinish(po, mFreeLaser);
        allChildPOs.push(po);
      });
      nestedGroupMap.forEach((groupPOs, nestingId) => {
        let totalDur = 0;
        groupPOs.forEach(po => {
          const nest = laserNesting.find(ln => ln.partId === po.partId && ln.nestingId === nestingId);
          if (nest) totalDur += po.targetQuantity * nest.secondsPerUnit * 1000;
        });
        const adjustedDur = totalDur / laserWorkers;
        const start = this.getNextWorkingTime(mFreeLaser, 'LASER', shiftConfigs);
        const end = this.calculateEndTime(start, adjustedDur, 'LASER', shiftConfigs);
        groupPOs.forEach(po => {
        po.plannedStartTime = start;
        po.expectedCompletionTime = end;
          recordFinish(po, end);
          allChildPOs.push(po);
        });
        mFreeLaser = end;
      });
    } else {
      laserPOs.forEach(po => {
        const start = this.getNextWorkingTime(mFreeLaser, 'LASER', shiftConfigs);
        po.plannedStartTime = start;
        const norm = norms.find(n => n.partId === po.partId && n.stageId === 'LASER');
        const duration = norm ? (po.targetQuantity * norm.secondsPerUnit * 1000) / laserWorkers : 0;
        po.expectedCompletionTime = this.calculateEndTime(start, duration, 'LASER', shiftConfigs);
        mFreeLaser = po.expectedCompletionTime;
        recordFinish(po, mFreeLaser);
        allChildPOs.push(po);
      });
    }

    let mFreeBending = baseStartTime;
    const bendConfig = shiftConfigs.find(c => c.stageId === 'BENDING');
    const bendWorkers = bendConfig?.workerCount || 1;
    bendingPOs.forEach(po => {
      const laserEnd = getFinishTime(po.partId, 'LASER');
      const start = this.getNextWorkingTime(Math.max(mFreeBending, laserEnd), 'BENDING', shiftConfigs);
      po.plannedStartTime = start;
      const norm = norms.find(n => n.partId === po.partId && n.stageId === 'BENDING');
      const duration = norm ? (po.targetQuantity * norm.secondsPerUnit * 1000) / bendWorkers : 0;
      po.expectedCompletionTime = this.calculateEndTime(start, duration, 'BENDING', shiftConfigs);
      mFreeBending = po.expectedCompletionTime;
      recordFinish(po, mFreeBending);
      allChildPOs.push(po);
    });

    let mFreeWelding = baseStartTime;
    const weldConfig = shiftConfigs.find(c => c.stageId === 'WELDING');
    const weldWorkers = weldConfig?.workerCount || 1;
    weldingPOs.sort((a, b) => {
      const getReady = (pid: string) => {
        const children = level1Children.get(pid) || [];
        if (children.length === 0) return baseStartTime;
        return Math.max(...children.map(cid => {
          const bEnd = partStageFinishTime.get(cid)?.get('BENDING');
          if (bEnd !== undefined) return bEnd;
          return getFinishTime(cid, 'LASER');
        }));
      };
      return getReady(a.partId) - getReady(b.partId);
    });
    weldingPOs.forEach(po => {
      const children = level1Children.get(po.partId) || [];
      const componentsReadyTime = children.length === 0 ? baseStartTime : Math.max(...children.map(cid => {
        const bEnd = partStageFinishTime.get(cid)?.get('BENDING');
        if (bEnd !== undefined) return bEnd;
        return getFinishTime(cid, 'LASER');
      }));
      const start = this.getNextWorkingTime(Math.max(mFreeWelding, componentsReadyTime), 'WELDING', shiftConfigs);
      po.plannedStartTime = start;
      const norm = norms.find(n => n.partId === po.partId && n.stageId === 'WELDING');
      const duration = norm ? (po.targetQuantity * norm.secondsPerUnit * 1000) / weldWorkers : 0;
      po.expectedCompletionTime = this.calculateEndTime(start, duration, 'WELDING', shiftConfigs);
      mFreeWelding = po.expectedCompletionTime;
      recordFinish(po, mFreeWelding);
      allChildPOs.push(po);
    });

    let mFreePainting = baseStartTime;
    const paintConfig = shiftConfigs.find(c => c.stageId === 'PAINTING');
    const paintWorkers = paintConfig?.workerCount || 1;
    paintingPOs.forEach(po => {
      const weldEnd = getFinishTime(po.partId, 'WELDING');
      const start = this.getNextWorkingTime(Math.max(mFreePainting, weldEnd), 'PAINTING', shiftConfigs);
      po.plannedStartTime = start;
      const norm = norms.find(n => n.partId === po.partId && n.stageId === 'PAINTING');
      const duration = norm ? (po.targetQuantity * norm.secondsPerUnit * 1000) / paintWorkers : 0;
      po.expectedCompletionTime = this.calculateEndTime(start, duration, 'PAINTING', shiftConfigs);
      mFreePainting = po.expectedCompletionTime;
      recordFinish(po, mFreePainting);
      allChildPOs.push(po);
    });

    const masterPo: ProductionOrder = {
      id: masterPoId,
      partId: modelId,
      targetQuantity: quantity,
      producedQuantity: 0,
      exportedQuantity: 0,
      status: 'PENDING',
      createdAt: timestamp,
      plannedStartTime: baseStartTime,
      leadTime: customLeadTime,
      expectedCompletionTime: allChildPOs.length > 0 
        ? Math.max(...allChildPOs.filter(p => p.expectedCompletionTime).map(p => p.expectedCompletionTime!))
        : baseStartTime
    };
    return { masterPo, allChildPOs };
  },

  deletePO(id: string) {
    const pos = this.getProductionOrders();
    // If it's a master PO, delete all its children too
    const filtered = pos.filter(p => p.id !== id && p.masterPoId !== id);
    this.saveProductionOrders(filtered);
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
