import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function TestModalPage() {
  const [open, setOpen] = useState(false);

  console.log('[TestModal] Render - open:', open);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dialog Test Page</h1>
      <Button onClick={() => {
        console.log('[TestModal] Button clicked, setting open to true');
        setOpen(true);
      }}>
        Open Test Dialog
      </Button>

      <Dialog open={open} onOpenChange={(newOpen) => {
        console.log('[TestModal] onOpenChange called with:', newOpen);
        setOpen(newOpen);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Dialog</DialogTitle>
            <DialogDescription>
              If you can see this, the Dialog component is working!
            </DialogDescription>
          </DialogHeader>
          <p>Dialog content here</p>
        </DialogContent>
      </Dialog>

      <div className="mt-4 p-4 bg-gray-100 rounded">
        <p>Current state: {open ? 'OPEN' : 'CLOSED'}</p>
      </div>
    </div>
  );
}
