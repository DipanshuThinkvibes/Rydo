# Overview

## What
RYDO is a multi-tenant SaaS transportation platform that the owner's company will sell to IT companies, enterprises, schools and colleges. One platform, three product modules:
- **RYDO Share** - employee carpooling (verified employee drivers publish rides, riders book seats, cost sharing).
- **RYDO Enterprise** - company-run employee transport (shifts, routes, own/vendor fleet, trip assignment, monitoring).
- **RYDO Campus** - school/college buses (routes, stops, students, parent tracking).

## Must-haves (from the master prompt)
- Mobile app (Android + iOS) AND responsive web app from day one, one shared backend and database.
- Reliable background GPS tracking during authorized trips, validated on physical devices.
- Strict tenant isolation and role-based access (Super Admin, Support, Org Admin, HR, Transport Manager, School Admin, Fleet/Vendor Manager, Employee, Rider, Driver, Student, Parent).
- Free-first development; scale to paid services only when needed.
- No code until architecture, MVP and roadmap are reviewed; go phase by phase with review gates.

## Who it's for
Customer organizations (tenants) and their employees, drivers, students and parents. Owner: the user (Maalik); product is a company product, not a client project.

## Definition of done (MVP)
Platform core + one full module (proposed: Share inside one enterprise tenant) on mobile and web, piloted for 4 weeks with one real organization with no data-isolation or tracking-gap incidents.

## Source documents (docs/source/)
- 5 earlier Rydo .docx files (single-company carpool scope, Express/Sequelize blueprint) - now superseded in scope but their carpool rules still apply to RYDO Share.
- Master prompt: docs/source/RYDO_Master_Product_Architecture_Prompt.md (current source of truth for scope).
- Architecture proposal doc (Claude Docs): https://claude.ai/artifact/1y2sJ5bCMaV2jnE9cFsjGx

## Repository
GitHub: https://github.com/karanjain-tv/TV-RYDO (private), branch main. Local: C:\Users\Karan Jain\Downloads\RYDO Project.

