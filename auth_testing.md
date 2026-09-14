# Existing JWT authentication — role-routing verification

Keep the application's existing bearer-token/cookie API and password hashing.
Read `/app/memory/test_credentials.md`; never expose tokens in test reports.

1. Verify Mongo has the seeded admin with a bcrypt hash and unchanged credentials.
2. POST `/api/auth/login` using the external URL; verify returned user role and token.
3. GET `/api/auth/me` with that bearer token; confirm the same user and role.
4. Browser password login: admin lands directly at `/admin` with no member home.
5. Reload, open `/login` while signed in, and open `/welcome`: admin stays in Admin.
6. Student login goes to `/home`; student cannot access `/admin` or admin APIs.
7. Remember off uses session storage; remember on uses local storage. Logout clears both.
8. Existing magic-link consume routes admins to `/admin` and students to `/home`.
9. Anonymous access to admin redirects to login; invalid login stays on login.
10. Verify existing admin deep links, back/forward and direct reload.

No auth provider/secret/session format changes are authorized by this task.