import { formatUserDate } from "@/lib/dates";

export type InboxRow = {
  id: string;
  fromEmail: string;
  subject: string | null;
  receivedAt: string;
  handledAt: string | null;
};

export function AdminInbox({ enabled, rows }: { enabled: boolean; rows: InboxRow[] }) {
  return (
    <>
      {!enabled ? (
        <p className="alert">Reply inbox is off. INBOUND_EMAIL_ENABLED is not set, and DNS for team.sweetsuccessfundraising.com is not approved. Prospect emails have no Reply-To until that launch gate is opened.</p>
      ) : null}
      {enabled && rows.length === 0 ? <p>No replies yet.</p> : null}
      {rows.length > 0 && (
        <div className="table-wrap panel">
          <table>
            <thead>
              <tr><th>From</th><th>Subject</th><th>Received</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.fromEmail}</td>
                  <td>{row.subject || "—"}</td>
                  <td>{formatUserDate(row.receivedAt)}</td>
                  <td>{row.handledAt ? "Handled" : "Unread"}</td>
                  <td>
                    {row.handledAt ? null : (
                      <form action={`/api/admin/inbox/${row.id}/handled`} method="post">
                        <button className="btn btn-ghost" type="submit">Mark handled</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
