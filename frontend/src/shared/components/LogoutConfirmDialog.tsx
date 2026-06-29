import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutConfirmDialog({ isOpen, onConfirm, onCancel }: LogoutConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="border-primary/15 bg-card text-foreground shadow-2xl sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-primary">Confirm Logout</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Are you sure you want to logout?
          </p>
        </div>
        <DialogFooter className="flex gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-primary/20 bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2"
          >
            No
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary/35 focus:ring-offset-2"
            style={{ backgroundImage: 'linear-gradient(to right, var(--primary), var(--secondary-accent))' }}
          >
            Yes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
