# FeedbackOps Documentation Index

This directory indexes the product, implementation, and operator documentation.

## Reading As An Operator

`USER-MANUAL.md` documents the shipped product organised by task ("I need to
triage what came in", "I need permission I do not have"). It describes behaviour,
not intent — for why a behaviour is what it is, follow it into `docs/adr/`.
The [interactive Korean user guide](user-guide/index.html) adds annotated screenshots and a visual walkthrough.

## Reading For Implementation

Root `AGENTS.md` → "Required Reading" and "Source Of Truth" decide what to read for a given change.

## What Lives Where

- [Product design, requirements, and roadmap](design/), with its [folder index](design/README.md).
- [Architectural decisions](adr/), indexed in [adr/README.md](adr/README.md).
- [Implementation architecture and contracts](implementation/), including [per-domain API contracts](implementation/api/) and the [implementation index](implementation/README.md).
- [Frontend UI contracts](frontend/), with the [folder index](frontend/README.md).
- [Approved technology stack](tech-stack/).
- [Original design prototype](design-prototype/), retained as a reference for surfaces not yet built; shipped UI remains authoritative (ADR-0060 and root `AGENTS.md` → UI Authority).
- [Agent and issue-tracker guidance](agents/).
- [Operator manual](USER-MANUAL.md) and [interactive Korean user guide](user-guide/), with the [guide index](user-guide/README.md).
- [Production images and local OIDC check](implementation/release/oidc-and-images.md): image smoke, OIDC walkthrough, company IdP and Kubernetes settings.
- [Code index](code-index.md) maps backend modules, frontend features, and shared packages.
- [Domain vocabulary and stable invariants](../CONTEXT.md).

Conflict resolution lives in root `AGENTS.md` → "Source Of Truth" (authority by subject + tiebreaks); this file only describes what each `docs/` directory contains.

## Product Invariants

The product invariants live in root `AGENTS.md` → "Product Invariants".
