# Tasks: fix-notify-race

- [x] 1.1 RED: notification-service.test.ts — overlapping rounds with slow provider: exactly 1 send.
- [x] 1.2 GREEN: service loop = alreadyNotifiedFresh → markAsNotified (reserve) → send; remove post-send mark.
- [x] 2.1 RED+GREEN: app-state.test.ts — alreadyNotifiedFresh true after markAsNotified, false before.
- [x] 3.1 Full suite green; update docs; close #19; archive.
