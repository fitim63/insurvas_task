import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/ui';
import { AuthPage } from '@/pages/AuthPage';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { ImportExportPage } from '@/pages/ImportExportPage';
import { LockPage } from '@/pages/LockPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { VaultPage } from '@/pages/VaultPage';
import { useVault } from '@/state/vault';

export function App() {
  const { status } = useVault();

  if (status === 'booting') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (status === 'signedOut') {
    return (
      <Routes>
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (status === 'locked') return <LockPage />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<VaultPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/import" element={<ImportExportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
