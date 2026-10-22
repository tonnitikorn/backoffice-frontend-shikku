"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";

interface AuditLogRow {
  _id: string;
  userId?: { name: string };
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const query = useQuery({ queryKey: ["audit-logs"], queryFn: () => apiFetch<{ items: AuditLogRow[] }>("/audit-logs") });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Audit Log</h1>
      <div className="table-wrap">
        <table className="data-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ผู้ใช้</th>
            <th>Action</th>
            <th>Entity</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.items.map((log) => (
            <tr key={log._id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>{log.userId?.name ?? "-"}</td>
              <td>{log.action}</td>
              <td>
                {log.entityType} {log.entityId ? `#${log.entityId.slice(-6)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
