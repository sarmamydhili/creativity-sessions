"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function SlidingOverlay({ open, title, onClose, children, footer }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex justify-end bg-slate-950/45 backdrop-blur-[16px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="h-full w-full max-w-[880px] overflow-y-auto border-l border-slate-700/50 bg-slate-900/95 text-slate-100 shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <h3 className="text-base font-semibold">{title}</h3>
              <button
                type="button"
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
                onClick={onClose}
              >
                Close
              </button>
            </div>
            <div className="p-5">{children}</div>
            {footer ? (
              <div className="sticky bottom-0 border-t border-slate-700 bg-slate-900/98 px-5 py-4">
                {footer}
              </div>
            ) : null}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
