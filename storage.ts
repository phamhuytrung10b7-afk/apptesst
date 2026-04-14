/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, Transaction, StageId, STAGES, INITIAL_PARTS, Part, BOMDefinition } from './types';

const STORAGE_KEYS = {
  INVENTORY: 'wip_inventory',
  TRANSACTIONS: 'wip_transactions',
  PARTS: 'wip_parts',
  BOM: 'wip_bom',
};

export const storageService = {
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
    localStorage.setItem('wip_labels', JSON.stringify([label, ...labels].slice(0, 50)));
  },

  deleteLabel(id: string) {
    const labels = this.getLabels();
    localStorage.setItem('wip_labels', JSON.stringify(labels.filter(l => l.id !== id)));
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

  recordStageOut(partId: string, stageId: StageId, quantity: number, sourceLocation: 'IN' | 'OUT' = 'IN', targetStageId?: StageId) {
    // Validation: Check if source location has enough quantity
    const inventory = this.getInventory();
    const stock = inventory.find(
      (item) => item.partId === partId && item.stageId === stageId && item.location === sourceLocation
    );

    if (!stock || stock.quantity < quantity) {
      throw new Error(`Lỗi: Số lượng xuất (${quantity}) lớn hơn tồn kho tại ${STAGES.find(s => s.id === stageId)?.name}_${sourceLocation} (${stock?.quantity || 0})`);
    }

    // 1. Inventory movement
    if (sourceLocation === 'IN') {
      // Move IN -> OUT (Finish production)
      this.updateInventory(partId, stageId, 'IN', -quantity);
      this.updateInventory(partId, stageId, 'OUT', quantity);
    } else {
      // Deduct from OUT (Export already finished items)
      this.updateInventory(partId, stageId, 'OUT', -quantity);
    }

    // 2. Record transaction
    const transactions = this.getTransactions();
    const parts = this.getParts();
    const part = parts.find(p => p.id === partId);
    const stage = STAGES.find(s => s.id === stageId);
    const targetStage = targetStageId ? STAGES.find(s => s.id === targetStageId) : null;
    
    const txId = crypto.randomUUID();
    
    // ONLY generate QR data if exporting from OUT
    const qrData = sourceLocation === 'OUT' 
      ? `${partId}|${quantity}|${stageId}|${part?.name || ''}|${stage?.name || ''}|${Date.now()}|true|${txId}|${targetStageId || ''}|${targetStage?.name || ''}`
      : undefined;

    const newTransaction: Transaction = {
      id: txId,
      type: 'STAGE_OUT',
      partId,
      quantity,
      stageId,
      timestamp: Date.now(),
      qrData,
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
    const parts = qrData.split('|');
    if (parts.length < 8) {
      throw new Error('Định dạng mã QR không hợp lệ hoặc không phải mã xuất kho OUT.');
    }
    
    const [partId, quantityStr, sourceStageId, , , , , sourceTxId, targetStageId] = parts;
    const quantity = parseFloat(quantityStr);

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
    this.updateInventory(partId, currentStageId, targetLocation, quantity);

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
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);

    // 5. Update inventory for Level 2 parts if needed (BOM logic for Laser stage)
    // Actually, recordManualInbound has this logic, but recordStageIn should probably have it too if we scan a label.
    // Let's keep it consistent.
    
    return newTransaction;
  },

  recordManualInbound(partId: string, stageId: StageId, location: 'IN' | 'OUT', quantity: number) {
    // Laser stage specific logic:
    // When entering Level 2 parts into Laser OUT, deduct Level 3 parts from Laser IN based on BOM
    if (stageId === 'LASER' && location === 'OUT') {
      const parts = this.getParts();
      const part = parts.find(p => p.id === partId);
      
      if (part && part.level === 2) {
        const bom = this.getBOM();
        const bomDef = bom.find(b => b.childPartId === partId);
        
        if (bomDef) {
          const totalConsumption = quantity * (bomDef.componentWeight + bomDef.scrapWeight);
          const totalScrap = quantity * bomDef.scrapWeight;
          
          // Check if enough Level 3 stock exists in Laser IN
          const inventory = this.getInventory();
          const parentStock = inventory.find(i => i.partId === bomDef.parentPartId && i.stageId === 'LASER' && i.location === 'IN');
          
          if (!parentStock || parentStock.quantity < totalConsumption) {
            const parentPart = parts.find(p => p.id === bomDef.parentPartId);
            throw new Error(`Lỗi: Không đủ tồn kho ${parentPart?.name || bomDef.parentPartId} tại LASER_IN. Cần ${totalConsumption.toFixed(4)} kg, hiện có ${parentStock?.quantity || 0} kg`);
          }
          
          // 1. Deduct parent part (Tôn tấm) from Laser IN
          this.updateInventory(bomDef.parentPartId, 'LASER', 'IN', -totalConsumption);

          // 2. Add scrap to Laser OUT (or a dedicated scrap location)
          // We look for the scrap part ID 'PL-TON-SX' or similar
          const scrapPart = parts.find(p => p.id === 'PL-TON-SX' || p.name.toLowerCase().includes('phế liệu'));
          if (scrapPart) {
            this.updateInventory(scrapPart.id, 'LASER', 'OUT', totalScrap);
          }
        }
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
      qrData: 'MANUAL_ENTRY'
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

  resetAllData() {
    localStorage.removeItem(STORAGE_KEYS.INVENTORY);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.PARTS);
    localStorage.removeItem(STORAGE_KEYS.BOM);
    localStorage.removeItem('wip_labels');
  },
};
