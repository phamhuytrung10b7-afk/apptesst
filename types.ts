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
  poId?: string; // Link to production order
}

export interface BOMDefinition {
  parentPartId: string; // Level 3 part (Tôn tấm)
  childPartId: string;  // Level 2 part (Linh kiện)
  componentWeight: number; // KG of component per unit of child
  scrapWeight: number;     // KG of scrap per unit of child
}

export interface BOMDefinitionV2 {
  resultPartId: string;
  ingredientPartId: string;
  quantity: number; // Amount of ingredient per unit of result
}

export interface ModelBOMDefinition {
  modelId: string;
  partId: string; // Level 1 part
  quantity: number;
}

export interface ProductionOrder {
  id: string;
  masterPoId?: string; // Links to the top-level Model PO
  partId: string;
  stageId?: StageId; // Which stage this PO is for (null for Model PO)
  targetQuantity: number;
  producedQuantity: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: number;
}

export const STAGES: { id: StageId; name: string; nextStageId?: StageId }[] = [
  { id: 'LASER', name: 'Cắt Laser', nextStageId: 'BENDING' },
  { id: 'BENDING', name: 'Chấn/Dập', nextStageId: 'WELDING' },
  { id: 'WELDING', name: 'Hàn', nextStageId: 'PAINTING' },
  { id: 'PAINTING', name: 'Sơn' },
];

export const INITIAL_PARTS: Part[] = [];
