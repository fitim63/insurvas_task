import { atLeast, type VaultItem } from '@vault/core';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, Field, Select } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

export function MoveDialog({ item, open, onOpenChange }: { item: VaultItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { service, collections, refresh } = useUnlockedVault();
  const [target, setTarget] = useState(item.collectionId ?? '');
  const [busy, setBusy] = useState(false);
  const options = collections.filter((c) => atLeast(c.role, 'editor'));

  useEffect(() => {
    if (open) setTarget(item.collectionId ?? '');
  }, [open, item.collectionId]);

  async function move() {
    setBusy(true);
    try {
      await service.moveItem(item, collections.find((c) => c.id === target) ?? null);
      await refresh();
      toast.success(target ? 'Moved to collection' : 'Moved to your private vault');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Move to collection"
      description="The item key gets wrapped with the collection's key, so every member can decrypt it."
    >
      <Field label="Collection">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">None (only people shared with directly)</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void move()} loading={busy} disabled={target === (item.collectionId ?? '')}>
          Move
        </Button>
      </div>
    </Dialog>
  );
}
