import { formatUserDate } from "@/lib/dates";
import { formatCad } from "@/lib/money";

export type ApplicationRow = {
  organizerId: string;
  name: string;
  team: string;
  sport: string;
  goalCents: number | null;
  participants: number | null;
  appliedAt: string;
  email: string;
  city: string;
};

export function AdminApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  if (rows.length === 0) return <p>No new applications.</p>;
  return (
    <div className="table-wrap panel">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Team</th>
            <th>Sport</th>
            <th>Goal</th>
            <th>Participants</th>
            <th>Applied</th>
            <th>Email</th>
            <th>City</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.organizerId}>
              <td>{row.name}</td>
              <td>{row.team}</td>
              <td>{row.sport}</td>
              <td>{row.goalCents == null ? "—" : formatCad(row.goalCents)}</td>
              <td>{row.participants == null ? "—" : row.participants}</td>
              <td>{formatUserDate(row.appliedAt)}</td>
              <td>{row.email}</td>
              <td>{row.city}</td>
              <td>
                <details className="approve">
                  <summary>Approve, create campaign</summary>
                  <form className="approve-form" action={`/api/admin/applications/${row.organizerId}/approve`} method="post">
                    <label htmlFor={`start-${row.organizerId}`}>Start date</label>
                    <input id={`start-${row.organizerId}`} name="start_date" type="date" required />
                    <label htmlFor={`end-${row.organizerId}`}>End date</label>
                    <input id={`end-${row.organizerId}`} name="end_date" type="date" required />
                    <button className="btn btn-navy" type="submit">Create campaign</button>
                  </form>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
