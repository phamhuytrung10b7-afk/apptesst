import * as XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { Transaction, Part, ProductionOrder, GlazingPlan, GlazingPlanNorm, STAGES } from './types';
import { storageService } from './storage';

export const exportPreparationReport = (
  orders: ProductionOrder[],
  glazingPlans: GlazingPlan[],
  parts: Part[],
  glazingPlanNorms: GlazingPlanNorm[],
  selectedMasterPoIds: string[],
  expectedDateStr: string,
  weekName?: string
) => {
  const selectedDate = new Date(expectedDateStr);
  const ngayCan = format(selectedDate, 'dd/MM/yyyy');

  const sheetData: any[][] = [];
  const cleanWeekName = weekName?.replace(/^tuần\s*/i, '') || '';
  const titleText = weekName ? `BÁO CÁO CHUẨN BỊ LINH KIỆN LẮP RÁP TUẦN ${cleanWeekName.toUpperCase()}` : `BÁO CÁO CHUẨN BỊ LINH KIỆN LẮP RÁP`;
  
  const headerRow: any[] = ['STT', 'MODEL', 'TÊN LK', 'KH DCCK', 'NGÀY CẦN', 'KẾ HOẠCH', 'SL THỰC TẾ', 'SL CÒN LẠI', 'KẾT QUẢ', 'ĐỐI SÁCH', 'TÌNH TRẠNG'];
  
  sheetData.push([titleText]); // Title row matches index 0
  sheetData.push(headerRow);   // Header row matches index 1

  let rowIndex = 1;
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } } // Merge title across all 11 columns
  ];

  const selectedMasterPOs = orders.filter(o => selectedMasterPoIds.includes(o.id));
  const selectedGlazingPlans = glazingPlans.filter(p => selectedMasterPoIds.includes(p.id));
  
  selectedMasterPoIds.forEach(selectedId => {
    const masterPo = selectedMasterPOs.find(o => o.id === selectedId);
    const glazingPlan = selectedGlazingPlans.find(p => p.id === selectedId);

    let modelId = '';
    let displayModelName = '';
    let khDcck = '';
    let partGroups: Record<string, { keHoach: number, slThucTe: number, completedAt: number }> = {};

    if (masterPo) {
      modelId = masterPo.partId;
      const baseModelName = parts.find(p => p.id === modelId)?.name || modelId;
      displayModelName = `${baseModelName} (${masterPo.targetQuantity})`;
      khDcck = masterPo.expectedCompletionTime ? format(new Date(masterPo.expectedCompletionTime), 'dd/MM/yyyy') : '';

      const subOrders = orders.filter(o => o.masterPoId === masterPo.id && (o.stageId === 'PAINTING' || o.stageId === 'GLAZING'));
      partGroups = subOrders.reduce((acc, sub) => {
         if (!acc[sub.partId]) {
           acc[sub.partId] = { keHoach: 0, slThucTe: 0, completedAt: 0 };
         }
         acc[sub.partId].keHoach += sub.targetQuantity;
         acc[sub.partId].slThucTe += sub.exportedQuantity;
         if (sub.completedAt && sub.completedAt > acc[sub.partId].completedAt) {
           acc[sub.partId].completedAt = sub.completedAt;
         }
         return acc;
      }, {} as Record<string, { keHoach: number, slThucTe: number, completedAt: number }>);
    } else if (glazingPlan) {
      modelId = glazingPlan.modelId;
      const baseModelName = parts.find(p => p.id === modelId)?.name || modelId;
      displayModelName = `${baseModelName} (${glazingPlan.targetQuantity})`;
      khDcck = glazingPlan.expectedCompletionTime ? format(new Date(glazingPlan.expectedCompletionTime), 'dd/MM/yyyy') : '';

      const components = glazingPlanNorms.filter(n => n.appliedModel === modelId);
      components.forEach(c => {
         partGroups[c.id] = { keHoach: 0, slThucTe: 0, completedAt: glazingPlan.expectedCompletionTime || 0 };
         partGroups[c.id].keHoach += glazingPlan.targetQuantity;
         partGroups[c.id].slThucTe += (glazingPlan.producedQuantities || {})[c.id] || 0;
      });
    }

    if (!modelId || Object.keys(partGroups).length === 0) return;

    const startRowIdx = sheetData.length;
    let modelPrinted = false;

    const inventory = storageService.getInventory();
    const transformations = storageService.getTransformations();
    const bomV2 = storageService.getBOMV2();

    // Helper to find all available inventory for a part, including its source parts
    const traceInventoryBackwards = (partId: string, neededQty: number, modelId: string, visited: Set<string> = new Set(), depth = 0): Record<string, number> => {
      if (visited.has(partId)) return {};
      visited.add(partId);

      const result: Record<string, number> = {};
      
      // Check direct inventory for this part
      const partInventory = inventory.filter(i => i.partId === partId && i.quantity > 0);
      partInventory.forEach(item => {
        const stageName = STAGES.find(s => s.id === item.stageId)?.name || item.stageId;
        const key = `${stageName} (${item.location})`;
        // Include part name if it's a source part
        const partName = depth > 0 ? (parts.find(p => p.id === partId)?.name || partId) : '';
        const displayKey = depth > 0 ? `${partName} ở ${key}` : key;
        result[displayKey] = (result[displayKey] || 0) + item.quantity;
      });

      // Check transformations
      const relatedTransforms = transformations.filter(t => t.targetPartId === partId && (!t.applicableModel || t.applicableModel === modelId));
      relatedTransforms.forEach(t => {
        const subResult = traceInventoryBackwards(t.sourcePartId, neededQty, modelId, visited, depth + 1);
        Object.entries(subResult).forEach(([k, v]) => {
          result[k] = (result[k] || 0) + v;
        });
      });

      // Check BOM V2
      const relatedBoms = bomV2.filter(b => b.resultPartId === partId && (!b.applicableModel || b.applicableModel === modelId));
      relatedBoms.forEach(b => {
        const subResult = traceInventoryBackwards(b.ingredientPartId, neededQty * b.quantity, modelId, visited, depth + 1);
        Object.entries(subResult).forEach(([k, v]) => {
          // Store raw source quantities
          result[k] = (result[k] || 0) + v;
        });
      });

      return result;
    };

    const limitTime = selectedDate.getTime() - 24 * 60 * 60 * 1000;

    Object.entries(partGroups).forEach(([partId, data]) => {
       const part = parts.find(p => p.id === partId);
       const lkName = part?.name || partId;
       
       const { keHoach, slThucTe, completedAt } = data;
       const conLai = Math.max(keHoach - slThucTe, 0); 
       
       let ketQua = 'OK';
       let tinhTrang = '';
       
       if (conLai > 0) {
         ketQua = 'NG';
         const stageCounts = traceInventoryBackwards(partId, conLai, modelId);
         
         tinhTrang = Object.entries(stageCounts).map(([key, qty]) => {
           return `${key}: ${qty}`;
         }).join('\n');
       } else {
         if (completedAt > limitTime) {
           ketQua = 'NG';
           tinhTrang = 'hoàn thành trễ ngày cần';
         } else {
           ketQua = 'OK';
         }
       }

       sheetData.push([
         rowIndex++,
         !modelPrinted ? displayModelName : '', // Print model name only on first row of group
         lkName,
         khDcck,
         ngayCan,
         keHoach,
         slThucTe,
         conLai,
         ketQua,
         '', // Đối sách
         tinhTrang  // Tình trạng
       ]);
       modelPrinted = true;
    });

    const endRowIdx = sheetData.length - 1;
    if (endRowIdx > startRowIdx) {
      // Merge Model cell across rows for this model
      merges.push({ s: { r: startRowIdx, c: 1 }, e: { r: endRowIdx, c: 1 } });
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Styling
  const borderStyle = {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } }
  };

  const headerStyle = {
    font: { bold: true, sz: 11 },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderStyle
  };

  const titleStyle = {
    font: { bold: true, sz: 16 },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderStyle
  };

  ws['!merges'] = merges;

  // Set widths
  ws['!cols'] = [
    {wch: 5},   // STT
    {wch: 15},  // MODEL
    {wch: 45},  // TÊN LK
    {wch: 12},  // KH DCCK
    {wch: 12},  // NGÀY CẦN
    {wch: 10},  // KẾ HOẠCH
    {wch: 12},  // SL THỰC TẾ
    {wch: 12},  // SL CÒN LẠI
    {wch: 10},  // KẾT QUẢ
    {wch: 25},  // ĐỐI SÁCH
    {wch: 25}   // TÌNH TRẠNG
  ];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let R = 0; R <= range.e.r; ++R) {
    for (let C = 0; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

      if (R === 0) {
        ws[cellAddress].s = titleStyle;
      } else if (R === 1) {
        ws[cellAddress].s = headerStyle;
      } else {
        const val = ws[cellAddress].v;
        const sTemplate: any = { 
            border: borderStyle, 
            alignment: { vertical: "center", horizontal: "center", wrapText: true } 
        };
        
        if (C === 8 && val === 'NG') {
            sTemplate.fill = { fgColor: { rgb: "FF0000" } };
            sTemplate.font = { color: { rgb: "000000" } };
        } else if (C === 8 && val === 'OK') {
            sTemplate.fill = { fgColor: { rgb: "00B050" } };
            sTemplate.font = { color: { rgb: "000000" } };
        }
        
        ws[cellAddress].s = sTemplate;
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lắp ráp 2');
  XLSX.writeFile(wb, `BaoCao_ChuanBi_LK_LapRap_${format(selectedDate, 'yyyyMMdd')}.xlsx`);
};
