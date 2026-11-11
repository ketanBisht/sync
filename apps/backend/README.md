# apps/backend

**Reserved for Phase 4 — NestJS Backend Implementation**

This directory will contain the SYNC NestJS backend application.

## Planned Stack
- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **API**: REST

## Responsibilities (Phase 4)
- Receive incident and message uploads from online devices
- Provide a consolidated view of all incidents across devices
- Handle conflict resolution at the server level
- Push verified incident data back to syncing devices
- Incident verification and duplicate detection

## Development Notes
- The backend is **not** required for core SYNC functionality.
- The mobile application operates fully offline without the backend.
- Backend integration is initiated by the device's sync service when internet connectivity is detected.

