/**
 * Better Auth sign-in always lands on one of two application-owned paths.
 * Never redirect to an arbitrary URL, another origin, or an admin route
 * selected by a caller. The judge path is the only supported exception.
 */
export function postSignInDestination(search: string): "/judge" | "/dashboard" {
  const requested = new URLSearchParams(search).getAll("returnTo");
  return requested.length === 1 && requested[0] === "/judge"
    ? "/judge"
    : "/dashboard";
}
