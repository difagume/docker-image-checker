# Container Status Set Specification

## Purpose

Closed vocabulary of container update statuses rendered by the dashboard. Prevents resurrection of the dead `checking` status.

## Requirements

## ADDED Requirements

### Requirement: Closed Status Vocabulary

The container update status set MUST be a closed vocabulary (local, updated, available, unknown, transient). The status mapper MUST NOT emit a `checking` value under any input, and the `checking` key MUST NOT exist in UI status dictionaries or status-rendering components.

#### Scenario: Mapper never emits checking

- GIVEN any combination of local digest presence, latest digest, and verdict
- WHEN the status mapper runs
- THEN the emitted status is one of the closed vocabulary values, never `checking`

#### Scenario: No dead checking key remains

- GIVEN the shipped dictionaries and status components
- WHEN the codebase and dictionary files are inspected
- THEN no `checking` status key, branch, or type reference exists
