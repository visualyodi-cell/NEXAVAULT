import {
  Activity,
  Copy,
  Download,
  FolderInput,
  FolderPlus,
  Pencil,
  RotateCcw,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ActivityLogRecord } from '../types/cloud';

interface ActivityViewProps {
  logs: ActivityLogRecord[];
  loading: boolean;
}

function getActionIcon(action: string) {
  switch (action) {
    case 'upload':
      return Upload;
    case 'download':
      return Download;
    case 'rename':
      return Pencil;
    case 'copy':
      return Copy;
    case 'move':
      return FolderInput;
    case 'delete':
      return Trash2;
    case 'restore':
      return RotateCcw;
    case 'share':
    case 'revoke_share':
      return Share2;
    case 'favorite':
      return Star;
    case 'folder_create':
      return FolderPlus;
    case 'auth':
      return ShieldCheck;
    default:
      return Activity;
  }
}

export function ActivityView({ logs, loading }: ActivityViewProps) {
  return (
    <div className="glass-panel flex flex-1 flex-col rounded-3xl p-5 sm:p-6">
      <div className="border-b border-white/[0.12] pb-4">
        <h1 className="font-display text-xl font-semibold text-white">
          Aktivitas Vault
        </h1>
        <p className="mt-0.5 text-xs text-slate-300/80">
          Riwayat unggahan, unduhan, perubahan nama, berbagi, dan keamanan akun.
        </p>
      </div>

      <div className="mt-5 flex-1">
        {loading ? (
          <p className="text-xs text-slate-300/80">Memuat log aktivitas...</p>
        ) : logs.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <Activity className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-200">Belum ada aktivitas tercatat.</p>
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/[0.08] rounded-2xl">
            {logs.map((log) => {
              const Icon = getActionIcon(log.action);
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="glass-control flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-amber-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white sm:text-sm">
                        {log.targetName}
                      </p>
                      <p className="truncate text-[11px] text-slate-300/80">
                        {log.details || log.action}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                    {new Date(log.createdAt).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
