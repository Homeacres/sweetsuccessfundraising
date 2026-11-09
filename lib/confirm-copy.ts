export function confirmSuccessCopy(team: string, shortly: string): { heading: string; body: string } {
  return {
    heading: `We've got your ${team} request!`,
    body: `We'll check our calendar and confirm your start window ${shortly}. Nothing starts until we confirm with you, and nothing goes on sale before your start date. Watch your inbox for our email.`,
  };
}
