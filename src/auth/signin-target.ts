/**
 * Better Auth sign-in always lands on one of two application-owned paths.
 * Never redirect to an arbitrary URL, another origin, or an admin route
 * selected by a caller. The judge path is the only supported exception.
 */
export function postSignInDestination(search: string): "/judge" | "/dashboard" {
  return new URLSearchParams(search).get("returnTo") === "/judge"
    ? "/judge"
    : "/dashboard";
}
