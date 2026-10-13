---
name: Bug report
about: Something in the dashboard, API or callback ingest does not work as expected

---

**Describe the bug**
A clear and concise description of what the bug is.

**To reproduce**
1. Go to '...'
2. Click on '...'
3. See error

For callback problems, include the callback type (DATA/UPLINK or DATA_ADVANCED), the body template you configured
and the HTTP status the Sigfox backend reported. Remove API tokens and device IDs you do not want to share.

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment**
 - Commit or version you deployed: [e.g. `abc1234`]
 - Workers plan: [Free / Paid]
 - Browser and OS: [e.g. Chrome 140 on macOS]

**Logs**
Relevant lines from `npx wrangler tail` or the Workers dashboard logs, if any.

**Additional context**
Add any other context about the problem here.
