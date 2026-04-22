/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, Transaction, StageId, STAGES, INITIAL_PARTS, Part, BOMDefinition, BOMDefinitionV2, ProductionOrder, ModelBOMDefinition, ProductivityNorm, LaserNesting, ShiftConfig } from './types';
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
};

export const storageService = {
  getLabelSettings() {
    const data = localStorage.getItem(STORAGE_KEYS.LABEL_SETTINGS);
    return data ? JSON.parse(data) : { width: 100, height: 50, fontSize: 14, qrSize: 120 };
  },

  saveLabelSettings(settings: any) {
    localStorage.setItem(STORAGE_KEYS.LABEL_SETTINGS, JSON.stringify(settings));
  },
  getParts(): Part[] {
    const data = localStorage.getItem(STORAGE_KEYS.PARTS);
    return data ? JSON.parse(data) : INITIAL_PARTS;
  },

  saveParts(parts: Part[]) {
    localStorage.setItem(STORAGE_KEYS.PARTS, JSON.stringify(parts));
  },

  getBOM(): BOMDefinition[] {
    const data = localStorage.getItem(STORAGE_KEYS.BOM);
    return data ? JSON.parse(data) : [];
  },

  saveBOM(bom: BOMDefinition[]) {
    localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(bom));
  },

  getBOMV2(): BOMDefinitionV2[] {
    const data = localStorage.getItem(STORAGE_KEYS.BOM_V2);
    return data ? JSON.parse(data) : [];
  },

  saveBOMV2(bom: BOMDefinitionV2[]) {
    localStorage.setItem(STORAGE_KEYS.BOM_V2, JSON.stringify(bom));
  },

  getModelBOM(): ModelBOMDefinition[] {
    const data = localStorage.getItem(STORAGE_KEYS.MODEL_BOM);
    return data ? JSON.parse(data) : [];
  },

  saveModelBOM(bom: ModelBOMDefinition[]) {
    localStorage.setItem(STORAGE_KEYS.MODEL_BOM, JSON.stringify(bom));
  },
  
  getNorms(): ProductivityNorm[] {
    const data = localStorage.getItem(STORAGE_KEYS.NORMS);
    return data ? JSON.parse(data) : [];
  },

  saveNorms(norms: ProductivityNorm[]) {
    localStorage.setItem(STORAGE_KEYS.NORMS, JSON.stringify(norms));
  },

  getLaserNesting(): LaserNesting[] {
    const data = localStorage.getItem(STORAGE_KEYS.LASER_NESTING);
    return data ? JSON.parse(data) : [];
  },

  saveLaserNesting(nesting: LaserNesting[]) {
    localStorage.setItem(STORAGE_KEYS.LASER_NESTING, JSON.stringify(nesting));
  },
  
  getShiftConfigs(): ShiftConfig[] {
    const data = localStorage.getItem(STORAGE_KEYS.SHIFT_CONFIGS);
    if (data) return JSON.parse(data);
    
    // Default configs
    return [
      {
        stageId: 'LASER',
        workerCount: 1,
        shifts: [
          { start: '06:00', end: '14:00' },
          { start: '14:00', end: '22:00' }
        ],
        breaks: [
          { start: '09:00', end: '09:15' },
          { start: '12:00', end: '13:00' },
          { start: '15:00', end: '15:15' },
          { start: '18:00', end: '18:30' }
        ]
      },
      {
        stageId: 'BENDING',
        workerCount: 1,
        shifts: [{ start: '08:00', end: '17:00' }],
        breaks: [{ start: '12:00', end: '13:00' }]
      },
      {
        stageId: 'WELDING',
        workerCount: 1,
        shifts: [{ start: '08:00', end: '17:00' }],
        breaks: [{ start: '12:00', end: '13:00' }]
      },
      {
        stageId: 'PAINTING',
        workerCount: 1,
        shifts: [{ start: '08:00', end: '17:00' }],
        breaks: [{ start: '12:00', end: '13:00' }]
      }
    ];
  },

  saveShiftConfigs(configs: ShiftConfig[]) {
    localStorage.setItem(STORAGE_KEYS.SHIFT_CONFIGS, JSON.stringify(configs));
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

  getInventory(): InventoryItem[] {
    const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    return data ? JSON.parse(data) : [];
  },

  getTransactions(): Transaction[] {
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : [];
  },

  saveInventory(inventory: InventoryItem[]) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
  },

  saveTransactions(transactions: Transaction[]) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  },

  getLabels(): Transaction[] {
    const data = localStorage.getItem('wip_labels');
    return data ? JSON.parse(data) : [];
  },

  saveLabel(label: Transaction) {
    const labels = this.getLabels();
    localStorage.setItem('wip_labels', JSON.stringify([label, ...labels]));
  },

  deleteLabel(id: string) {
    const labels = this.getLabels();
    localStorage.setItem('wip_labels', JSON.stringify(labels.filter(l => l.id !== id)));
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

  updateInventory(partId: string, stageId: StageId, location: 'IN' | 'OUT', delta: number) {
    const inventory = this.getInventory();
    const index = inventory.findIndex(
      (item) => item.partId === partId && item.stageId === stageId && item.location === location
    );

    if (index >= 0) {
      inventory[index].quantity += delta;
      // Precision handling: round to 4 decimal places to avoid floating point issues
      inventory[index].quantity = Math.round(inventory[index].quantity * 10000) / 10000;
      if (inventory[index].quantity < 0) inventory[index].quantity = 0;
    } else {
      inventory.push({ partId, stageId, location, quantity: Math.max(0, delta) });
    }

    this.saveInventory(inventory);
  },

  setInventoryQuantity(partId: string, stageId: StageId, location: 'IN' | 'OUT', quantity: number) {
    const inventory = this.getInventory();
    const index = inventory.findIndex(
      (item) => item.partId === partId && item.stageId === stageId && item.location === location
    );

    if (index >= 0) {
      inventory[index].quantity = Math.max(0, quantity);
    } else {
      inventory.push({ partId, stageId, location, quantity: Math.max(0, quantity) });
    }

    this.saveInventory(inventory);
  },

  deleteInventoryItem(partId: string, stageId: StageId, location: 'IN' | 'OUT') {
    const inventory = this.getInventory();
    const filtered = inventory.filter(
      (item) => !(item.partId === partId && item.stageId === stageId && item.location === location)
    );
    this.saveInventory(filtered);
  },

  applyBOMDeduction(partId: string, stageId: StageId, quantity: number) {
    const parts = this.getParts();
    
    // Laser stage specific logic (BOM V1):
    // Deduct Level 3 parts from Laser IN based on BOM when Level 2 is produced
    if (stageId === 'LASER') {
      const bom = this.getBOM();
      const bomDef = bom.find(b => b.childPartId === partId);
      
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
      const allIngredients = bomV2.filter(b => b.resultPartId === partId);
      const ingredients = allIngredients.filter(ing => {
        const p = parts.find(part => part.id === ing.ingredientPartId);
        return !p?.skipWelding;
      });
      
      if (ingredients.length > 0) {
        const inventory = this.getInventory();
        for (const ing of ingredients) {
          const needed = quantity * ing.quantity;
          const stock = inventory.find(i => i.partId === ing.ingredientPartId && i.stageId === 'WELDING' && i.location === 'IN');
          if (!stock || stock.quantity < needed) {
            const ingPart = parts.find(p => p.id === ing.ingredientPartId);
            throw new Error(`Lỗi: Không đủ tồn kho ${ingPart?.name || ing.ingredientPartId} tại WELDING_IN. Cần ${needed} ${ingPart?.unit || ''}, hiện có ${stock?.quantity || 0}`);
          }
        }
        for (const ing of ingredients) {
          this.updateInventory(ing.ingredientPartId, 'WELDING', 'IN', -(quantity * ing.quantity));
        }
      }
    }

    // Painting stage deduction for ingredients that skipped welding
    if (stageId === 'PAINTING') {
      const bomV2 = this.getBOMV2();
      const allIngredients = bomV2.filter(b => b.resultPartId === partId);
      const skipWeldedIngredients = allIngredients.filter(ing => {
        const p = parts.find(part => part.id === ing.ingredientPartId);
        return p?.skipWelding;
      });

      if (skipWeldedIngredients.length > 0) {
        const inventory = this.getInventory();
        for (const ing of skipWeldedIngredients) {
          const needed = quantity * ing.quantity;
          const stock = inventory.find(i => i.partId === ing.ingredientPartId && i.stageId === 'PAINTING' && i.location === 'IN');
          if (!stock || stock.quantity < needed) {
            const ingPart = parts.find(p => p.id === ing.ingredientPartId);
            throw new Error(`Lỗi: Không đủ tồn kho ${ingPart?.name || ing.ingredientPartId} tại PAINTING_IN. Cần ${needed} ${ingPart?.unit || ''}, hiện có ${stock?.quantity || 0}`);
          }
        }
        for (const ing of skipWeldedIngredients) {
          this.updateInventory(ing.ingredientPartId, 'PAINTING', 'IN', -(quantity * ing.quantity));
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
    // Validation: Check if source location has enough quantity
    const inventory = this.getInventory();
    const stock = inventory.find(
      (item) => item.partId === partId && item.stageId === stageId && item.location === sourceLocation
    );

    if (!stock || stock.quantity < quantity) {
      throw new Error(`Lỗi: Số lượng xuất (${quantity}) lớn hơn tồn kho tại ${STAGES.find(s => s.id === stageId)?.name}_${sourceLocation} (${stock?.quantity || 0})`);
    }

    let linkedPoId = poId;

    // 0. Update Production Order progress if producing (IN -> OUT)
    if (sourceLocation === 'IN') {
      const pos = this.getProductionOrders();
      // Find the specific PO or the first pending/in-progress one
      const poIndex = poId 
        ? pos.findIndex(p => p.id === poId)
        : pos.findIndex(p => p.partId === partId && p.stageId === stageId && p.status !== 'COMPLETED');
      
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity) {
          throw new Error(`Lỗi: Số lượng sản xuất (${po.producedQuantity + quantity}) vượt quá mục tiêu PO (${po.targetQuantity}) cho ${partId} tại ${stageId}`);
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
      
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if ((po.exportedQuantity || 0) + quantity > po.producedQuantity) {
          throw new Error(`Lỗi: Số lượng xuất (${(po.exportedQuantity || 0) + quantity}) vượt quá số lượng đã sản xuất (${po.producedQuantity}) cho PO ${po.id}`);
        }
        po.exportedQuantity = (po.exportedQuantity || 0) + quantity;
        
        // PO is completed only if both production and export are done
        const isProduced = po.producedQuantity >= po.targetQuantity;
        const isExported = po.exportedQuantity >= po.targetQuantity;
        po.status = (isProduced && isExported) ? 'COMPLETED' : 'IN_PROGRESS';
        
        // Update master PO status if needed
        if (po.masterPoId) {
          const masterPo = pos.find(p => p.id === po.masterPoId);
          if (masterPo) {
            const allSubPos = pos.filter(p => p.masterPoId === po.masterPoId);
            const allCompleted = allSubPos.every(p => p.status === 'COMPLETED');
            masterPo.status = allCompleted ? 'COMPLETED' : 'IN_PROGRESS';
          }
        }

        this.saveProductionOrders(pos);
      }
    }

    // 1. Inventory movement
    if (sourceLocation === 'IN') {
      // Move IN -> OUT (Finish production)
      // Apply BOM deduction before updating inventory
      this.applyBOMDeduction(partId, stageId, quantity);
      
      this.updateInventory(partId, stageId, 'IN', -quantity);
      this.updateInventory(partId, stageId, 'OUT', quantity);
    } else {
      // Deduct from OUT (Export already finished items)
      this.updateInventory(partId, stageId, 'OUT', -quantity);
    }

    // 2. Record transaction
    const transactions = this.getTransactions();
    const parts = this.getParts();
    const stage = STAGES.find(s => s.id === stageId);
    const part = parts.find(p => p.id === partId);
    
    // Get master PO ID and target quantities if exists
    const pos = this.getProductionOrders();
    const po = pos.find(p => p.id === linkedPoId);
    const masterPoId = po?.masterPoId || '';
    const subPoTargetQty = po?.targetQuantity || 0;
    const masterPo = masterPoId ? pos.find(p => p.id === masterPoId) : undefined;
    const masterPoTargetQty = masterPo?.targetQuantity || 0;
    
    const txId = crypto.randomUUID();
    const timestamp = Date.now();
    
    // ONLY generate QR data if exporting from OUT
    // Format: poIdOrPartId|quantity|sourceStageId|timestamp|txId|targetStageId|REMOVED_PART_NAME|masterPoId|subPoTargetQty|masterPoTargetQty
    // Note: partName is removed to avoid UTF-8 encoding issues with hardware scanners.
    const qrData = sourceLocation === 'OUT' 
      ? `${linkedPoId || partId}|${quantity}|${stageId}|${timestamp}|${txId}|${targetStageId || ''}||${masterPoId}|${subPoTargetQty}|${masterPoTargetQty}`
      : undefined;

    const newTransaction: Transaction = {
      id: txId,
      type: 'STAGE_OUT',
      partId,
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
    const quantity = parseFloat(quantityStr);

    let partId = idOrPo;
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

    // 3. Add to currentStage target location
    // FORCE targetLocation to 'IN' when scanning QR code as per user request
    const finalTargetLocation = 'IN';
    this.updateInventory(partId, currentStageId, finalTargetLocation, quantity);

    // 4. Record transaction
    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      type: 'STAGE_IN',
      partId,
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
    let linkedPoId = poId;

    // Apply BOM logic if entering into OUT (Production result)
    if (location === 'OUT') {
      this.applyBOMDeduction(partId, stageId, quantity);

      // Update PO progress
      const pos = this.getProductionOrders();
      const poIndex = poId 
        ? pos.findIndex(p => p.id === poId)
        : pos.findIndex(p => p.partId === partId && p.stageId === stageId && p.status !== 'COMPLETED');
      
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity) {
          throw new Error(`Lỗi: Số lượng sản xuất (${po.producedQuantity + quantity}) vượt quá mục tiêu PO (${po.targetQuantity}) cho ${partId} tại ${stageId}`);
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

    this.updateInventory(partId, stageId, location, quantity);
    
    const transactions = this.getTransactions();
    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      type: 'STAGE_IN',
      partId,
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
    };
  },

  getProductionOrders(): ProductionOrder[] {
    const data = localStorage.getItem(STORAGE_KEYS.PRODUCTION_ORDERS);
    return data ? JSON.parse(data) : [];
  },

  saveProductionOrders(orders: ProductionOrder[]) {
    localStorage.setItem(STORAGE_KEYS.PRODUCTION_ORDERS, JSON.stringify(orders));
  },

  createMasterPO(modelId: string, quantity: number) {
    const pos = this.getProductionOrders();
    const timestamp = Date.now();
    const dateStr = format(timestamp, 'ddMM');
    const modelPrefix = modelId.length > 8 ? modelId.substring(0, 8).toUpperCase() : modelId.toUpperCase();
    const generateUniqueId = (prefix: string) => {
      let newId = "";
      do {
        newId = `${prefix}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      } while (pos.some(p => p.id === newId));
      return newId;
    };

    const masterPoId = generateUniqueId(`PO-${modelPrefix}-${dateStr}`);
    const norms = this.getNorms();
    const partsList = this.getParts();
    const modelBom = this.getModelBOM();
    const bomV2 = this.getBOMV2();

    const laserPOs: ProductionOrder[] = [];
    const bendingPOs: ProductionOrder[] = [];
    const weldingPOs: ProductionOrder[] = [];
    const paintingPOs: ProductionOrder[] = [];

    // Collect all parts and their total quantities and LEVELS required in the hierarchy
    const requiredParts = new Map<string, { qty: number, minLevel: number }>();

    // Recursive helper to traverse BOM
    const traverseBOM = (currentId: string, currentQty: number, level: number) => {
      if (level > 0) {
        const existing = requiredParts.get(currentId);
        if (!existing || level < existing.minLevel) {
          requiredParts.set(currentId, { 
            qty: (existing?.qty || 0) + currentQty, 
            minLevel: level 
          });
        } else {
          requiredParts.set(currentId, { 
            ...existing, 
            qty: existing.qty + currentQty 
          });
        }
      }
      
      // 1. Check if this ID is a Model that has ModelBOM ingredients (creates Level 1)
      const modelIngredients = modelBom.filter(b => b.modelId === currentId);
      for (const ing of modelIngredients) {
        traverseBOM(ing.partId, currentQty * ing.quantity, level + 1);
      }

      // 2. Check if this ID is a Part that has BOM V2 ingredients (creates Level 2+)
      const ingredientsV2 = bomV2.filter(b => b.resultPartId === currentId);
      for (const ing of ingredientsV2) {
        traverseBOM(ing.ingredientPartId, currentQty * ing.quantity, level + 1);
      }
    };

    // Start traversal from the Model (Level 0)
    traverseBOM(modelId, quantity, 0);

    // For all parts found, check which stages they need based on their LEVEL
    requiredParts.forEach((info, partId) => {
      const { qty: totalQty, minLevel: level } = info;
      const part = partsList.find(p => p.id === partId);
      
      // Helper to add PO
      const addPo = (stageId: StageId, list: ProductionOrder[]) => {
        // Respect explicit skip flags from part configuration
        if (stageId === 'BENDING' && part?.skipBending) return;
        if (stageId === 'WELDING' && part?.skipWelding) return;

        list.push({
          id: generateUniqueId(`PO-${modelPrefix}-${dateStr}-${stageId}`),
          masterPoId: masterPoId,
          partId: partId,
          stageId: stageId,
          targetQuantity: totalQty,
          producedQuantity: 0,
          exportedQuantity: 0,
          status: 'PENDING',
          createdAt: timestamp
        });
      };

      // Apply User Rules:
      // Level 1 -> WELDING, PAINTING
      // Level 2+ -> LASER, BENDING
      if (level === 1) {
        addPo('WELDING', weldingPOs);
        addPo('PAINTING', paintingPOs);
      } else if (level >= 2) {
        addPo('LASER', laserPOs);
        addPo('BENDING', bendingPOs);
      }
    });

    // Sequential Scheduling
    let machineFreeTime = timestamp;
    const partAvailableTime = new Map<string, number>(); 
    const allChildPOs: ProductionOrder[] = [];
    const laserNesting = this.getLaserNesting();
    const shiftConfigs = this.getShiftConfigs();

    const scheduleSequence = (stageList: ProductionOrder[]) => {
      if (stageList.length === 0) return;
      const stageId = stageList[0].stageId as StageId;
      const config = shiftConfigs.find(c => c.stageId === stageId);
      const workerCount = config?.workerCount || 1;

      // Sort by previous stage completion time to maintain flow
      if (stageId !== 'LASER') {
        stageList.sort((a, b) => {
          const timeA = partAvailableTime.get(a.partId) || 0;
          const timeB = partAvailableTime.get(b.partId) || 0;
          return timeA - timeB;
        });
      }

      // Special logic for Laser with Nesting
      if (stageId === 'LASER' && laserNesting.length > 0) {
        const nestedPartIds = new Set(laserNesting.map(ln => ln.partId));
        const nestedPOs = stageList.filter(po => nestedPartIds.has(po.partId));
        const individualPOs = stageList.filter(po => !nestedPartIds.has(po.partId));

        // Individual Laser POs
        individualPOs.forEach(po => {
          po.createdAt = this.getNextWorkingTime(machineFreeTime, stageId, shiftConfigs);
          const norm = norms.find(n => n.partId === po.partId && n.stageId === po.stageId);
          if (norm) {
            const duration = (po.targetQuantity * norm.secondsPerUnit * 1000) / workerCount;
            po.expectedCompletionTime = this.calculateEndTime(po.createdAt, duration, stageId, shiftConfigs);
            machineFreeTime = po.expectedCompletionTime;
            partAvailableTime.set(po.partId, po.expectedCompletionTime);
          } else {
            po.expectedCompletionTime = undefined;
          }
          allChildPOs.push(po);
        });

        // Nested Laser POs
        const nestedGroups = new Map<string, ProductionOrder[]>();
        nestedPOs.forEach(po => {
          const nest = laserNesting.find(ln => ln.partId === po.partId);
          if (nest) {
            const group = nestedGroups.get(nest.nestingId) || [];
            group.push(po);
            nestedGroups.set(nest.nestingId, group);
          }
        });

        nestedGroups.forEach((groupPOs, nestingId) => {
          // Group logic: In a nesting program, the total machine time is the sum of time spent on each part unit required for this PO.
          // All parts in the same group start together and finish when the last required unit is cut.
          let totalGroupDurationMs = 0;
          groupPOs.forEach(po => {
            const nest = laserNesting.find(ln => ln.partId === po.partId && ln.nestingId === nestingId);
            if (nest) {
              totalGroupDurationMs += po.targetQuantity * nest.secondsPerUnit * 1000;
            }
          });

          // Adjusted by workerCount (Resources)
          const adjustedDuration = totalGroupDurationMs / workerCount;

          const groupStartTime = this.getNextWorkingTime(machineFreeTime, stageId, shiftConfigs);
          const groupEndTime = this.calculateEndTime(groupStartTime, adjustedDuration, stageId, shiftConfigs);

          groupPOs.forEach(po => {
            po.createdAt = groupStartTime;
            po.expectedCompletionTime = groupEndTime;
            // Mark part as available for the next stage
            partAvailableTime.set(po.partId, groupEndTime);
            allChildPOs.push(po);
          });
          
          // Machine is busy until the end of this group's total duration
          machineFreeTime = groupEndTime;
        });
      } else {
        // Standard sequential logic for other stages
        stageList.forEach(po => {
          const previousStageEnd = partAvailableTime.get(po.partId) || timestamp;
          const startTime = this.getNextWorkingTime(Math.max(machineFreeTime, previousStageEnd), stageId, shiftConfigs);
          
          po.createdAt = startTime;
          const norm = norms.find(n => n.partId === po.partId && n.stageId === po.stageId);
          if (norm) {
            const duration = (po.targetQuantity * norm.secondsPerUnit * 1000) / workerCount;
            po.expectedCompletionTime = this.calculateEndTime(startTime, duration, stageId, shiftConfigs);
            machineFreeTime = po.expectedCompletionTime;
            partAvailableTime.set(po.partId, po.expectedCompletionTime);
          } else {
            po.expectedCompletionTime = undefined;
            machineFreeTime = startTime;
          }
          allChildPOs.push(po);
        });
      }
    };

    // Correct sequential order: LASER -> BENDING -> WELDING -> PAINTING
    scheduleSequence(laserPOs);
    // Reset machine time for next stages if they use different machines (optional, but keep it sequential for now)
    // Actually, usually each stage has its own resource. 
    // To make it truly sequential across the whole shop, we don't reset machineFreeTime.
    // To allow parallel stages (e.g. Bending and Laser running at the same time on different parts), we would reset machineFreeTime for each stage list.
    // Based on user: "tiếp nối nhau" usually implies the whole process is a single chain.
    // However, LASER -> BENDING -> ... implies STAGE order.
    // Let's assume each stage has ONE machine. So machineFreeTime resets per stage, but partAvailability carries over.
    
    machineFreeTime = timestamp; 
    scheduleSequence(bendingPOs);
    
    machineFreeTime = timestamp;
    scheduleSequence(weldingPOs);
    
    machineFreeTime = timestamp;
    scheduleSequence(paintingPOs);

    // Create Master PO
    const masterPo: ProductionOrder = {
      id: masterPoId,
      partId: modelId,
      targetQuantity: quantity,
      producedQuantity: 0,
      exportedQuantity: 0,
      status: 'PENDING',
      createdAt: timestamp,
      // Master completion is the latest time any child part finishes Painting
      expectedCompletionTime: allChildPOs.length > 0 
        ? Math.max(...allChildPOs.filter(p => p.expectedCompletionTime).map(p => p.expectedCompletionTime!))
        : timestamp
    };

    // Save with unshift to show newest first
    const updatedPOs = [masterPo, ...allChildPOs, ...pos];
    this.saveProductionOrders(updatedPOs);
    
    return masterPo;
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
