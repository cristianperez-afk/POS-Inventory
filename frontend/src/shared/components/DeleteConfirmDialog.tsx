import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  title = 'Confirm Delete',
  description,
  confirmLabel = 'Yes',
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="border-[#00a7a5]/15 bg-white text-[#003534] shadow-2xl sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#007a5e]">{title}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <DialogFooter className="flex gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-[#007a5e]/20 bg-white px-4 py-2 text-sm font-semibold text-[#007a5e] transition hover:bg-[#007a5e]/5 focus:outline-none focus:ring-2 focus:ring-[#00a7a5]/30 focus:ring-offset-2"
          >
            No
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2"
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
