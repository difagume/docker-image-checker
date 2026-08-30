# Refresh Accessibility I18n Specification

## Purpose

Refresh-control accessibility strings (screen-reader-only labels) MUST be locale-driven, not hard-coded English literals. Covers B-12 (#24).

## Requirements

### Requirement: Dictionary-Driven Refresh Accessibility Strings

All refresh-control accessibility strings (including screen-reader-only text) MUST be resolved from the i18n dictionaries for every supported locale (EN, ES, PT-BR). Components MUST NOT embed hard-coded English literals for these strings. Strings remain server-rendered dictionary lookups; no client-side time APIs or prerender hazards are introduced.

#### Scenario: English locale uses dictionary string

- GIVEN the active locale is EN
- WHEN the refresh control renders
- THEN its accessibility text matches the EN dictionary value for the refresh key

#### Scenario: Spanish locale uses dictionary string

- GIVEN the active locale is ES
- WHEN the refresh control renders
- THEN its accessibility text matches the ES dictionary value (non-English)

#### Scenario: Portuguese locale uses dictionary string

- GIVEN the active locale is PT-BR
- WHEN the refresh control renders
- THEN its accessibility text matches the PT-BR dictionary value (non-English)

#### Scenario: Missing key falls back safely

- GIVEN a locale dictionary lacking a refresh key
- WHEN the refresh control renders
- THEN the system falls back to the EN dictionary value instead of rendering a raw key or empty string
