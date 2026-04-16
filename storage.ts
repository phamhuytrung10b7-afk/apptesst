/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InventoryItem, Transaction, StageId, STAGES, INITIAL_PARTS, Part, BOMDefinition, BOMDefinitionV2, ProductionOrder, ModelBOMDefinition } from './types';

const STORAGE_KEYS = {
  INVENTORY: 'wip_inventory',
  TRANSACTIONS: 'wip_transactions',
  PARTS: 'wip_parts',
  BOM: 'wip_bom',
  BOM_V2: 'wip_bom_v2',
  LABEL_SETTINGS: 'wip_label_settings',
  PRODUCTION_ORDERS: 'wip_production_orders',
  MODEL_BOM: 'wip_model_bom',
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
    // Deduct ingredients from Welding IN when result is produced
    if (stageId === 'WELDING') {
      const bomV2 = this.getBOMV2();
      const ingredients = bomV2.filter(b => b.resultPartId === partId);
      
      if (ingredients.length > 0) {
        const inventory = this.getInventory();
        
        // Check if enough stock exists for ALL ingredients in Welding IN
        for (const ing of ingredients) {
          const needed = quantity * ing.quantity;
          const stock = inventory.find(i => i.partId === ing.ingredientPartId && i.stageId === 'WELDING' && i.location === 'IN');
          
          if (!stock || stock.quantity < needed) {
            const ingPart = parts.find(p => p.id === ing.ingredientPartId);
            throw new Error(`Lỗi: Không đủ tồn kho ${ingPart?.name || ing.ingredientPartId} tại WELDING_IN. Cần ${needed} ${ingPart?.unit || ''}, hiện có ${stock?.quantity || 0}`);
          }
        }
        
        // Deduct ingredients
        for (const ing of ingredients) {
          this.updateInventory(ing.ingredientPartId, 'WELDING', 'IN', -(quantity * ing.quantity));
        }
      }
    }
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

    let linkedPoId: string | undefined;

    // 0. Update Production Order progress if producing (IN -> OUT)
    if (sourceLocation === 'IN') {
      const pos = this.getProductionOrders();
      // Find the first pending or in-progress PO for this part and stage
      const poIndex = pos.findIndex(p => p.partId === partId && p.stageId === stageId && p.status !== 'COMPLETED');
      
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity) {
          throw new Error(`Lỗi: Số lượng sản xuất (${po.producedQuantity + quantity}) vượt quá mục tiêu PO (${po.targetQuantity}) cho ${partId} tại ${stageId}`);
        }
        
        po.producedQuantity += quantity;
        po.status = po.producedQuantity >= po.targetQuantity ? 'COMPLETED' : 'IN_PROGRESS';
        linkedPoId = po.id;

        // Check if all sub-POs for this master are completed
        if (po.masterPoId) {
          const masterPo = pos.find(p => p.id === po.masterPoId);
          if (masterPo) {
            const otherSubs = pos.filter(p => p.masterPoId === po.masterPoId && p.id !== po.id);
            const allSubsCompleted = po.status === 'COMPLETED' && otherSubs.every(s => s.status === 'COMPLETED');
            if (allSubsCompleted) {
              masterPo.status = 'COMPLETED';
              masterPo.producedQuantity = masterPo.targetQuantity; 
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
    
    const txId = crypto.randomUUID();
    const timestamp = Date.now();
    
    // ONLY generate QR data if exporting from OUT
    // Format: partId|quantity|sourceStageId|timestamp|txId|targetStageId
    // Removed Vietnamese names to avoid scan errors with non-UTF8 scanners
    const qrData = sourceLocation === 'OUT' 
      ? `${partId}|${quantity}|${stageId}|${timestamp}|${txId}|${targetStageId || ''}`
      : undefined;

    const newTransaction: Transaction = {
      id: txId,
      type: 'STAGE_OUT',
      partId,
      quantity,
      stageId,
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
    const parts = qrData.split('|');
    if (parts.length < 5) {
      throw new Error('Định dạng mã QR không hợp lệ hoặc không phải mã xuất kho OUT.');
    }
    
    // New Format: partId|quantity|sourceStageId|timestamp|txId|targetStageId
    const [partId, quantityStr, sourceStageId, , sourceTxId, targetStageId] = parts;
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
    let linkedPoId: string | undefined;

    // Apply BOM logic if entering into OUT (Production result)
    if (location === 'OUT') {
      this.applyBOMDeduction(partId, stageId, quantity);

      // Update PO progress
      const pos = this.getProductionOrders();
      const poIndex = pos.findIndex(p => p.partId === partId && p.stageId === stageId && p.status !== 'COMPLETED');
      if (poIndex !== -1) {
        const po = pos[poIndex];
        if (po.producedQuantity + quantity > po.targetQuantity) {
          throw new Error(`Lỗi: Số lượng sản xuất (${po.producedQuantity + quantity}) vượt quá mục tiêu PO (${po.targetQuantity}) cho ${partId} tại ${stageId}`);
        }
        po.producedQuantity += quantity;
        po.status = po.producedQuantity >= po.targetQuantity ? 'COMPLETED' : 'IN_PROGRESS';
        linkedPoId = po.id;

        // Check if all sub-POs for this master are completed
        if (po.masterPoId) {
          const masterPo = pos.find(p => p.id === po.masterPoId);
          if (masterPo) {
            const otherSubs = pos.filter(p => p.masterPoId === po.masterPoId && p.id !== po.id);
            const allSubsCompleted = po.status === 'COMPLETED' && otherSubs.every(s => s.status === 'COMPLETED');
            if (allSubsCompleted) {
              masterPo.status = 'COMPLETED';
              masterPo.producedQuantity = masterPo.targetQuantity; 
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
    const masterPoId = `PO-${Date.now()}`;
    const timestamp = Date.now();

    // 1. Create Master PO (Model Level)
    const masterPo: ProductionOrder = {
      id: masterPoId,
      partId: modelId,
      targetQuantity: quantity,
      producedQuantity: 0,
      status: 'PENDING',
      createdAt: timestamp
    };
    pos.unshift(masterPo);

    // 2. Explode to Level 1
    const modelBom = this.getModelBOM();
    const level1Ingredients = modelBom.filter(b => b.modelId === modelId);
    
    for (const l1Ing of level1Ingredients) {
      const l1Qty = quantity * l1Ing.quantity;
      
      // PO for Welding
      pos.unshift({
        id: `PO-WELD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        masterPoId: masterPoId,
        partId: l1Ing.partId,
        stageId: 'WELDING',
        targetQuantity: l1Qty,
        producedQuantity: 0,
        status: 'PENDING',
        createdAt: timestamp
      });

      // PO for Painting
      pos.unshift({
        id: `PO-PAINT-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        masterPoId: masterPoId,
        partId: l1Ing.partId,
        stageId: 'PAINTING',
        targetQuantity: l1Qty,
        producedQuantity: 0,
        status: 'PENDING',
        createdAt: timestamp
      });

      // 3. Explode to Level 2
      const bomV2 = this.getBOMV2();
      const level2Ingredients = bomV2.filter(b => b.resultPartId === l1Ing.partId);
      
      for (const l2Ing of level2Ingredients) {
        const l2Qty = l1Qty * l2Ing.quantity;
        
        // PO for Laser
        pos.unshift({
          id: `PO-LASER-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          masterPoId: masterPoId,
          partId: l2Ing.ingredientPartId,
          stageId: 'LASER',
          targetQuantity: l2Qty,
          producedQuantity: 0,
          status: 'PENDING',
          createdAt: timestamp
        });

        // PO for Bending
        pos.unshift({
          id: `PO-BEND-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          masterPoId: masterPoId,
          partId: l2Ing.ingredientPartId,
          stageId: 'BENDING',
          targetQuantity: l2Qty,
          producedQuantity: 0,
          status: 'PENDING',
          createdAt: timestamp
        });

        // Level 3 is raw material (sheets), no PO needed as per request
      }
    }

    this.saveProductionOrders(pos);
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
    localStorage.removeItem('wip_labels');
  },
};
