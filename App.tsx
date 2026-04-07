import { useState, useRef, ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { QRCodeSVG } from "qrcode.react";
import { Upload, Printer, Trash2, User, FileSpreadsheet, Image as ImageIcon, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- 1. GIAO DIỆN THẺ NHÂN VIÊN (ID CARD) ---
const IDCard = ({ emp, photo }: { emp: any, photo?: string }) => (
  <div className="id-card relative w-[350px] h-[220px] bg-white overflow-hidden shadow-lg border border-gray-200 flex flex-col font-sans">
    {/* Phần đầu màu đỏ + Logo */}
    <div className="bg-[#E30613] h-20 flex flex-col items-center justify-center relative">
      <div className="flex flex-col items-center">
        <div className="relative bg-[#007A87] rounded-b-xl px-4 py-1 border-2 border-white">
          <div className="bg-white rounded-full px-4 py-0.5 border border-[#007A87]">
            <span className="text-[#E30613] font-black text-xs tracking-tighter">SUNHOUSE</span>
            <span className="text-[#E30613] font-bold text-[8px] align-top">®</span>
          </div>
        </div>
      </div>
      <div className="text-white font-bold text-[13px] mt-1 tracking-wide uppercase text-center px-2">
        NHÀ MÁY SUNHOUSE BÌNH DƯƠNG
      </div>
    </div>

    {/* Phần thân: Ảnh + Thông tin */}
    <div className="flex-1 flex p-3 relative">
      <div className="w-28 h-32 border-2 border-gray-100 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
        {photo ? (
          <img src={photo} alt={emp.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <User className="w-12 h-12 text-gray-300" />
        )}
      </div>

      <div className="flex-1 pl-4 flex flex-col justify-center overflow-hidden">
        <div className="text-black font-bold text-lg leading-tight mb-1 truncate">
          {emp.name}
        </div>
        <div className="text-black font-bold text-base">
          ID: {emp.id}
        </div>
      </div>

      {/* Mã QR */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <QRCodeSVG value={emp.id} size={50} />
      </div>
    </div>

    {/* Họa tiết xanh góc dưới */}
    <div className="absolute bottom-4 right-0 w-48 h-8 bg-[#0066B2]" style={{ clipPath: 'polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%)' }}></div>
    <div className="bg-[#E30613] h-3 mt-auto"></div>
  </div>
);

// --- 2. COMPONENT CHÍNH (APP) ---
export default function App() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [photos, setPhotos] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Hàm chuẩn hóa chuỗi để so khớp cột Excel
  const clean = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]/g, "");

  // Xử lý tải file Excel
  const handleExcel = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        if (!data.length) return setError("File trống!");

        const parsed = data.map(row => {
          let id = "", name = "";
          Object.keys(row).forEach(k => {
            const nk = clean(k);
            if (["id", "manv", "maso"].includes(nk)) id = String(row[k]);
            if (["name", "hoten", "ten"].includes(nk)) name = String(row[k]);
          });
          return { id, name };
        }).filter(item => item.id && item.name);

        if (!parsed.length) return setError("Không tìm thấy cột ID hoặc Họ tên!");
        setEmployees(parsed);
      } catch (err) { setError("Lỗi đọc file!"); }
    };
    reader.readAsArrayBuffer(file);
  };

  // Xử lý tải ảnh
  const handlePhotos = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const name = file.name.split(".")[0];
        setPhotos(prev => ({ ...prev, [name]: evt.target?.result as string }));
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
      {/* CSS cho việc in ấn */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { display: grid !important; grid-template-columns: 1fr 1fr; gap: 20px; visibility: visible !important; }
          body { background: white; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto no-print space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl shadow-md flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-red-600">SUNHOUSE ID CARD</h1>
            <p className="text-gray-500 text-sm">Tải Excel & Ảnh -> Xem -> In</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} disabled={!employees.length} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50">
              IN TẤT CẢ ({employees.length})
            </button>
            <button onClick={() => { setEmployees([]); setPhotos({}); }} className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">Xóa</button>
          </div>
        </div>

        {/* Điều khiển */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-dashed border-gray-300 hover:border-red-400 cursor-pointer text-center" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet className="mx-auto mb-2 text-green-600" />
            <p className="font-bold">1. Chọn file Excel</p>
            <input type="file" ref={fileInputRef} onChange={handleExcel} accept=".xlsx,.xls" className="hidden" />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer text-center" onClick={() => photoInputRef.current?.click()}>
            <ImageIcon className="mx-auto mb-2 text-blue-600" />
            <p className="font-bold">2. Chọn nhiều ảnh</p>
            <input type="file" ref={photoInputRef} onChange={handlePhotos} multiple accept="image/*" className="hidden" />
          </div>
        </div>

        {/* Xem trước */}
        <div className="bg-white p-6 rounded-xl shadow-md">
          <h2 className="font-bold mb-4 border-b pb-2">XEM TRƯỚC ({employees.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 justify-items-center">
            {employees.map(emp => (
              <IDCard key={emp.id} emp={emp} photo={photos[emp.id] || photos[emp.name]} />
            ))}
          </div>
        </div>
      </div>

      {/* Khu vực in (ẩn khi xem, hiện khi in) */}
      <div className="print-area hidden p-4">
        {employees.map(emp => (
          <IDCard key={emp.id} emp={emp} photo={photos[emp.id] || photos[emp.name]} />
        ))}
      </div>
    </div>
  );
}
