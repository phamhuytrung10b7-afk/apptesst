import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertOctagon, HelpCircle, Info, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  iconType?: 'danger' | 'warning' | 'info' | 'question';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = 'Xác nhận hành động',
  message,
  confirmText = 'Đồng ý',
  cancelText = 'Hủy bỏ',
  confirmVariant = 'danger',
  iconType = 'danger',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const getIcon = () => {
    switch (iconType) {
      case 'warning':
        return (
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
            <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'info':
        return (
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20">
            <Info className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'question':
        return (
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 border border-indigo-500/20">
            <HelpCircle className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
      case 'danger':
      default:
        return (
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 border border-red-500/20">
            <AlertOctagon className="w-6 h-6 stroke-[2.2]" />
          </div>
        );
    }
  };

  const getConfirmButtonClasses = () => {
    switch (confirmVariant) {
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20 hover:shadow-amber-600/30';
      case 'primary':
        return 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30';
      case 'danger':
      default:
        return 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 hover:shadow-red-600/30';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop with modern blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCancel}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
          />

          {/* Modal Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10"
            role="dialog"
            aria-modal="true"
          >
            {/* Header / Body */}
            <div className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {getIcon()}
                  <div className="space-y-1 pt-1">
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
                      {title}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors shrink-0 cursor-pointer"
                  aria-label="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Message Content */}
              <div className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed whitespace-pre-line pl-0 sm:pl-16">
                {message}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-slate-50/80 px-6 sm:px-7 py-4 sm:py-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-200/70 hover:bg-slate-200 active:scale-[0.98] transition-all cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                }}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all cursor-pointer ${getConfirmButtonClasses()}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export interface ConfirmOptions {
  title?: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  iconType?: 'danger' | 'warning' | 'info' | 'question';
  onConfirm?: () => void;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  showConfirm: (options: ConfirmOptions & { onConfirm: () => void; onCancel?: () => void }) => void;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<(ConfirmModalProps & { resolve?: (val: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title: options.title || 'Xác nhận hành động',
        message: options.message,
        confirmText: options.confirmText || 'Đồng ý',
        cancelText: options.cancelText || 'Hủy bỏ',
        confirmVariant: options.confirmVariant || 'danger',
        iconType: options.iconType || (options.confirmVariant === 'warning' ? 'warning' : 'danger'),
        onConfirm: () => {
          setModalState(null);
          if (options.onConfirm) options.onConfirm();
          resolve(true);
        },
        onCancel: () => {
          setModalState(null);
          resolve(false);
        },
      });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions & { onConfirm: () => void; onCancel?: () => void }) => {
    setModalState({
      isOpen: true,
      title: options.title || 'Xác nhận hành động',
      message: options.message,
      confirmText: options.confirmText || 'Đồng ý',
      cancelText: options.cancelText || 'Hủy bỏ',
      confirmVariant: options.confirmVariant || 'danger',
      iconType: options.iconType || (options.confirmVariant === 'warning' ? 'warning' : 'danger'),
      onConfirm: () => {
        setModalState(null);
        options.onConfirm();
      },
      onCancel: () => {
        setModalState(null);
        if (options.onCancel) options.onCancel();
      },
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, showConfirm }}>
      {children}
      {modalState && <ConfirmModal {...modalState} />}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

export default ConfirmModal;
