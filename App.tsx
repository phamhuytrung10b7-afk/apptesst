/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, 
  PackagePlus, 
  QrCode, 
  History, 
  Settings,
  Edit2,
  Trash2,
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  Printer,
  X,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Search,
  Package,
  Monitor,
  Menu,
  FileUp,
  Layers,
  FileText,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { STAGES, INITIAL_PARTS, StageId, Part, InventoryItem, Transaction, BOMDefinition, BOMDefinitionV2, ProductionOrder, ModelBOMDefinition } from './types';
import { storageService } from './storage';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type View = 'dashboard' | 'produce' | 'inbound' | 'history' | 'settings' | 'labels' | 'po';

function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder = "Tìm kiếm...", 
  className = "" 
}: { 
  options: { id: string, label: string }[], 
  value: string, 
  onChange: (val: string) => void,
  placeholder?: string,
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase()) || 
    opt.id.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none bg-white cursor-pointer flex justify-between items-center"
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={20} className={cn("transition-transform", isOpen && "rotate-180")} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-[100] w-full mt-2 bg-white border-2 border-gray-100 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[400px]"
          >
            <div className="p-3 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Gõ để tìm kiếm..."
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 text-base outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => (
                  <div 
                    key={opt.id}
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "p-4 hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0",
                      value === opt.id && "bg-blue-50 text-blue-700 font-bold"
                    )}
                  >
                    <div className="text-base">{opt.label}</div>
                    <div className="text-xs font-mono opacity-50">{opt.id}</div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-400 italic">Không tìm thấy kết quả</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedStage, setSelectedStage] = useState<StageId>(STAGES[0].id);
  const [scanStage, setScanStage] = useState<StageId>(STAGES[0].id);
  const [selectedPart, setSelectedPart] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [labelSettings, setLabelSettings] = useState(storageService.getLabelSettings());

  useEffect(() => {
    // Initialize with some dummy data if empty
    const existing = storageService.getInventory();
    const existingParts = storageService.getParts();
    
    if (existingParts.length > 0 && !selectedPart) {
      setSelectedPart(existingParts[0].id);
    }

    refreshData();
  }, []);

  const refreshData = () => {
    setInventory(storageService.getInventory());
    setTransactions(storageService.getTransactions());
    const currentParts = storageService.getParts();
    setParts(currentParts);
    if (currentParts.length > 0 && !selectedPart) {
      setSelectedPart(currentParts[0].id);
    }
  };

  const handleProduce = (e: React.FormEvent, sourceLocation: 'IN' | 'OUT' = 'IN', targetStageId?: StageId, poId?: string) => {
    e.preventDefault();
    if (quantity <= 0) {
      setError('Vui lòng nhập số lượng hợp lệ');
      return;
    }

    try {
      const tx = storageService.recordStageOut(selectedPart, selectedStage, quantity, sourceLocation, targetStageId, poId);
      setLastTransaction(tx);
      const partName = parts.find(p => p.id === selectedPart)?.name || selectedPart;
      const locationName = sourceLocation === 'IN' ? 'KHO_IN' : 'KHO_OUT';
      setSuccess(`Đã xuất từ ${locationName} ${quantity} ${partName} tại ${STAGES.find(s => s.id === selectedStage)?.name}`);
      setQuantity(0);
      refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    }
  };

  const onScanSuccess = (decodedText: string, targetLocation: 'IN' | 'OUT' = 'IN') => {
    try {
      storageService.recordStageIn(decodedText, scanStage, targetLocation);
      setSuccess('Nhập kho thành công!');
      refreshData();
      // Don't switch view automatically, let user see the success detail
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dữ liệu QR không hợp lệ';
      setError(msg);
      throw err; // Re-throw to let ScanView know it failed
    }
  };

  const handleManualInbound = (partId: string, stageId: StageId, location: 'IN' | 'OUT', qty: number) => {
    try {
      storageService.recordManualInbound(partId, stageId, location, qty);
      setSuccess('Nhập kho thủ công thành công!');
      refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
      throw err;
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handlePrint = (label: Transaction) => {
    setLastTransaction(label);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Đã sao chép mã QR vào bộ nhớ tạm!');
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-gray-900 font-sans overflow-hidden print:bg-white">
      <style>
        {`
          @media print {
            @page {
              size: ${labelSettings.width}mm ${labelSettings.height}mm;
              margin: 0;
            }
            body * {
              visibility: hidden;
            }
            #print-area, #print-area * {
              visibility: visible;
            }
            #print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: ${labelSettings.width}mm;
              height: ${labelSettings.height}mm;
              padding: 5mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: white;
            }
            .no-print {
              display: none !important;
            }
          }
        `}
      </style>

      {/* Hidden Print Area */}
      <div id="print-area" className="hidden print:block">
        {lastTransaction && (
          <div className="w-full h-full bg-white text-black flex flex-col items-center p-4 box-border border-2 border-black">
            {/* QR Code Section */}
            <div className="mb-4 border-4 border-black p-2">
              <QRCodeSVG value={lastTransaction.qrData || ''} size={labelSettings.qrSize * 1.5} level="H" />
            </div>

            {/* Part Name & ID */}
            <div className="text-center w-full mb-4">
              <h1 className="font-black uppercase leading-tight" style={{ fontSize: `${labelSettings.fontSize + 10}px` }}>
                {parts.find(p => p.id === lastTransaction.partId)?.name || 'N/A'}
              </h1>
              <p className="font-mono font-bold mt-1" style={{ fontSize: `${labelSettings.fontSize}px` }}>
                Mã LK: {lastTransaction.partId}
              </p>
            </div>

            {/* Quantity & Source Stage */}
            <div className="grid grid-cols-2 w-full border-t-2 border-b-2 border-black py-4 mb-4">
              <div className="flex flex-col items-center border-r-2 border-black">
                <span className="text-[10px] font-bold uppercase opacity-60 mb-1">Số lượng:</span>
                <span className="font-black" style={{ fontSize: `${labelSettings.fontSize + 14}px` }}>
                  {lastTransaction.quantity} {parts.find(p => p.id === lastTransaction.partId)?.unit}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase opacity-60 mb-1">Từ công đoạn:</span>
                <span className="font-black uppercase" style={{ fontSize: `${labelSettings.fontSize + 6}px` }}>
                  {STAGES.find(s => s.id === lastTransaction.stageId)?.name}
                </span>
              </div>
            </div>

            {/* Route / Destination */}
            {lastTransaction.qrData?.split('|')[5] && (
              <div className="w-full bg-gray-100 p-3 rounded-lg border border-black mb-4 text-center">
                <span className="text-[10px] font-bold uppercase opacity-60 block mb-1">Đích tiếp theo:</span>
                <div className="flex items-center justify-center gap-4 font-black" style={{ fontSize: `${labelSettings.fontSize + 2}px` }}>
                  <span className="uppercase">{STAGES.find(s => s.id === lastTransaction.stageId)?.name}</span>
                  <span className="text-2xl">→</span>
                  <span className="uppercase">
                    {STAGES.find(s => s.id === lastTransaction.qrData!.split('|')[5])?.name || lastTransaction.qrData!.split('|')[5]}
                  </span>
                </div>
              </div>
            )}

            {/* Footer: ID & Time */}
            <div className="mt-auto w-full flex justify-between items-end font-mono border-t border-black pt-2" style={{ fontSize: `${labelSettings.fontSize - 4}px` }}>
              <div className="flex flex-col">
                <span className="font-bold">ID: {lastTransaction.id.toUpperCase()}</span>
                <span>Thời gian: {format(lastTransaction.timestamp, 'dd/MM/yyyy HH:mm:ss')}</span>
              </div>
              <div className="font-black italic">
                WIP TRACKING
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-gray-200 transition-all duration-300 flex flex-col z-50",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-3 border-b border-gray-100">
          <div className="bg-[#F27D26] p-3 rounded-lg">
            <Package size={28} className="text-white" />
          </div>
          {isSidebarOpen && (
            <div className="flex flex-col">
              <span className="font-mono text-lg font-bold tracking-tighter italic leading-none text-gray-900">WIP.SYSTEM</span>
              <span className="text-xs font-mono opacity-50 uppercase tracking-widest mt-1 text-gray-500">Desktop v2.0</span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-3">
          <SidebarLink 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')}
            icon={<LayoutDashboard size={24} />}
            label="Tổng quan (Dashboard)"
            collapsed={!isSidebarOpen}
          />
          <SidebarLink 
            active={currentView === 'produce'} 
            onClick={() => setCurrentView('produce')}
            icon={<PackagePlus size={24} />}
            label="Xuất kho (Finish)"
            collapsed={!isSidebarOpen}
          />
          <SidebarLink 
            active={currentView === 'inbound'} 
            onClick={() => setCurrentView('inbound')}
            icon={<PackagePlus size={24} />}
            label="Nhập kho linh kiện"
            collapsed={!isSidebarOpen}
          />
          <SidebarLink 
            active={currentView === 'labels'} 
            onClick={() => setCurrentView('labels')}
            icon={<QrCode size={24} />}
            label="Danh sách nhãn QR"
            collapsed={!isSidebarOpen}
          />
          <SidebarLink 
            active={currentView === 'po'} 
            onClick={() => setCurrentView('po')}
            icon={<ClipboardList size={24} />}
            label="Lệnh sản xuất (PO)"
            collapsed={!isSidebarOpen}
          />
          <SidebarLink 
            active={currentView === 'history'} 
            onClick={() => setCurrentView('history')}
            icon={<History size={24} />}
            label="Lịch sử giao dịch"
            collapsed={!isSidebarOpen}
          />
          <SidebarLink 
            active={currentView === 'settings'} 
            onClick={() => setCurrentView('settings')}
            icon={<Settings size={24} />}
            label="Cài đặt linh kiện"
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
          >
            <Menu size={20} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 p-6 flex justify-between items-center shadow-sm z-40">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-2xl uppercase tracking-tight">
              {currentView === 'dashboard' && 'Báo cáo tồn kho WIP'}
              {currentView === 'produce' && 'Xuất kho & In nhãn QR'}
              {currentView === 'inbound' && 'Nhập kho linh kiện'}
              {currentView === 'labels' && 'Danh sách nhãn QR đã xuất'}
              {currentView === 'po' && 'Quản lý Lệnh sản xuất (PO)'}
              {currentView === 'history' && 'Nhật ký biến động kho'}
              {currentView === 'settings' && 'Cài đặt danh mục linh kiện'}
            </h2>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono opacity-50 uppercase">Terminal ID</span>
              <span className="text-sm font-mono font-bold">DESKTOP-WS-01</span>
            </div>
            <div className="h-10 w-px bg-gray-200" />
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-mono opacity-70 uppercase tracking-widest">Hệ thống sẵn sàng</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-[#F8F9FA]">
          <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
              {currentView === 'dashboard' && (
                <DashboardView key="dashboard" inventory={inventory} parts={parts} refreshData={refreshData} />
              )}
              {currentView === 'produce' && (
                <ProduceView 
                  key="produce"
                  selectedStage={selectedStage}
                  setSelectedStage={setSelectedStage}
                  selectedPart={selectedPart}
                  setSelectedPart={setSelectedPart}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  handleProduce={handleProduce}
                  lastTransaction={lastTransaction}
                  setLastTransaction={setLastTransaction}
                  inventory={inventory}
                  parts={parts}
                  onPrint={handlePrint}
                  onCopy={copyToClipboard}
                />
              )}
              {currentView === 'inbound' && (
                <InboundView 
                  key="inbound"
                  selectedStage={scanStage}
                  setSelectedStage={setScanStage}
                  onScanSuccess={onScanSuccess}
                  parts={parts}
                  onManualInbound={handleManualInbound}
                />
              )}
              {currentView === 'labels' && (
                <LabelHistoryView 
                  key="labels" 
                  parts={parts} 
                  onPrint={handlePrint}
                  onCopy={copyToClipboard}
                  onRollback={refreshData}
                />
              )}
              {currentView === 'po' && (
                <ProductionOrderView parts={parts} />
              )}
              {currentView === 'history' && (
                <HistoryView key="history" transactions={transactions} parts={parts} />
              )}
              {currentView === 'settings' && (
                <SettingsView 
                  key="settings" 
                  parts={parts} 
                  onPartsChange={refreshData} 
                  labelSettings={labelSettings}
                  onLabelSettingsChange={(s: any) => {
                    setLabelSettings(s);
                    storageService.saveLabelSettings(s);
                  }}
                />
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Status Bar */}
        <footer className="bg-white border-t border-gray-200 text-gray-500 px-8 py-3 flex justify-between items-center text-xs font-mono uppercase tracking-widest">
          <div className="flex gap-6">
            <span>User: Huy Trung</span>
            <span className="opacity-30">|</span>
            <span>Shift: Day</span>
          </div>
          <div className="font-bold">
            {format(new Date(), 'dd/MM/yyyy HH:mm:ss')}
          </div>
        </footer>
      </div>

      {/* Notification Overlay */}
      <AnimatePresence>
        {(error || success) && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed top-20 right-8 z-50 w-80"
          >
            <div className={cn(
              "p-4 rounded-lg shadow-2xl border flex items-start justify-between",
              error ? "bg-red-50 border-red-200 text-red-800" : "bg-green-50 border-green-200 text-green-800"
            )}>
              <div className="flex items-start gap-3">
                {error ? <AlertCircle size={20} className="mt-0.5" /> : <CheckCircle2 size={20} className="mt-0.5" />}
                <div>
                  <p className="text-sm font-bold uppercase tracking-tight mb-1">{error ? 'Lỗi hệ thống' : 'Thành công'}</p>
                  <p className="text-xs opacity-90">{error || success}</p>
                </div>
              </div>
              <button onClick={clearMessages} className="p-1 hover:bg-black/5 rounded">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLink({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group",
        active 
          ? "bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20" 
          : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      )}
    >
      <div className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")}>
        {icon}
      </div>
      {!collapsed && <span className="text-base font-bold tracking-tight whitespace-nowrap">{label}</span>}
    </button>
  );
}

// --- VIEW COMPONENTS ---

interface DashboardProps {
  inventory: InventoryItem[];
  parts: Part[];
  refreshData: () => void;
  key?: string;
}

function ProductionOrderView({ parts }: { parts: Part[] }) {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [selectedPart, setSelectedPart] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setOrders(storageService.getProductionOrders());
  }, []);

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPart || quantity <= 0) return;
    
    try {
      storageService.createMasterPO(selectedPart, quantity);
      setOrders(storageService.getProductionOrders());
      setSelectedPart("");
      setQuantity(0);
      alert('Đã tạo lệnh sản xuất PO Tổng và các PO Con thành công!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi tạo PO');
    }
  };

  const handleDeletePO = () => {
    if (password === 'admin123') {
      if (showDeleteModal) {
        storageService.deletePO(showDeleteModal);
        setOrders(storageService.getProductionOrders());
        setShowDeleteModal(null);
        setPassword("");
      }
    } else {
      alert('Mật khẩu không chính xác!');
    }
  };

  // Group orders by masterPoId
  const masterOrders = orders.filter(o => !o.masterPoId);
  
  return (
    <div className="space-y-8">
      {/* Create PO Form */}
      <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <ClipboardList className="text-blue-600" />
          Tạo Lệnh Sản Xuất (PO Tổng)
        </h2>
        <form onSubmit={handleCreatePO} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase opacity-50">Chọn Model</label>
            <SearchableSelect 
              options={Array.from(new Set(storageService.getModelBOM().map(b => b.modelId))).map(id => ({ 
                id, 
                label: parts.find(p => p.id === id)?.name || id 
              }))}
              value={selectedPart}
              onChange={setSelectedPart}
              placeholder="Chọn model..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase opacity-50">Số lượng</label>
            <input 
              type="number"
              step="any"
              value={quantity || ''}
              onChange={e => setQuantity(parseFloat(e.target.value) || 0)}
              className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none"
              placeholder="Nhập số lượng..."
            />
          </div>
          <button 
            type="submit"
            className="bg-blue-600 text-white py-5 rounded-xl font-bold uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            Tạo Lệnh PO
          </button>
        </form>
      </div>

      {/* PO List */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Danh sách Lệnh Sản Xuất</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-8 py-5">Mã PO</th>
                <th className="px-8 py-5">Linh kiện / Thành phẩm</th>
                <th className="px-8 py-5">Công đoạn</th>
                <th className="px-8 py-5 text-right">Mục tiêu</th>
                <th className="px-8 py-5 text-right">Thực tế</th>
                <th className="px-8 py-5">Tiến độ</th>
                <th className="px-8 py-5">Trạng thái</th>
                <th className="px-8 py-5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {masterOrders.map(master => {
                const subOrders = orders.filter(o => o.masterPoId === master.id);
                const totalTarget = subOrders.reduce((sum, o) => sum + o.targetQuantity, 0);
                const totalProduced = subOrders.reduce((sum, o) => sum + o.producedQuantity, 0);
                const overallProgress = totalTarget > 0 ? (totalProduced / totalTarget) * 100 : 0;

                return (
                  <React.Fragment key={master.id}>
                    <tr className="bg-blue-50/30 font-bold">
                      <td className="px-8 py-5 font-mono text-blue-700">{master.id}</td>
                      <td className="px-8 py-5">{parts.find(p => p.id === master.partId)?.name || master.partId}</td>
                      <td className="px-8 py-5"><span className="px-2 py-1 bg-blue-600 text-white rounded text-[10px]">MODEL</span></td>
                      <td className="px-8 py-5 text-right text-xl">{master.targetQuantity}</td>
                      <td className="px-8 py-5 text-right text-xl text-blue-600">{master.producedQuantity}</td>
                      <td className="px-8 py-5">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${overallProgress}%` }}></div>
                        </div>
                        <span className="text-[10px] opacity-50">{overallProgress.toFixed(1)}%</span>
                      </td>
                      <td className="px-8 py-5">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold",
                          master.status === 'COMPLETED' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {master.status === 'COMPLETED' ? 'HOÀN THÀNH' : 'ĐANG CHẠY'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <button 
                          onClick={() => setShowDeleteModal(master.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                    {subOrders.sort((a, b) => (a.stageId || '').localeCompare(b.stageId || '')).map(sub => {
                      const progress = (sub.producedQuantity / sub.targetQuantity) * 100;
                      return (
                        <tr key={sub.id} className="text-sm text-gray-600">
                          <td className="px-8 py-4 pl-16 font-mono opacity-50">{sub.id}</td>
                          <td className="px-8 py-4">{parts.find(p => p.id === sub.partId)?.name}</td>
                          <td className="px-8 py-4">
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-[10px] font-bold">
                              {STAGES.find(s => s.id === sub.stageId)?.name}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right font-bold">{sub.targetQuantity}</td>
                          <td className="px-8 py-4 text-right font-bold text-blue-600">{sub.producedQuantity}</td>
                          <td className="px-8 py-4">
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className={cn(
                                "h-1.5 rounded-full",
                                progress >= 100 ? "bg-green-500" : "bg-blue-400"
                              )} style={{ width: `${Math.min(progress, 100)}%` }}></div>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold",
                              sub.status === 'COMPLETED' ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                            )}>
                              {sub.status === 'COMPLETED' ? 'XONG' : 'ĐANG SX'}
                            </span>
                          </td>
                          <td className="px-8 py-4"></td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {masterOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-gray-400 italic">Chưa có lệnh sản xuất nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-4 text-red-600">
                <Trash2 size={32} />
                <h3 className="text-xl font-bold">Xác nhận xóa PO</h3>
              </div>
              <p className="text-sm text-gray-500">Hành động này sẽ xóa PO Tổng và <b>tất cả các PO Con</b> liên quan. Vui lòng nhập mật khẩu để xác nhận.</p>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase opacity-50">Nhập mật khẩu xác nhận</label>
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-4 rounded-lg border border-gray-200 focus:border-red-500 outline-none text-lg"
                  placeholder="Nhập mật khẩu..."
                  onKeyDown={(e) => e.key === 'Enter' && handleDeletePO()}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => { setShowDeleteModal(null); setPassword(''); }}
                  className="flex-1 py-4 bg-gray-100 rounded-lg font-bold text-sm uppercase hover:bg-gray-200 transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={handleDeletePO}
                  className="flex-1 py-4 bg-red-600 text-white rounded-lg font-bold text-sm uppercase hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  Xác nhận xóa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LabelHistoryView({ parts, onPrint, onCopy, onRollback }: { parts: Part[], onPrint: (l: Transaction) => void, onCopy: (t: string) => void, onRollback: () => void, key?: string }) {
  const [labels, setLabels] = useState<Transaction[]>([]);
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<Transaction | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    const allLabels = storageService.getLabels();
    const allTransactions = storageService.getTransactions();
    
    // Identify which labels have been scanned
    const scanned = new Set<string>();
    allTransactions.forEach(tx => {
      if (tx.type === 'STAGE_IN' && tx.qrData) {
        // Extract txId from qrData: partId|quantity|sourceStageId|timestamp|txId|targetStageId
        const qrParts = tx.qrData.split('|');
        if (qrParts.length >= 5) {
          scanned.add(qrParts[4]);
        }
      }
    });
    
    setLabels(allLabels);
    setScannedIds(scanned);
  }, []);

  const handleRollback = () => {
    if (password === 'admin123') {
      if (showDeleteModal) {
        storageService.rollbackTransaction(showDeleteModal);
        const updatedLabels = storageService.getLabels();
        setLabels(updatedLabels);
        onRollback();
        setShowDeleteModal(null);
        setPassword("");
        if (selectedLabel?.id === showDeleteModal) setSelectedLabel(null);
        alert('Đã thu hồi lệnh xuất kho và hoàn trả số lượng vào kho thành công!');
      }
    } else {
      alert('Mật khẩu không chính xác!');
    }
  };

  const filteredLabels = labels.filter(label => {
    if (!dateFilter) return true;
    const labelDate = format(label.timestamp, 'yyyy-MM-dd');
    return labelDate === dateFilter;
  });

  const displayedLabels = filteredLabels.slice(0, limit);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[750px]">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-bold text-xl tracking-tight">Danh sách nhãn QR</h2>
              <p className="text-xs text-gray-400 mt-1">Tổng số: {labels.length} nhãn</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] font-bold opacity-40 uppercase">Đã nhập</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-gray-200 border border-gray-300" />
                <span className="text-[10px] font-bold opacity-40 uppercase">Chờ nhập</span>
              </div>
            </div>
          </div>
          
          <div className="relative">
            <input 
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-blue-600 outline-none text-sm font-mono"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            {dateFilter && (
              <button 
                onClick={() => setDateFilter("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredLabels.length === 0 ? (
            <div className="p-12 text-center text-gray-400 italic">
              {dateFilter ? `Không tìm thấy nhãn nào trong ngày ${format(new Date(dateFilter), 'dd/MM/yyyy')}` : 'Chưa có nhãn nào được tạo.'}
            </div>
          ) : (
            <>
              {displayedLabels.map(label => {
                const isScanned = scannedIds.has(label.id);
                return (
                  <div 
                    key={label.id}
                    onClick={() => setSelectedLabel(label)}
                    className={cn(
                      "p-5 cursor-pointer transition-all hover:bg-gray-50 flex justify-between items-center group relative",
                      selectedLabel?.id === label.id && "ring-2 ring-inset ring-blue-600 z-10",
                      isScanned ? "bg-green-50/50" : "bg-white"
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {isScanned && <CheckCircle2 size={14} className="text-green-600" />}
                        <span className="font-bold text-sm">{parts.find(p => p.id === label.partId)?.name || label.partId}</span>
                      </div>
                      {label.poId && (
                        <div className="text-[10px] font-mono font-bold text-blue-600">
                          {label.poId}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] font-mono opacity-50">
                        <span>{format(label.timestamp, 'dd/MM HH:mm')}</span>
                        <span>•</span>
                        <span>{label.quantity} {parts.find(p => p.id === label.partId)?.unit}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isScanned && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Đã nhập</span>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteModal(label.id);
                        }}
                        className="p-2 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Thu hồi lệnh xuất"
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {limit < filteredLabels.length && (
                <button 
                  onClick={() => setLimit(prev => prev + 50)}
                  className="w-full py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-colors uppercase tracking-widest"
                >
                  Xem thêm ({filteredLabels.length - limit} nhãn còn lại)
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        <AnimatePresence mode="wait">
          {selectedLabel ? (
            <motion.div 
              key={selectedLabel.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-10 rounded-2xl border-2 border-dashed border-[#141414] flex flex-col items-center space-y-8 h-full shadow-xl"
            >
              <div className="flex justify-between w-full items-center">
                <div className="flex items-center gap-3">
                  <Printer size={24} className="text-[#F27D26]" />
                  <h3 className="font-mono text-sm uppercase font-bold tracking-widest">Xem lại nhãn QR</h3>
                </div>
                <button onClick={() => setSelectedLabel(null)} className="text-gray-400 hover:text-black transition-colors">
                  <X size={32} />
                </button>
              </div>
              
              <div className="bg-white p-10 border-4 border-black shadow-xl">
                <QRCodeSVG value={selectedLabel.qrData || ''} size={300} level="H" />
              </div>

              <div className="w-full space-y-4 text-center">
                <p className="font-bold text-4xl leading-tight tracking-tight">{parts.find(p => p.id === selectedLabel.partId)?.name}</p>
                {selectedLabel.poId && (
                  <p className="font-mono text-xl font-bold text-blue-600 uppercase">{selectedLabel.poId}</p>
                )}
                <div className="flex justify-center gap-12 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono uppercase opacity-40">Số lượng</span>
                    <span className="text-3xl font-mono font-bold">{selectedLabel.quantity} {parts.find(p => p.id === selectedLabel.partId)?.unit}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono uppercase opacity-40">Từ công đoạn</span>
                    <span className="text-3xl font-mono font-bold uppercase">{STAGES.find(s => s.id === selectedLabel.stageId)?.name}</span>
                  </div>
                </div>
                
                {selectedLabel.qrData?.split('|')[5] && (
                  <div className="bg-[#F27D26]/5 p-4 rounded-xl border border-[#F27D26]/20">
                    <span className="text-xs font-mono uppercase opacity-60 block mb-2">Đích tiếp theo</span>
                    <div className="flex items-center justify-center gap-3 text-[#F27D26] font-bold text-xl">
                      <span>{STAGES.find(s => s.id === selectedLabel.stageId)?.name}</span>
                      <ArrowRight size={20} />
                      <span>{STAGES.find(s => s.id === selectedLabel.qrData!.split('|')[5])?.name || selectedLabel.qrData!.split('|')[5]}</span>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-gray-100">
                  <p className="font-mono text-sm opacity-50">ID: {selectedLabel.id.split('-')[0].toUpperCase()}</p>
                  <p className="font-mono text-sm opacity-50">{format(selectedLabel.timestamp, 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
              </div>

              <div className="w-full flex gap-4 no-print">
                <button 
                  onClick={() => onPrint(selectedLabel)}
                  className="flex-1 bg-blue-600 text-white py-5 rounded-xl flex items-center justify-center gap-3 font-bold text-lg uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  <Printer size={24} />
                  In nhãn (PDF)
                </button>
                <button 
                  onClick={() => onCopy(selectedLabel.qrData || '')}
                  className="px-6 bg-gray-100 text-gray-600 py-5 rounded-xl flex items-center justify-center gap-3 font-bold text-lg uppercase hover:bg-gray-200 transition-all"
                  title="Sao chép mã QR"
                >
                  <QrCode size={24} />
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center h-full p-12 text-center text-gray-400">
              <QrCode size={64} strokeWidth={1} />
              <p className="mt-6 font-medium">Chọn một nhãn từ danh sách bên trái<br />để xem chi tiết và in lại.</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center gap-4 text-orange-600">
                <RotateCcw size={32} />
                <h3 className="text-xl font-bold">Xác nhận thu hồi</h3>
              </div>
              <p className="text-sm text-gray-500">Hành động này sẽ xóa nhãn QR và <b>hoàn trả số lượng</b> vào kho xuất ban đầu. Vui lòng nhập mật khẩu để xác nhận.</p>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase opacity-50">Nhập mật khẩu xác nhận</label>
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-4 rounded-lg border border-gray-200 focus:border-orange-500 outline-none text-lg"
                  placeholder="Mật khẩu..."
                  onKeyDown={(e) => e.key === 'Enter' && handleRollback()}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => { setShowDeleteModal(null); setPassword(''); }}
                  className="flex-1 py-4 bg-gray-100 rounded-lg font-bold text-sm uppercase hover:bg-gray-200 transition-all"
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={handleRollback}
                  className="flex-1 py-4 bg-orange-600 text-white rounded-lg font-bold text-sm uppercase hover:bg-orange-700 transition-all"
                >
                  Xác nhận thu hồi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DashboardView({ inventory, parts, refreshData }: DashboardProps) {
  const [selectedStageDetail, setSelectedStageDetail] = useState<StageId | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const chartData = STAGES.map(stage => {
    const inQty = inventory
      .filter(item => item.stageId === stage.id && item.location === 'IN')
      .reduce((sum, item) => sum + item.quantity, 0);
    const outQty = inventory
      .filter(item => item.stageId === stage.id && item.location === 'OUT')
      .reduce((sum, item) => sum + item.quantity, 0);
    
    return {
      name: stage.name,
      'Chờ SX (IN)': inQty,
      'Hoàn thành (OUT)': outQty,
    };
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {STAGES.map(stage => {
          const total = inventory
            .filter(item => item.stageId === stage.id)
            .reduce((sum, item) => sum + item.quantity, 0);
          const isActive = selectedStageDetail === stage.id;

          return (
            <button 
              key={stage.id} 
              onClick={() => setSelectedStageDetail(isActive ? null : stage.id)}
              className={cn(
                "bg-white p-6 rounded-xl border transition-all text-left group",
                isActive 
                  ? "border-[#F27D26] ring-4 ring-[#F27D26]/10 shadow-lg" 
                  : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={cn(
                  "p-2 rounded-lg transition-colors",
                  isActive ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                )}>
                  <Package size={20} />
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-widest">Stage {STAGES.indexOf(stage) + 1}</span>
                  {isActive && <div className="w-2 h-2 rounded-full bg-[#F27D26] mt-1 animate-pulse" />}
                </div>
              </div>
              <h3 className="font-bold text-xl text-gray-900 mb-1">{stage.name}</h3>
              <p className="text-4xl font-mono font-bold tracking-tighter">{total}</p>
              <div className="mt-4 flex gap-6 text-xs font-mono uppercase font-bold">
                <div className="flex flex-col">
                  <span className="opacity-40">Tồn IN</span>
                  <span className="text-lg">{inventory.filter(i => i.stageId === stage.id && i.location === 'IN').reduce((s, i) => s + i.quantity, 0)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="opacity-40">Tồn OUT</span>
                  <span className={cn("text-lg", isActive ? "text-[#F27D26]" : "text-[#F27D26]/80")}>
                    {inventory.filter(i => i.stageId === stage.id && i.location === 'OUT').reduce((s, i) => s + i.quantity, 0)}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-gray-400 group-hover:text-[#F27D26] transition-colors">
                <span>{isActive ? 'Đang xem chi tiết' : 'Bấm để xem chi tiết'}</span>
                <ChevronRight size={16} className={cn("transition-transform", isActive && "rotate-90")} />
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedStageDetail ? (
          <motion.div
            key="stage-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white text-gray-900 rounded-2xl p-8 shadow-xl border border-gray-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-[#F27D26] p-3 rounded-xl">
                    <Package size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Chi tiết tồn kho: {STAGES.find(s => s.id === selectedStageDetail)?.name}</h2>
                    <p className="text-sm font-mono opacity-50 uppercase tracking-widest">Phân rã theo từng mã linh kiện</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <input 
                      type="text"
                      placeholder="Tìm linh kiện..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-200 focus:border-[#F27D26] outline-none text-base"
                    />
                    <Edit2 size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  <button 
                    onClick={() => { setSelectedStageDetail(null); setSearchTerm(''); }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* KHO_IN Detail */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <h3 className="font-mono text-sm font-bold uppercase tracking-widest opacity-60">KHO_IN (Chờ sản xuất)</h3>
                  </div>
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-100/50">
                          <th className="p-4 text-xs font-mono uppercase opacity-40">Linh kiện</th>
                          <th className="p-4 text-xs font-mono uppercase opacity-40 text-right">Số lượng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parts
                          .filter(part => {
                            const qty = inventory.find(i => i.partId === part.id && i.stageId === selectedStageDetail && i.location === 'IN')?.quantity || 0;
                            const matchesSearch = part.id.toLowerCase().includes(searchTerm.toLowerCase()) || part.name.toLowerCase().includes(searchTerm.toLowerCase());
                            return qty > 0 && matchesSearch;
                          })
                          .map(part => {
                            const qty = inventory.find(i => i.partId === part.id && i.stageId === selectedStageDetail && i.location === 'IN')?.quantity || 0;
                            const displayQty = part.level === 3 ? qty.toFixed(4) : qty;
                            return (
                              <tr key={part.id} className="hover:bg-white transition-colors">
                                <td className="p-4">
                                  <div className="font-bold text-base">{part.id}</div>
                                  <div className="text-xs opacity-50">{part.name}</div>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <span className="font-mono font-bold text-xl">{displayQty}</span>
                                    <span className="text-xs font-mono opacity-40 uppercase mr-4">{part.unit}</span>
                                    <button 
                                      onClick={() => {
                                        const pwd = prompt('Nhập mật khẩu để sửa tồn kho:');
                                        if (pwd === 'admin123') {
                                          const newQty = prompt(`Nhập số lượng tồn mới cho ${part.id}:`, String(qty));
                                          if (newQty !== null) {
                                            storageService.setInventoryQuantity(part.id, selectedStageDetail, 'IN', parseFloat(newQty) || 0);
                                            refreshData();
                                          }
                                        } else if (pwd !== null) {
                                          alert('Mật khẩu không chính xác!');
                                        }
                                      }}
                                      className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                      title="Sửa số lượng"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        const pwd = prompt('Nhập mật khẩu để xóa tồn kho:');
                                        if (pwd === 'admin123') {
                                          if (confirm(`Bạn có chắc chắn muốn xóa tồn kho của ${part.id} tại ${STAGES.find(s => s.id === selectedStageDetail)?.name} (Kho IN)?`)) {
                                            storageService.deleteInventoryItem(part.id, selectedStageDetail, 'IN');
                                            refreshData();
                                          }
                                        } else if (pwd !== null) {
                                          alert('Mật khẩu không chính xác!');
                                        }
                                      }}
                                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                                      title="Xóa tồn kho"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* KHO_OUT Detail */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-3 h-3 rounded-full bg-[#F27D26]" />
                    <h3 className="font-mono text-sm font-bold uppercase tracking-widest opacity-60">KHO_OUT (Đã hoàn thành)</h3>
                  </div>
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-100/50">
                          <th className="p-4 text-xs font-mono uppercase opacity-40">Linh kiện</th>
                          <th className="p-4 text-xs font-mono uppercase opacity-40 text-right">Số lượng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parts
                          .filter(part => {
                            const qty = inventory.find(i => i.partId === part.id && i.stageId === selectedStageDetail && i.location === 'OUT')?.quantity || 0;
                            const matchesSearch = part.id.toLowerCase().includes(searchTerm.toLowerCase()) || part.name.toLowerCase().includes(searchTerm.toLowerCase());
                            return qty > 0 && matchesSearch;
                          })
                          .map(part => {
                            const qty = inventory.find(i => i.partId === part.id && i.stageId === selectedStageDetail && i.location === 'OUT')?.quantity || 0;
                            const displayQty = part.level === 3 ? qty.toFixed(4) : qty;
                            return (
                              <tr key={part.id} className="hover:bg-white transition-colors">
                                <td className="p-4">
                                  <div className="font-bold text-base">{part.id}</div>
                                  <div className="text-xs opacity-50">{part.name}</div>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <span className="font-mono font-bold text-xl text-[#F27D26]">{displayQty}</span>
                                    <span className="text-xs font-mono opacity-40 uppercase mr-4">{part.unit}</span>
                                    <button 
                                      onClick={() => {
                                        const pwd = prompt('Nhập mật khẩu để sửa tồn kho:');
                                        if (pwd === 'admin123') {
                                          const newQty = prompt(`Nhập số lượng tồn mới cho ${part.id}:`, String(qty));
                                          if (newQty !== null) {
                                            storageService.setInventoryQuantity(part.id, selectedStageDetail, 'OUT', parseFloat(newQty) || 0);
                                            refreshData();
                                          }
                                        } else if (pwd !== null) {
                                          alert('Mật khẩu không chính xác!');
                                        }
                                      }}
                                      className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                      title="Sửa số lượng"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        const pwd = prompt('Nhập mật khẩu để xóa tồn kho:');
                                        if (pwd === 'admin123') {
                                          if (confirm(`Bạn có chắc chắn muốn xóa tồn kho của ${part.id} tại ${STAGES.find(s => s.id === selectedStageDetail)?.name} (Kho OUT)?`)) {
                                            storageService.deleteInventoryItem(part.id, selectedStageDetail, 'OUT');
                                            refreshData();
                                          }
                                        } else if (pwd !== null) {
                                          alert('Mật khẩu không chính xác!');
                                        }
                                      }}
                                      className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                                      title="Xóa tồn kho"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Area */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h2 className="font-bold text-2xl tracking-tight">Biểu đồ tồn kho WIP</h2>
            <div className="flex gap-6">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-blue-500" />
                <span className="text-sm font-mono uppercase opacity-60">Chờ SX (IN)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-[#F27D26]" />
                <span className="text-sm font-mono uppercase opacity-60">Hoàn thành (OUT)</span>
              </div>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 14, fontWeight: 600 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 14, fontFamily: 'monospace' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ 
                    backgroundColor: '#FFFFFF', 
                    border: '1px solid #E5E7EB', 
                    borderRadius: '12px',
                    color: '#111827',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    padding: '16px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }} 
                />
                <Bar dataKey="Chờ SX (IN)" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40} />
                <Bar dataKey="Hoàn thành (OUT)" fill="#F27D26" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Details Table */}
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
          <h2 className="font-bold text-2xl tracking-tight mb-8">Trạng thái chi tiết</h2>
          <div className="flex-1 space-y-6 overflow-y-auto pr-2">
            {STAGES.map(stage => (
              <div key={stage.id} className="p-6 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-lg">{stage.name}</span>
                  <span className="text-xs font-mono bg-gray-200 px-3 py-1 rounded uppercase">Active</span>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white p-4 rounded-lg border border-gray-100">
                    <span className="text-xs font-mono uppercase opacity-40 block mb-1">KHO_IN</span>
                    <span className="text-2xl font-mono font-bold">
                      {inventory
                        .filter(item => item.stageId === stage.id && item.location === 'IN')
                        .reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-100">
                    <span className="text-xs font-mono uppercase opacity-40 block mb-1">KHO_OUT</span>
                    <span className="text-2xl font-mono font-bold text-[#F27D26]">
                      {inventory
                        .filter(item => item.stageId === stage.id && item.location === 'OUT')
                        .reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ProduceView({ 
  selectedStage, setSelectedStage, 
  selectedPart, setSelectedPart, 
  quantity, setQuantity, 
  handleProduce,
  lastTransaction, setLastTransaction,
  inventory,
  parts,
  onPrint,
  onCopy
}: any) {
  const [sourceLocation, setSourceLocation] = useState<'IN' | 'OUT'>('IN');
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [targetStageId, setTargetStageId] = useState<StageId>(
    STAGES.find(s => s.id === selectedStage)?.nextStageId || STAGES[0].id
  );

  // Filter parts based on stage and BOM level
  const filteredParts = parts.filter((p: any) => {
    if (selectedStage === 'LASER' || selectedStage === 'BENDING') return p.level === 2;
    if (selectedStage === 'WELDING' || selectedStage === 'PAINTING') return p.level === 1;
    return true;
  });

  const availablePos = storageService.getProductionOrders().filter(
    p => p.partId === selectedPart && p.stageId === selectedStage && p.status !== 'COMPLETED'
  );

  // Auto-select first filtered part if current selection is not in list
  useEffect(() => {
    if (filteredParts.length > 0 && !filteredParts.find((p: any) => p.id === selectedPart)) {
      setSelectedPart(filteredParts[0].id);
    }
  }, [selectedStage, filteredParts, selectedPart, setSelectedPart]);

  useEffect(() => {
    if (availablePos.length > 0) {
      setSelectedPoId(availablePos[0].id);
    } else {
      setSelectedPoId("");
    }
  }, [selectedPart, selectedStage, availablePos.length]);

  useEffect(() => {
    const next = STAGES.find(s => s.id === selectedStage)?.nextStageId;
    if (next) setTargetStageId(next);
    
    // Auto-switch to OUT for stages with automatic BOM deduction
    if (selectedStage === 'LASER' || selectedStage === 'WELDING') {
      setSourceLocation('OUT');
    }
  }, [selectedStage]);

  const currentStock = inventory.find(
    (i: any) => i.partId === selectedPart && i.stageId === selectedStage && i.location === sourceLocation
  )?.quantity || 0;

  const activePo = availablePos.find(p => p.id === selectedPoId) || availablePos[0];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-8"
    >
      <div className="bg-white p-10 rounded-2xl border border-gray-200 shadow-sm space-y-8">
        {activePo && sourceLocation === 'IN' && (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center">
            <div>
              <div className="text-xs font-bold uppercase text-blue-600 opacity-70">Lệnh PO đang chạy</div>
              <div className="font-mono font-bold text-blue-800">{activePo.id}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase text-blue-600 opacity-70">Tiến độ</div>
              <div className="font-mono font-bold text-blue-800">{activePo.producedQuantity} / {activePo.targetQuantity}</div>
            </div>
          </div>
        )}
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-3">Xuất kho (Finish & Label)</h2>
          <p className="text-base text-gray-500">Ghi nhận hoàn thành công đoạn hoặc xuất linh kiện từ kho thành phẩm để in nhãn QR.</p>
        </div>
        
        <form onSubmit={(e) => handleProduce(e, sourceLocation, sourceLocation === 'OUT' ? targetStageId : undefined, selectedPoId)} className="space-y-8">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">1. Công đoạn hiện tại</label>
              <select 
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none bg-white cursor-pointer"
              >
                {STAGES.map(stage => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-4">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">2. Vị trí xuất:</label>
              <div className="flex bg-gray-100 p-1 rounded-xl h-[68px]">
                {(selectedStage !== 'LASER' && selectedStage !== 'WELDING') && (
                  <button 
                    type="button"
                    onClick={() => setSourceLocation('IN')}
                    className={cn(
                      "flex-1 rounded-lg font-bold text-sm uppercase transition-all",
                      sourceLocation === 'IN' ? "bg-gray-900 text-white shadow-sm" : "text-gray-400"
                    )}
                  >
                    Kho IN
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setSourceLocation('OUT')}
                  className={cn(
                    "flex-1 rounded-lg font-bold text-sm uppercase transition-all",
                    sourceLocation === 'OUT' ? (selectedStage === 'LASER' || selectedStage === 'WELDING' ? "bg-blue-600 text-white shadow-sm" : "bg-[#F27D26] text-white shadow-sm") : "text-gray-400"
                  )}
                >
                  Kho OUT
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-bold uppercase tracking-widest opacity-50">3. Chọn mã linh kiện</label>
            <SearchableSelect 
              options={filteredParts.map((p: any) => ({ id: p.id, label: `${p.id} - ${p.name}` }))}
              value={selectedPart}
              onChange={setSelectedPart}
              placeholder="Tìm mã linh kiện..."
            />
          </div>

          {sourceLocation === 'IN' && availablePos.length > 0 && (
            <div className="space-y-4">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">Chọn Lệnh PO (Tiến độ)</label>
              <select 
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none bg-white cursor-pointer"
              >
                {availablePos.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.id} ({po.producedQuantity}/{po.targetQuantity})
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceLocation === 'OUT' && (
            <div className="space-y-4">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">4. Công đoạn đích (Nhập kho IN)</label>
              <select 
                value={targetStageId}
                onChange={(e) => setTargetStageId(e.target.value as StageId)}
                className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none bg-white cursor-pointer"
              >
                {STAGES.filter(s => s.id !== selectedStage).map(stage => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">{sourceLocation === 'OUT' ? '5' : '4'}. Nhập số lượng xuất</label>
              <div className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-lg border",
                sourceLocation === 'IN' ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100"
              )}>
                <span className={cn(
                  "text-xs font-mono font-bold uppercase",
                  sourceLocation === 'IN' ? "text-blue-600" : "text-orange-600"
                )}>Tồn {sourceLocation} hiện tại:</span>
                <span className={cn(
                  "text-base font-mono font-bold",
                  sourceLocation === 'IN' ? "text-blue-700" : "text-orange-700"
                )}>{currentStock}</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <button 
                type="button"
                onClick={() => setQuantity(Math.max(0, quantity - 1))}
                className="w-20 h-20 rounded-xl border-2 border-gray-100 flex items-center justify-center font-bold text-3xl hover:bg-gray-50 active:scale-95 transition-all"
              >
                -
              </button>
              <input 
                type="number" 
                step="any"
                value={quantity || ''} 
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                className="flex-1 h-20 text-center border-2 border-gray-900 rounded-xl font-mono font-bold text-4xl outline-none focus:ring-4 ring-black/5"
                placeholder="0"
              />
              <button 
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-20 h-20 rounded-xl border-2 border-gray-100 flex items-center justify-center font-bold text-3xl hover:bg-gray-50 active:scale-95 transition-all"
              >
                +
              </button>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-blue-600 text-white py-5 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200"
          >
            <PackagePlus size={24} />
            {sourceLocation === 'IN' ? 'Xác nhận hoàn thành (IN -> OUT)' : 'Xác nhận xuất kho & In nhãn QR'}
          </button>
        </form>
      </div>

      {/* QR Label Preview */}
      <div className="flex flex-col">
        <AnimatePresence mode="wait">
          {lastTransaction && lastTransaction.qrData ? (
            <motion.div 
              key="label"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-10 rounded-2xl border-2 border-dashed border-[#141414] flex flex-col items-center space-y-8 h-full"
            >
              <div className="flex justify-between w-full items-center">
                <div className="flex items-center gap-3">
                  <Printer size={24} className="text-[#F27D26]" />
                  <h3 className="font-mono text-sm uppercase font-bold tracking-widest">Nhãn Pallet sẵn sàng in</h3>
                </div>
                <button onClick={() => setLastTransaction(null)} className="text-gray-400 hover:text-black transition-colors">
                  <X size={32} />
                </button>
              </div>
              
              <div className="bg-white p-10 border-4 border-black shadow-xl">
                <QRCodeSVG value={lastTransaction.qrData || ''} size={300} level="H" />
              </div>

              <div className="w-full space-y-4 text-center">
                <p className="font-bold text-4xl leading-tight tracking-tight">{parts.find(p => p.id === lastTransaction.partId)?.name}</p>
                {lastTransaction.poId && (
                  <p className="font-mono text-xl font-bold text-blue-600 uppercase">{lastTransaction.poId}</p>
                )}
                <div className="flex justify-center gap-12 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono uppercase opacity-40">Số lượng</span>
                    <span className="text-3xl font-mono font-bold">{lastTransaction.quantity} {parts.find(p => p.id === lastTransaction.partId)?.unit}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono uppercase opacity-40">Từ công đoạn</span>
                    <span className="text-3xl font-mono font-bold uppercase">{STAGES.find(s => s.id === lastTransaction.stageId)?.name}</span>
                  </div>
                </div>
                
                {lastTransaction.qrData?.split('|')[5] && (
                  <div className="bg-[#F27D26]/5 p-4 rounded-xl border border-[#F27D26]/20">
                    <span className="text-xs font-mono uppercase opacity-60 block mb-2">Đích tiếp theo</span>
                    <div className="flex items-center justify-center gap-3 text-[#F27D26] font-bold text-xl">
                      <span>{STAGES.find(s => s.id === lastTransaction.stageId)?.name}</span>
                      <ArrowRight size={20} />
                      <span>{STAGES.find(s => s.id === lastTransaction.qrData!.split('|')[5])?.name || lastTransaction.qrData!.split('|')[5]}</span>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-gray-100">
                  <p className="font-mono text-sm opacity-50">ID: {lastTransaction.id.split('-')[0].toUpperCase()}</p>
                  <p className="font-mono text-sm opacity-50">{format(lastTransaction.timestamp, 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
              </div>

              <div className="w-full flex gap-4 no-print">
                <button 
                  onClick={() => onPrint(lastTransaction)}
                  className="flex-1 bg-blue-600 text-white py-5 rounded-xl flex items-center justify-center gap-3 font-bold text-lg uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  <Printer size={24} />
                  In nhãn (PDF)
                </button>
                <button 
                  onClick={() => onCopy(lastTransaction.qrData || '')}
                  className="px-6 bg-gray-100 text-gray-600 py-5 rounded-xl flex items-center justify-center gap-3 font-bold text-lg uppercase hover:bg-gray-200 transition-all"
                  title="Sao chép mã QR"
                >
                  <QrCode size={24} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center h-full p-12 text-center text-gray-400"
            >
              <Printer size={64} strokeWidth={1} />
              <p className="mt-6 font-medium">Sau khi xác nhận sản xuất,<br />nhãn QR sẽ hiển thị tại đây để in.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function InboundView({ selectedStage, setSelectedStage, onScanSuccess, parts, onManualInbound }: any) {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [targetLocation, setTargetLocation] = useState<'IN' | 'OUT'>('IN');
  const [manualPart, setManualPart] = useState('');
  const [manualQty, setManualQty] = useState(0);
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  
  const [scanInput, setScanInput] = useState('');
  const [lastScanned, setLastScanned] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'scan') {
      inputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (parts.length > 0 && !manualPart) {
      setManualPart(parts[0].id);
    }
  }, [parts]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanInput.trim()) {
      const input = scanInput.trim();
      const qrParts = input.split('|');
      
      try {
        onScanSuccess(input, targetLocation);
        
        if (qrParts.length >= 5) {
          const pId = qrParts[0];
          const sId = qrParts[2];
          setLastScanned({
            partId: pId,
            quantity: qrParts[1],
            sourceStageId: sId,
            partName: parts.find((p: any) => p.id === pId)?.name || pId,
            sourceName: STAGES.find(s => s.id === sId)?.name || sId,
            status: 'success'
          });
        }
      } catch (err) {
        if (qrParts.length >= 5) {
          const pId = qrParts[0];
          const sId = qrParts[2];
          setLastScanned({
            partId: pId,
            quantity: qrParts[1],
            sourceStageId: sId,
            partName: parts.find((p: any) => p.id === pId)?.name || pId,
            sourceName: STAGES.find(s => s.id === sId)?.name || sId,
            status: 'error',
            errorMsg: err instanceof Error ? err.message : 'Lỗi không xác định'
          });
        } else {
          setLastScanned({
            status: 'error',
            errorMsg: 'Định dạng mã QR không hợp lệ'
          });
        }
      }
      setScanInput('');
    }
  };

  // Filter parts for manual entry based on stage
  const filteredParts = parts.filter((p: any) => {
    if (selectedStage === 'LASER') {
      if (targetLocation === 'IN') return p.level === 3;
      if (targetLocation === 'OUT') return p.level === 2;
    }
    if (selectedStage === 'BENDING') return p.level === 2;
    if (selectedStage === 'WELDING') {
      if (targetLocation === 'IN') return p.level === 2;
      if (targetLocation === 'OUT') return p.level === 1;
    }
    if (selectedStage === 'PAINTING') return p.level === 1;
    return true;
  });

  // Auto-select first filtered part if current selection is not in list
  useEffect(() => {
    if (mode === 'manual' && filteredParts.length > 0 && !filteredParts.find((p: any) => p.id === manualPart)) {
      setManualPart(filteredParts[0].id);
    }
  }, [selectedStage, filteredParts, manualPart, setManualPart, mode]);

  const availablePos = storageService.getProductionOrders().filter(
    p => p.partId === manualPart && p.stageId === selectedStage && p.status !== 'COMPLETED'
  );

  useEffect(() => {
    if (availablePos.length > 0) {
      setSelectedPoId(availablePos[0].id);
    } else {
      setSelectedPoId("");
    }
  }, [manualPart, selectedStage, availablePos.length]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPart && manualQty > 0) {
      try {
        onManualInbound(manualPart, selectedStage, targetLocation, manualQty, selectedPoId);
        setLastScanned({
          partId: manualPart,
          quantity: manualQty,
          partName: parts.find((p: any) => p.id === manualPart)?.name || manualPart,
          status: 'success',
          isManual: true,
          poId: selectedPoId
        });
        setManualQty(0);
      } catch (err) {
        setLastScanned({
          partId: manualPart,
          quantity: manualQty,
          partName: parts.find((p: any) => p.id === manualPart)?.name || manualPart,
          status: 'error',
          isManual: true,
          errorMsg: err instanceof Error ? err.message : 'Lỗi không xác định'
        });
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8"
    >
      <div className="bg-white p-10 rounded-3xl border border-gray-200 shadow-xl space-y-8">
        <div className="flex bg-gray-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setMode('manual')}
            className={cn(
              "flex-1 py-4 rounded-xl font-bold text-base uppercase tracking-widest transition-all flex items-center justify-center gap-3",
              mode === 'manual' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <Edit2 size={22} />
            Nhập kho thủ công
          </button>
          <button 
            onClick={() => setMode('scan')}
            className={cn(
              "flex-1 py-4 rounded-xl font-bold text-base uppercase tracking-widest transition-all flex items-center justify-center gap-3",
              mode === 'scan' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <QrCode size={22} />
            Nhập bằng mã (QR)
          </button>
        </div>

        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4 text-left">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">Công đoạn tiếp nhận:</label>
              <select 
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none bg-white cursor-pointer"
              >
                {STAGES.map(stage => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-4 text-left">
              <label className="text-sm font-bold uppercase tracking-widest opacity-50">Vị trí nhập:</label>
              <div className="flex bg-gray-100 p-1 rounded-xl h-[68px]">
                <button 
                  onClick={() => setTargetLocation('IN')}
                  className={cn(
                    "flex-1 rounded-lg font-bold text-sm uppercase transition-all",
                    targetLocation === 'IN' ? "bg-gray-900 text-white shadow-sm" : "text-gray-400"
                  )}
                >
                  Kho IN
                </button>
                <button 
                  onClick={() => setTargetLocation('OUT')}
                  className={cn(
                    "flex-1 rounded-lg font-bold text-sm uppercase transition-all",
                    targetLocation === 'OUT' ? "bg-[#F27D26] text-white shadow-sm" : "text-gray-400"
                  )}
                >
                  Kho OUT
                </button>
              </div>
            </div>
          </div>

          {mode === 'scan' ? (
            <form onSubmit={handleScanSubmit} className="space-y-8">
              <div className="relative">
                <input 
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Nhập mã hoặc dùng súng quét..."
                  className="w-full p-10 rounded-3xl border-4 border-gray-900 bg-gray-50 text-center font-mono text-3xl font-bold focus:ring-8 ring-black/5 outline-none placeholder:text-gray-300"
                  autoComplete="off"
                />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-3 text-xs font-mono font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full border border-blue-100">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  READY
                </div>
              </div>
              <p className="text-xs font-mono text-gray-400 uppercase tracking-widest text-center">Hệ thống xử lý sau khi nhập mã hoặc súng quét gửi dữ liệu</p>
            </form>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-8 text-left">
              <div className="space-y-4">
                <label className="text-sm font-bold uppercase tracking-widest opacity-50">Chọn linh kiện:</label>
                <SearchableSelect 
                  options={filteredParts.map((p: any) => ({ id: p.id, label: `${p.id} - ${p.name}` }))}
                  value={manualPart}
                  onChange={setManualPart}
                  placeholder="Tìm mã linh kiện..."
                />
              </div>

              {targetLocation === 'OUT' && availablePos.length > 0 && (
                <div className="space-y-4">
                  <label className="text-sm font-bold uppercase tracking-widest opacity-50">Chọn Lệnh PO (Tiến độ)</label>
                  <select 
                    value={selectedPoId}
                    onChange={(e) => setSelectedPoId(e.target.value)}
                    className="w-full p-5 rounded-xl border-2 border-gray-100 font-bold text-lg focus:border-blue-600 outline-none bg-white cursor-pointer"
                  >
                    {availablePos.map(po => (
                      <option key={po.id} value={po.id}>
                        {po.id} ({po.producedQuantity}/{po.targetQuantity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold uppercase tracking-widest opacity-50">Số lượng nhập:</label>
                  {manualPart && (
                    <span className="text-xs font-mono font-bold text-gray-400 uppercase">
                      Đơn vị: {parts.find((p: any) => p.id === manualPart)?.unit}
                    </span>
                  )}
                </div>
                <input 
                  type="number"
                  step="any"
                  value={manualQty || ''}
                  onChange={(e) => setManualQty(parseFloat(e.target.value) || 0)}
                  className="w-full p-5 rounded-xl border-2 border-gray-100 font-mono text-2xl font-bold focus:border-blue-600 outline-none"
                  placeholder="Nhập số lượng..."
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 text-white py-6 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 text-xl"
              >
                <CheckCircle2 size={28} />
                Xác nhận nhập kho
              </button>
            </form>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 pt-6">
          <div className="p-8 bg-blue-50 border border-blue-100 rounded-3xl text-left space-y-3">
            <div className="flex items-center gap-3 text-blue-600">
              <AlertCircle size={22} />
              <span className="font-bold text-sm uppercase">Hướng dẫn</span>
            </div>
            <p className="text-sm text-blue-800 leading-relaxed">
              {mode === 'scan' 
                ? 'Súng quét sẽ tự động gửi mã và phím "Enter". Nếu súng không tự gửi, hãy nhấn Enter trên bàn phím.'
                : 'Nhập tay thông tin linh kiện và số lượng, sau đó nhấn Enter hoặc nút Xác nhận.'}
            </p>
          </div>
          <div className="p-8 bg-orange-50 border border-orange-100 rounded-3xl text-left space-y-3">
            <div className="flex items-center gap-3 text-orange-600">
              <CheckCircle2 size={22} />
              <span className="font-bold text-sm uppercase">Linh hoạt</span>
            </div>
            <p className="text-sm text-orange-800 leading-relaxed">
              Bạn có thể nhập trực tiếp vào kho IN hoặc kho OUT của bất kỳ công đoạn nào để điều chỉnh tồn kho.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        <AnimatePresence mode="wait">
          {lastScanned ? (
            <motion.div
              key="scan-result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "p-10 rounded-3xl border-2 shadow-2xl h-full flex flex-col items-center justify-center space-y-6 bg-white",
                lastScanned.status === 'success' ? "border-green-500" : "border-red-500"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center",
                lastScanned.status === 'success' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
              )}>
                {lastScanned.status === 'success' ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold">
                  {lastScanned.status === 'success' ? 'Đã nhập kho thành công!' : 'Lỗi nhập kho!'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {lastScanned.status === 'success' 
                    ? (lastScanned.isManual ? 'Thông tin linh kiện vừa nhập tay:' : 'Thông tin linh kiện vừa quét:') 
                    : lastScanned.errorMsg}
                </p>
              </div>
              
              {lastScanned.partId && (
                <div className="w-full bg-gray-50 p-8 rounded-2xl space-y-6">
                  <div className="flex justify-between items-center border-b border-gray-200 pb-4">
                    <span className="text-sm font-mono uppercase opacity-50">Linh kiện</span>
                    <span className="font-bold text-xl">{lastScanned.partName}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-200 pb-4">
                    <span className="text-sm font-mono uppercase opacity-50">Số lượng</span>
                    <span className="font-bold text-2xl">{lastScanned.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono uppercase opacity-50">Đích</span>
                    <div className="flex items-center gap-3 font-bold text-[#F27D26] text-xl">
                      <span>{STAGES.find(s => s.id === selectedStage)?.name}</span>
                      <ArrowRight size={20} />
                      <span className={cn(
                        "px-3 py-1 rounded text-xs",
                        targetLocation === 'IN' ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                      )}>
                        KHO_{targetLocation}
                      </span>
                    </div>
                  </div>
                  {!lastScanned.isManual && lastScanned.sourceName && (
                    <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                      <span className="text-xs font-mono uppercase opacity-50">Nguồn từ</span>
                      <span className="text-sm font-bold opacity-60">{lastScanned.sourceName} (OUT)</span>
                    </div>
                  )}
                </div>
              )}

              <button 
                onClick={() => setLastScanned(null)}
                className="w-full py-4 text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-[#141414] transition-colors"
              >
                Đóng thông báo
              </button>
            </motion.div>
          ) : (
            <div className="bg-gray-100 rounded-3xl border-2 border-dashed border-gray-300 h-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <Package size={64} strokeWidth={1} />
              <p className="mt-6 font-medium">Chi tiết pallet sẽ hiển thị tại đây<br />ngay sau khi bạn thực hiện nhập kho.</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function SettingsView({ parts, onPartsChange, labelSettings, onLabelSettingsChange }: { 
  parts: Part[], 
  onPartsChange: () => void, 
  labelSettings: any,
  onLabelSettingsChange: (s: any) => void,
  key?: string 
}) {
  const [newPart, setNewPart] = useState<Part>({ id: '', name: '', unit: 'Cái', level: 1 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingBOM, setIsImportingBOM] = useState(false);
  const [isImportingBOMV2, setIsImportingBOMV2] = useState(false);
  const [isImportingModelBOM, setIsImportingModelBOM] = useState(false);

  const [activeSettingsTab, setActiveSettingsTab] = useState<'parts' | 'bom' | 'label' | 'bom_v2' | 'model_bom'>('parts');

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  const handleResetData = () => {
    if (resetPassword === 'admin123') {
      storageService.resetAllData();
      window.location.reload();
    } else {
      alert('Mật khẩu không chính xác!');
    }
  };

  const handleBOMImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingBOM(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        console.log('Raw BOM data:', data);

        // Expected columns: ParentID (Level 3), ChildID (Level 2), ComponentWeight, ScrapWeight
        const importedBOM: BOMDefinition[] = data.map(row => {
          const parentId = String(row['ParentID'] || row['Mã cha'] || row['Level 3 ID'] || '').trim();
          const childId = String(row['ChildID'] || row['Mã con'] || row['Level 2 ID'] || '').trim();
          const compWeight = parseFloat(row['ComponentWeight'] || row['Khối lượng linh kiện'] || row['PartWeight'] || '0');
          const scrapWeight = parseFloat(row['ScrapWeight'] || row['Khối lượng phế'] || row['Scrap'] || '0');
          
          return {
            parentPartId: parentId,
            childPartId: childId,
            componentWeight: compWeight,
            scrapWeight: scrapWeight
          };
        }).filter(b => b.parentPartId && b.childPartId && (b.componentWeight > 0 || b.scrapWeight > 0));

        if (importedBOM.length === 0) {
          alert('Không tìm thấy dữ liệu định mức hợp lệ. Vui lòng kiểm tra tiêu đề cột (ParentID, ChildID, ComponentWeight, ScrapWeight).');
          setIsImportingBOM(false);
          return;
        }

        storageService.saveBOM(importedBOM);
        alert(`Đã nhập thành công ${importedBOM.length} định mức sản xuất!`);
      } catch (err) {
        console.error('BOM Import Error:', err);
        alert('Lỗi khi đọc file định mức.');
      } finally {
        setIsImportingBOM(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (rows.length < 2) {
          alert('File Excel không có dữ liệu.');
          setIsImporting(false);
          return;
        }

        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        const itemIdx = headers.findIndex(h => h === 'item' || h === 'mã linh kiện' || h === 'id');
        const descIdx = headers.findIndex(h => h === 'description' || h === 'tên linh kiện' || h === 'name');
        const unitIdx = headers.findIndex(h => h === 'unit' || h === 'đvt');

        if (itemIdx === -1 || descIdx === -1) {
          alert('Không tìm thấy cột Item hoặc Description trong file Excel.');
          setIsImporting(false);
          return;
        }

        const importedParts: Part[] = rows.slice(1).map(row => {
          // Determine level based on which of the first 3 columns has a value
          let level = 1;
          const col0 = String(row[0] || '').trim();
          const col1 = String(row[1] || '').trim();
          const col2 = String(row[2] || '').trim();

          if (col0 !== '') level = 1;
          else if (col1 !== '') level = 2;
          else if (col2 !== '') level = 3;

          return {
            id: String(row[itemIdx] || '').trim(),
            name: String(row[descIdx] || '').trim(),
            unit: String(unitIdx !== -1 ? row[unitIdx] : 'Cái').trim(),
            level: level
          };
        }).filter(p => p.id && p.name);

        if (importedParts.length === 0) {
          alert('Không tìm thấy dữ liệu hợp lệ trong file Excel.');
          setIsImporting(false);
          return;
        }

        // Update existing parts and add new ones from Excel
        const partsMap = new Map(parts.map(p => [p.id, p]));
        importedParts.forEach(p => {
          partsMap.set(p.id, p);
        });
        const newParts = Array.from(partsMap.values());

        storageService.saveParts(newParts);
        onPartsChange();
        alert(`Đã nhập thành công ${importedParts.length} linh kiện!`);
      } catch (err) {
        console.error('Excel Import Error:', err);
        alert('Lỗi khi đọc file Excel. Vui lòng đảm bảo file đúng định dạng.');
      } finally {
        setIsImporting(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPart.id || !newPart.name) return;
    
    const existing = parts.find(p => p.id === newPart.id);
    if (existing && !editingId) {
      alert('Mã linh kiện đã tồn tại!');
      return;
    }

    let updatedParts;
    if (editingId) {
      updatedParts = parts.map(p => p.id === editingId ? newPart : p);
    } else {
      updatedParts = [...parts, newPart];
    }

    storageService.saveParts(updatedParts);
    setNewPart({ id: '', name: '', unit: 'Cái', level: 1 });
    setEditingId(null);
    onPartsChange();
  };

  const handleEdit = (part: Part) => {
    setNewPart({
      ...part,
      level: part.level || 1
    });
    setEditingId(part.id);
  };

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa linh kiện này? Dữ liệu tồn kho liên quan sẽ không bị xóa nhưng có thể hiển thị không chính xác.')) {
      const updatedParts = parts.filter(p => p.id !== id);
      storageService.saveParts(updatedParts);
      onPartsChange();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
    >
      <div className="lg:col-span-1 bg-white p-10 rounded-2xl border border-gray-200 shadow-sm space-y-8">
        <h2 className="text-2xl font-bold tracking-tight">{editingId ? 'Cập nhật linh kiện' : 'Thêm linh kiện mới'}</h2>
        <form onSubmit={handleAddPart} className="space-y-6">
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase opacity-50">Mã linh kiện</label>
            <input 
              type="text" 
              value={newPart.id}
              onChange={e => setNewPart({...newPart, id: e.target.value})}
              disabled={!!editingId}
              className="w-full p-4 rounded-lg border border-gray-200 font-mono text-base focus:border-blue-600 outline-none disabled:bg-gray-50"
              placeholder="VD: LK001"
              required
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase opacity-50">Tên linh kiện</label>
            <input 
              type="text" 
              value={newPart.name}
              onChange={e => setNewPart({...newPart, name: e.target.value})}
              className="w-full p-4 rounded-lg border border-gray-200 text-base focus:border-blue-600 outline-none"
              placeholder="VD: Khung thép A1"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase opacity-50">Đơn vị</label>
              <input 
                type="text" 
                value={newPart.unit}
                onChange={e => setNewPart({...newPart, unit: e.target.value})}
                className="w-full p-4 rounded-lg border border-gray-200 text-base focus:border-blue-600 outline-none"
                placeholder="Cái, Bộ..."
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase opacity-50">Cấp BOM</label>
              <select 
                value={newPart.level || 1}
                onChange={e => setNewPart({...newPart, level: parseInt(e.target.value)})}
                className="w-full p-4 rounded-lg border border-gray-200 text-base focus:border-blue-600 outline-none bg-white"
              >
                <option value={1}>Cấp 1 (Hàn/Sơn)</option>
                <option value={2}>Cấp 2 (Laser/Chấn)</option>
                <option value={3}>Cấp 3 (Tôn tấm)</option>
              </select>
            </div>
          </div>
          <div className="pt-6 flex gap-3">
            <button 
              type="submit"
              className="flex-1 bg-blue-600 text-white py-4 rounded-lg font-bold text-base uppercase hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              {editingId ? 'Cập nhật' : 'Thêm mới'}
            </button>
            {editingId && (
              <button 
                type="button"
                onClick={() => { setEditingId(null); setNewPart({ id: '', name: '', unit: 'Cái', level: 1 }); }}
                className="px-6 py-4 border border-gray-200 rounded-lg text-base font-bold uppercase hover:bg-gray-50"
              >
                Hủy
              </button>
            )}
          </div>
        </form>

        <div className="pt-8 border-t border-gray-100 mt-8">
          <h3 className="text-xs font-bold uppercase opacity-50 mb-4 text-red-600">Khu vực nguy hiểm</h3>
          <button 
            onClick={() => setShowResetModal(true)}
            className="w-full py-3 border-2 border-red-100 text-red-600 rounded-lg text-sm font-bold uppercase hover:bg-red-50 transition-all flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            Xóa toàn bộ dữ liệu hệ thống
          </button>
        </div>

        <AnimatePresence>
          {showResetModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6"
              >
                <div className="flex items-center gap-4 text-red-600">
                  <AlertCircle size={32} />
                  <h3 className="text-xl font-bold">Xác nhận xóa dữ liệu</h3>
                </div>
                <p className="text-sm text-gray-500">Hành động này sẽ xóa vĩnh viễn toàn bộ danh mục linh kiện, tồn kho, định mức và nhật ký giao dịch. Không thể hoàn tác.</p>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase opacity-50">Nhập mật khẩu xác nhận</label>
                  <input 
                    type="password"
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    className="w-full p-3 rounded-lg border border-gray-200 focus:border-red-500 outline-none"
                    placeholder="Nhập mật khẩu..."
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => { setShowResetModal(false); setResetPassword(''); }}
                    className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-sm uppercase hover:bg-gray-200 transition-all"
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    onClick={handleResetData}
                    className="flex-1 py-3 bg-red-600 text-white rounded-lg font-bold text-sm uppercase hover:bg-red-700 transition-all"
                  >
                    Xác nhận xóa
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex border-b border-gray-100">
          <button 
            onClick={() => setActiveSettingsTab('parts')}
            className={cn(
              "flex-1 py-5 text-base font-bold uppercase tracking-widest transition-all border-b-2",
              activeSettingsTab === 'parts' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Danh mục linh kiện
          </button>
          <button 
            onClick={() => setActiveSettingsTab('bom')}
            className={cn(
              "flex-1 py-5 text-base font-bold uppercase tracking-widest transition-all border-b-2",
              activeSettingsTab === 'bom' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Định mức sản xuất (BOM)
          </button>
          <button 
            onClick={() => setActiveSettingsTab('bom_v2')}
            className={cn(
              "flex-1 py-5 text-base font-bold uppercase tracking-widest transition-all border-b-2",
              activeSettingsTab === 'bom_v2' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Định mức Hàn (BOM v2)
          </button>
          <button 
            onClick={() => setActiveSettingsTab('model_bom')}
            className={cn(
              "flex-1 py-5 text-base font-bold uppercase tracking-widest transition-all border-b-2",
              activeSettingsTab === 'model_bom' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Định mức Model
          </button>
          <button 
            onClick={() => setActiveSettingsTab('label')}
            className={cn(
              "flex-1 py-5 text-base font-bold uppercase tracking-widest transition-all border-b-2",
              activeSettingsTab === 'label' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            Cấu hình khổ nhãn
          </button>
        </div>

        {activeSettingsTab === 'bom_v2' ? (
          <div className="p-10 space-y-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-orange-600 p-3 rounded-xl text-white">
                  <Layers size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Định mức Hàn (BOM v2)</h2>
                  <p className="text-sm text-gray-500">Tự động trừ linh kiện Level 2 khi nhập kho OUT công đoạn Hàn</p>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="bg-white border-2 border-orange-600 text-orange-600 px-6 py-3 rounded-xl font-bold uppercase cursor-pointer hover:bg-orange-50 transition-all flex items-center gap-2">
                  <FileUp size={20} />
                  {isImportingBOMV2 ? 'Đang xử lý...' : 'Nhập Excel BOM v2'}
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsImportingBOMV2(true);
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      try {
                        const bstr = evt.target?.result;
                        const wb = XLSX.read(bstr, { type: 'binary' });
                        const wsname = wb.SheetNames[0];
                        const ws = wb.Sheets[wsname];
                        const data = XLSX.utils.sheet_to_json(ws) as any[];
                        
                        // Expected columns: ResultID, IngredientID, Quantity
                        const imported: BOMDefinitionV2[] = data.map(row => ({
                          resultPartId: String(row['ResultID'] || row['Mã thành phẩm'] || row['Mã cha'] || '').trim(),
                          ingredientPartId: String(row['IngredientID'] || row['Mã linh kiện'] || row['Mã con'] || '').trim(),
                          quantity: parseFloat(row['Quantity'] || row['Số lượng'] || '1')
                        })).filter(b => b.resultPartId && b.ingredientPartId && b.quantity > 0);

                        if (imported.length === 0) {
                          alert('Không tìm thấy dữ liệu hợp lệ. Cần các cột: ResultID, IngredientID, Quantity');
                        } else {
                          storageService.saveBOMV2(imported);
                          alert(`Đã nhập thành công ${imported.length} định mức Hàn!`);
                        }
                      } catch (err) {
                        alert('Lỗi khi đọc file.');
                      } finally {
                        setIsImportingBOMV2(false);
                        if (e.target) e.target.value = '';
                      }
                    };
                    reader.readAsBinaryString(file);
                  }} />
                </label>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="p-6 text-xs font-bold uppercase opacity-50">Thành phẩm (Level 1)</th>
                    <th className="p-6 text-xs font-bold uppercase opacity-50">Linh kiện thành phần (Level 2)</th>
                    <th className="p-6 text-xs font-bold uppercase opacity-50 text-center">Số lượng/1 đơn vị</th>
                  </tr>
                </thead>
                <tbody>
                  {storageService.getBOMV2().length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-20 text-center text-gray-400 italic">Chưa có dữ liệu định mức Hàn. Vui lòng nhập từ Excel.</td>
                    </tr>
                  ) : (
                    storageService.getBOMV2().map((b, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="p-6">
                          <div className="font-bold">{parts.find(p => p.id === b.resultPartId)?.name || b.resultPartId}</div>
                          <div className="text-xs font-mono opacity-50">{b.resultPartId}</div>
                        </td>
                        <td className="p-6">
                          <div className="font-bold">{parts.find(p => p.id === b.ingredientPartId)?.name || b.ingredientPartId}</div>
                          <div className="text-xs font-mono opacity-50">{b.ingredientPartId}</div>
                        </td>
                        <td className="p-6 text-center font-mono font-bold text-orange-600 text-xl">
                          x{b.quantity}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeSettingsTab === 'model_bom' ? (
          <div className="p-10 space-y-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-purple-600 p-3 rounded-xl text-white">
                  <ClipboardList size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Định mức Model (Model BOM)</h2>
                  <p className="text-sm text-gray-500">Liên kết Model với các linh kiện Level 1</p>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="bg-white border-2 border-purple-600 text-purple-600 px-6 py-3 rounded-xl font-bold uppercase cursor-pointer hover:bg-purple-50 transition-all flex items-center gap-2">
                  <FileUp size={20} />
                  {isImportingModelBOM ? 'Đang xử lý...' : 'Nhập Excel Model BOM'}
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsImportingModelBOM(true);
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      try {
                        const bstr = evt.target?.result;
                        const wb = XLSX.read(bstr, { type: 'binary' });
                        const wsname = wb.SheetNames[0];
                        const ws = wb.Sheets[wsname];
                        const data = XLSX.utils.sheet_to_json(ws) as any[];
                        
                        // Expected columns: ModelID, PartID, Quantity
                        const imported: ModelBOMDefinition[] = data.map(row => ({
                          modelId: String(row['ModelID'] || row['Mã model'] || '').trim(),
                          partId: String(row['PartID'] || row['Mã linh kiện'] || row['Mã con'] || '').trim(),
                          quantity: parseFloat(row['Quantity'] || row['Số lượng'] || '1')
                        })).filter(b => b.modelId && b.partId && b.quantity > 0);

                        if (imported.length === 0) {
                          alert('Không tìm thấy dữ liệu hợp lệ. Cần các cột: ModelID, PartID, Quantity');
                        } else {
                          storageService.saveModelBOM(imported);
                          alert(`Đã nhập thành công ${imported.length} định mức Model!`);
                        }
                      } catch (err) {
                        alert('Lỗi khi đọc file.');
                      } finally {
                        setIsImportingModelBOM(false);
                        if (e.target) e.target.value = '';
                      }
                    };
                    reader.readAsBinaryString(file);
                  }} />
                </label>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="p-6 text-xs font-bold uppercase opacity-50">Tên Model</th>
                    <th className="p-6 text-xs font-bold uppercase opacity-50">Linh kiện Level 1</th>
                    <th className="p-6 text-xs font-bold uppercase opacity-50 text-center">Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {storageService.getModelBOM().length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-20 text-center text-gray-400 italic">Chưa có dữ liệu định mức Model. Vui lòng nhập từ Excel.</td>
                    </tr>
                  ) : (
                    storageService.getModelBOM().map((b, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="p-6">
                          <div className="font-bold">{parts.find(p => p.id === b.modelId)?.name || b.modelId}</div>
                          <div className="text-xs font-mono opacity-50">{b.modelId}</div>
                        </td>
                        <td className="p-6">
                          <div className="font-bold">{parts.find(p => p.id === b.partId)?.name || b.partId}</div>
                          <div className="text-xs font-mono opacity-50">{b.partId}</div>
                        </td>
                        <td className="p-6 text-center font-mono font-bold text-purple-600 text-xl">
                          x{b.quantity}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeSettingsTab === 'label' ? (
          <div className="p-10 space-y-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-blue-600 p-3 rounded-xl text-white">
                <Printer size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Cấu hình in nhãn trực tiếp</h2>
                <p className="text-sm text-gray-500">Thiết lập khổ giấy và kích thước hiển thị trên PDF</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-50">Chiều rộng (mm)</label>
                    <input 
                      type="number"
                      value={labelSettings.width}
                      onChange={e => onLabelSettingsChange({...labelSettings, width: parseInt(e.target.value) || 0})}
                      className="w-full p-4 rounded-lg border border-gray-200 font-mono text-lg outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-50">Chiều cao (mm)</label>
                    <input 
                      type="number"
                      value={labelSettings.height}
                      onChange={e => onLabelSettingsChange({...labelSettings, height: parseInt(e.target.value) || 0})}
                      className="w-full p-4 rounded-lg border border-gray-200 font-mono text-lg outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-50">Cỡ chữ (px)</label>
                    <input 
                      type="number"
                      value={labelSettings.fontSize}
                      onChange={e => onLabelSettingsChange({...labelSettings, fontSize: parseInt(e.target.value) || 0})}
                      className="w-full p-4 rounded-lg border border-gray-200 font-mono text-lg outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase opacity-50">Kích thước QR (px)</label>
                    <input 
                      type="number"
                      value={labelSettings.qrSize}
                      onChange={e => onLabelSettingsChange({...labelSettings, qrSize: parseInt(e.target.value) || 0})}
                      className="w-full p-4 rounded-lg border border-gray-200 font-mono text-lg outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-8 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center">
                <span className="text-xs font-bold uppercase opacity-40 mb-4">Xem trước khổ giấy</span>
                <div 
                  className="bg-white shadow-lg border border-gray-300 flex flex-col items-center justify-center overflow-hidden"
                  style={{ 
                    width: `${labelSettings.width * 2}px`, 
                    height: `${labelSettings.height * 2}px`,
                    padding: '10px'
                  }}
                >
                  <div className="border border-black p-1 mb-1">
                    <div className="w-8 h-8 bg-gray-200" />
                  </div>
                  <div className="w-full h-2 bg-gray-100 mb-1" />
                  <div className="w-2/3 h-2 bg-gray-100" />
                </div>
                <p className="mt-4 text-xs text-gray-400 italic">Tỷ lệ xem trước 1:2</p>
              </div>
            </div>

            <div className="p-6 bg-blue-50 rounded-xl border border-blue-100 flex gap-4 items-start">
              <AlertCircle size={20} className="text-blue-600 mt-1" />
              <div className="text-sm text-blue-800 space-y-2">
                <p className="font-bold">Lưu ý khi in:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Trong hộp thoại in của trình duyệt, hãy chọn máy in nhãn của bạn.</li>
                  <li>Phần <strong>Khổ giấy (Paper Size)</strong> nên được đặt trùng với cấu hình ở trên.</li>
                  <li>Phần <strong>Lề (Margins)</strong> nên đặt là <strong>None</strong> để nhãn in ra chuẩn nhất.</li>
                  <li>Phần <strong>Tỷ lệ (Scale)</strong> nên đặt là <strong>Default</strong> hoặc <strong>100%</strong>.</li>
                </ul>
              </div>
            </div>
          </div>
        ) : activeSettingsTab === 'parts' ? (
          <>
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="font-bold text-2xl tracking-tight">Linh kiện ({parts.length})</h2>
              <label className={cn(
                "flex items-center gap-3 px-6 py-3 bg-green-600 text-white rounded-lg text-sm font-bold uppercase tracking-widest cursor-pointer hover:bg-green-700 transition-all",
                isImporting && "opacity-50 cursor-not-allowed"
              )}>
                <FileUp size={20} />
                {isImporting ? 'Đang nhập...' : 'Nhập Excel'}
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleExcelImport}
                  disabled={isImporting}
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="p-6 pl-10 text-xs font-mono uppercase opacity-50">Cấp</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">Mã LK</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">Tên Linh kiện</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">ĐVT</th>
                    <th className="p-6 pr-10 text-xs font-mono uppercase opacity-50 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parts.sort((a, b) => (a.level || 0) - (b.level || 0)).map(part => (
                    <tr key={part.id} className="hover:bg-gray-50/30 transition-colors">
                      <td className="p-6 pl-10">
                        <span className={cn(
                          "px-3 py-1 rounded text-xs font-bold",
                          part.level === 1 ? "bg-purple-100 text-purple-700" :
                          part.level === 2 ? "bg-blue-100 text-blue-700" :
                          "bg-green-100 text-green-700"
                        )}>
                          L{part.level || 1}
                        </span>
                      </td>
                      <td className="p-6 font-mono text-base font-bold">{part.id}</td>
                      <td className="p-6 text-base font-medium">{part.name}</td>
                      <td className="p-6 text-base text-gray-500">{part.unit}</td>
                      <td className="p-6 pr-10 text-right">
                        <div className="flex justify-end gap-3">
                          <button 
                            onClick={() => handleEdit(part)}
                            className="p-3 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={20} />
                          </button>
                          <button 
                            onClick={() => handleDelete(part.id)}
                            className="p-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {parts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-20 text-center text-gray-400 italic">Chưa có linh kiện nào trong danh mục.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex flex-col">
                <h2 className="font-bold text-2xl tracking-tight">Định mức sản xuất (KG)</h2>
                <p className="text-xs text-gray-400">Cột yêu cầu: ParentID, ChildID, ComponentWeight, ScrapWeight</p>
              </div>
              <label className={cn(
                "flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition-all",
                isImportingBOM && "opacity-50 cursor-not-allowed"
              )}>
                <FileUp size={20} />
                {isImportingBOM ? 'Đang nhập...' : 'Nhập Định Mức'}
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleBOMImport}
                  disabled={isImportingBOM}
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="p-6 pl-10 text-xs font-mono uppercase opacity-50">Mã Cha (L3)</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">Mã Con (L2)</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">KL Linh kiện (kg)</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">KL Phế (kg)</th>
                    <th className="p-6 text-xs font-mono uppercase opacity-50">Tổng (kg)</th>
                    <th className="p-6 pr-10 text-xs font-mono uppercase opacity-50 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {storageService.getBOM().map((bom, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/30 transition-colors">
                      <td className="p-6 pl-10 font-mono text-base">{bom.parentPartId}</td>
                      <td className="p-6 font-mono text-base">{bom.childPartId}</td>
                      <td className="p-6 font-mono text-base font-bold text-blue-600">{bom.componentWeight}</td>
                      <td className="p-6 font-mono text-base font-bold text-orange-600">{bom.scrapWeight}</td>
                      <td className="p-6 font-mono text-base font-bold">{(bom.componentWeight + bom.scrapWeight).toFixed(4)}</td>
                      <td className="p-6 pr-10 text-right">
                        <button 
                          onClick={() => {
                            const current = storageService.getBOM();
                            current.splice(idx, 1);
                            storageService.saveBOM(current);
                            onPartsChange();
                          }}
                          className="p-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {storageService.getBOM().length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-gray-400 italic">Chưa có dữ liệu định mức. Vui lòng nhập file Excel.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

interface HistoryProps {
  transactions: Transaction[];
  parts: Part[];
  key?: string;
}

function HistoryView({ transactions, parts }: HistoryProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <div className="p-10 border-b border-gray-100 flex justify-between items-center">
        <h2 className="font-bold text-2xl tracking-tight">Nhật ký giao dịch hệ thống</h2>
        <div className="flex gap-4">
          <button className="px-6 py-3 text-sm font-bold uppercase border border-gray-200 rounded-lg hover:bg-gray-50">Xuất Excel</button>
          <button className="px-6 py-3 text-sm font-bold uppercase border border-gray-200 rounded-lg hover:bg-gray-50">Lọc dữ liệu</button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="p-6 pl-10 text-xs font-mono uppercase opacity-50">Thời gian</th>
              <th className="p-6 text-xs font-mono uppercase opacity-50">Loại GD</th>
              <th className="p-6 text-xs font-mono uppercase opacity-50">Mã Linh kiện</th>
              <th className="p-6 text-xs font-mono uppercase opacity-50">Số lượng</th>
              <th className="p-6 text-xs font-mono uppercase opacity-50">Công đoạn</th>
              <th className="p-6 text-xs font-mono uppercase opacity-50">Nguồn</th>
              <th className="p-6 pr-10 text-xs font-mono uppercase opacity-50">ID Giao dịch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-24 text-center text-gray-400">
                  <div className="flex flex-col items-center">
                    <History size={64} strokeWidth={1} className="opacity-20 mb-6" />
                    <p className="font-mono text-base">Hệ thống chưa ghi nhận giao dịch nào</p>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-6 pl-10 font-mono text-sm">{format(tx.timestamp, 'dd/MM/yyyy HH:mm:ss')}</td>
                  <td className="p-6">
                    <span className={cn(
                      "text-xs font-bold uppercase px-3 py-1.5 rounded-full",
                      tx.type === 'STAGE_OUT' ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                    )}>
                      {tx.type === 'STAGE_OUT' ? 'Hoàn thành' : 'Nhập kho'}
                    </span>
                  </td>
                  <td className="p-6 font-bold text-base">
                    {tx.partId}
                    <span className="block text-xs font-normal opacity-50">{parts.find(p => p.id === tx.partId)?.name}</span>
                  </td>
                  <td className="p-6 font-mono font-bold text-xl">
                    {tx.type === 'STAGE_OUT' ? '+' : ''}{tx.quantity}
                  </td>
                  <td className="p-6 font-bold text-base">{STAGES.find(s => s.id === tx.stageId)?.name}</td>
                  <td className="p-6 text-sm opacity-60">{tx.sourceStageId ? STAGES.find(s => s.id === tx.sourceStageId)?.name : '-'}</td>
                  <td className="p-6 pr-10 font-mono text-xs opacity-40">{tx.id.split('-')[0].toUpperCase()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}


