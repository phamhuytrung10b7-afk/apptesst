/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StageId = 'LASER' | 'BENDING' | 'WELDING' | 'PAINTING';

export interface Part {
  id: string;
  name: string;
  unit: string;
  level?: number;
}

export interface InventoryItem {
  partId: string;
  stageId: StageId;
  location: 'IN' | 'OUT';
  quantity: number;
}

export interface Transaction {
  id: string;
  type: 'STAGE_OUT' | 'STAGE_IN';
  partId: string;
  quantity: number;
  stageId: StageId;
  timestamp: number;
  qrData?: string;
  sourceStageId?: StageId; // For STAGE_IN, where it came from
  targetStageId?: StageId; // For STAGE_OUT, where it is intended to go
}

export interface BOMDefinition {
  parentPartId: string; // Level 3 part (Tôn tấm)
  childPartId: string;  // Level 2 part (Linh kiện)
  componentWeight: number; // KG of component per unit of child
  scrapWeight: number;     // KG of scrap per unit of child
}

export const STAGES: { id: StageId; name: string; nextStageId?: StageId }[] = [
  { id: 'LASER', name: 'Cắt Laser', nextStageId: 'BENDING' },
  { id: 'BENDING', name: 'Chấn/Dập', nextStageId: 'WELDING' },
  { id: 'WELDING', name: 'Hàn', nextStageId: 'PAINTING' },
  { id: 'PAINTING', name: 'Sơn' },
];

export const INITIAL_PARTS: Part[] = [
  { 
    id: '04-29-08-SHA76222KL-0013', 
    name: 'Khay sắt bình Nóng lạnh SHA76222KL(BD)', 
    unit: 'Cái', 
    level: 1 
  },
  { 
    id: '04-29-08-SHA76222KL-0007', 
    name: 'Tấm Khay sắt bình NL SHA76222KL', 
    unit: 'Cái', 
    level: 2
  },
  { 
    id: 'NVL-TT-1.2X1250X1500', 
    name: 'Tôn tấm 1.2x1250x1500', 
    unit: 'Tấm', 
    level: 3
  },
  { 
    id: 'PL-TON-SX', 
    name: 'Phế liệu tôn (SX)', 
    unit: 'Kg', 
    level: 3
  },
];
