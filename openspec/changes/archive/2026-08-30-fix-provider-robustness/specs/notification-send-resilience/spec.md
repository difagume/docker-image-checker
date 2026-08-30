# Notification Send Resilience Specification

## Purpose

Guarantee that a single unresponsive notification provider endpoint (Telegram, ntfy, Discord) cannot stall or freeze a scheduler check round. Adds a bounded deadline per send attempt, fail-continuation across remaining providers/messages, and validation parity when a provider is disabled. Closes B-08 and B-15a.

## Requirements

### Requirement: Per-Send Deadline

The system MUST apply a bounded deadline to every individual provider send attempt. If a provider endpoint does not respond within the deadline, the send MUST be treated as failed. A send attempt MUST NOT be allowed to block a check round indefinitely.

#### Scenario: Hung endpoint times out

- GIVEN a provider endpoint that accepts the request but never responds
- WHEN a send attempt is dispatched to that provider
- THEN the send fails within the configured deadline
- AND the check round completes

#### Scenario: Normal send completes under deadline

- GIVEN a provider endpoint responding normally
- WHEN a send is dispatched
- THEN the message is delivered and counted as sent

#### Scenario: Deadline error is classified as failure

- GIVEN a send interrupted by the deadline
- WHEN the outcome is evaluated
- THEN it is treated as a failed send (same class as any other provider error), not a success

### Requirement: Fail Continuation

The system MUST continue dispatching remaining messages and providers after a send fails, including deadline failures. Each failure MUST be logged without aborting the round. This MUST NOT alter the reserve-before-send ordering defined by the notification-dedup spec: the reservation is still written before dispatch, and failed sends remain marked (NOTIF-07).

#### Scenario: First provider hung, others still send

- GIVEN a round with multiple messages and Telegram's endpoint hung
- WHEN the deadline expires for the Telegram send
- THEN the remaining messages are still dispatched to the other providers
- AND failures are logged

#### Scenario: Dedup semantics preserved across deadline failure

- GIVEN a notification reserved before dispatch
- WHEN its send fails due to the deadline
- THEN the dedup entry stays marked and the next round does not resend it

### Requirement: Provider Validation Parity When Disabled

Each notification provider's validation MUST return "not valid" when that provider is disabled, regardless of configuration completeness. Discord validation MUST behave identically to Telegram and ntfy in this regard.

#### Scenario: Discord disabled

- GIVEN Discord notifications are disabled
- WHEN Discord provider validation runs
- THEN it reports the provider as not valid, even if other settings are present

#### Scenario: Provider enabled with complete config

- GIVEN Discord notifications enabled and its webhook configured
- WHEN validation runs
- THEN it reports the provider as valid

#### Scenario: Provider enabled with incomplete config

- GIVEN Discord notifications enabled and its webhook missing
- WHEN validation runs
- THEN it reports the provider as not valid
