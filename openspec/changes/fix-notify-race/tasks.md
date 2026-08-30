# Tasks: fix-notify-race

- [ ] 1.1 RED: notification-service.test.ts — overlapping rounds with slow provider: exactly 1 send.
- [ ] 1.2 GREEN: service loop = alreadyNotifiedFresh → markAsNotified (reserve) → send; remove post-send mark.
- [ ] 2.1 RED+GREEN: app-state.test.ts — alreadyNotifiedFresh true after markAsNotified, false before.
- [ ] 3.1 Full suite green; update docs; close #19; archive.
