# Security Specification: Cafe 777 Firestore Rules

## 1. Data Invariants
- **Identity Integrity**: A user can only modify their own profile, except for admins.
- **Relational Sync**: Submissions and RSVPS require the parent contest/event to exist.
- **Terminal State Locking**: Completed contests cannot accept new submissions.
- **System-Only Fields**: `role`, `reputation`, `verified_reviews`, and `status` fields cannot be arbitrarily modified by the users client.
- **Temporal Integrity**: `created_at` must use the server timestamp.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing**: User A trying to update User B's profile.
2. **Role Escalation**: Regular user updating their `role` to `admin`.
3. **Orphaned Write**: Creating an event RSVP for an event that doesn't exist.
4. **Update-Gap**: Changing `status` of an event when the action shouldn't allow it.
5. **ID Poisoning**: Submitting a document ID that is 1MB of junk data.
6. **Denial of Wallet**: Inserting a 1MB string into the `bio` field.
7. **Type Mismatch**: Sending a string for a number field (e.g., `rating`).
8. **Temporal Forgery**: Creating a document with a `created_at` timestamp in the past/future.
9. **Terminal State Bypass**: Submitting to a contest after it has ended.
10. **Array Overflow**: Appending more than the allowed maximum elements to `interests`.
11. **PII Blanket Read**: Querying all users' emails without admin rights.
12. **Unauthorized Deletion**: User deleting another user's post.

## 3. The Test Runner
A test runner `firestore.rules.test.ts` will confirm these fail. (See implemented code)
