# RYDO — Master Product, Architecture & Development Prompt
## Multi-Tenant Transportation Management, Ride-Sharing and Live Tracking Platform

### 1. Your Role

Act as a Senior Solution Architect, Product Manager, Mobile Application Architect, Web Application Architect, Database Architect, UI/UX Designer, and Full-Stack Technical Lead.

I am starting a new software product called **RYDO**, which our company intends to sell to IT companies, enterprises, schools, colleges, and other organizations.

Help me transform this business idea into a secure, scalable, maintainable, and commercially viable SaaS platform.

I need your guidance on product requirements, mobile and web architecture, database design, technology selection, user roles, security, live GPS tracking, development tools, testing, and deployment.

Do not start coding immediately. First understand the business, recommend the architecture, define the MVP, and establish the development roadmap.

### 2. Mandatory Application Requirements

**RYDO must have both a mobile application and a web application from the beginning. Both are part of the initial product scope.**

We are not building a web-only prototype and planning to add mobile later. Mobile and web development must be considered together during architecture and database design.

#### A. Mobile Application

The mobile application must support Android and iOS, using a shared codebase where practical.

Evaluate React Native with Expo and Flutter, then recommend the best option based on our requirements.

The mobile app should support:

- Registration and login.
- User profiles and organization membership.
- Driver and vehicle document submission.
- Driver verification status.
- Ride creation and ride discovery.
- Pickup and drop-off selection.
- Ride booking, acceptance, rejection, and cancellation.
- Trip details and status.
- GPS location sharing during authorized active trips.
- Live vehicle tracking on a map.
- Push notifications.
- Trip history.
- Appropriate role-specific interfaces for drivers, riders, students, and parents.
- Reliable handling of network loss, app backgrounding, and location permissions.

The mobile app should adapt its interface and permissions to the user's role.

For example, drivers need trip management and GPS tracking, riders need ride discovery and booking, and parents need access to their authorized children's bus tracking information.

Not every role needs every feature. Define the appropriate screens and permissions for each role.

**Critical requirement:** Reliable background GPS tracking must be evaluated for Android and iOS. Do not assume that a standard web application or a basic Expo configuration can provide production-grade tracking when a phone is locked or the app is in the background. Identify the required native permissions, platform restrictions, testing requirements, and any additional development configuration.

#### B. Web Application

Build a responsive web application for desktop and mobile browsers.

The web application will primarily serve organization administrators, HR teams, transportation managers, school administrators, and RYDO platform administrators.

Required capabilities include:

- RYDO Super Admin dashboard.
- Organization registration and onboarding.
- Organization configuration and branding.
- User, employee, and student management.
- HR approval of eligible riders.
- Driver and vehicle verification.
- Driver document and vehicle RC management.
- Routes, stops, schedules, and fleet management.
- Employee ride-booking management.
- School and college bus management.
- Live vehicle tracking dashboard.
- Trip assignments and monitoring.
- Booking and trip history.
- Notifications and alerts.
- Reports, analytics, and audit logs.
- Subscription and tenant management.
- Role and permission management.

The web application must provide different dashboards according to the user's permissions.

For example, a school administrator should manage buses and students, while a corporate HR administrator should manage employees and transportation eligibility.

### 3. Business Scenarios

#### Scenario 1: RYDO Share — Carpooling

A driver travels from Location A to Location B. A rider lives at Location C, which is close to the driver's route.

The driver publishes a ride, specifies the available seats and proposed fare or contribution, and the rider searches for compatible journeys.

RYDO should support:

1. Driver registration and verification.
2. Vehicle registration and approval.
3. Ride publishing from the mobile app.
4. Ride discovery and route matching.
5. Booking and seat allocation.
6. Driver acceptance where required.
7. Trip status updates.
8. Authorized live location tracking.
9. Cancellation and no-show management.
10. Ratings and ride history.

The driver should be able to manage the journey from the mobile app. Riders should be able to discover and book rides through the mobile app and, where appropriate, the web application.

Evaluate the legal and operational differences between cost-sharing carpooling and commercial passenger transportation.

#### Scenario 2: RYDO Enterprise — Employee Transportation

An IT company or enterprise purchases RYDO to manage transportation for its employees.

The organization configures its tenant, invites employees, and authorizes eligible users.

HR approves rider eligibility. Drivers and vehicles are separately verified. The transport team manages shifts, routes, recurring bookings, assignments, and active trips.

The company may use its own vehicles, third-party vendors, contracted drivers, or other approved transportation arrangements.

Employees can use the mobile app to view their rides and track assigned vehicles. Transport managers use the web dashboard to monitor operations.

The company pays for company-sponsored rides according to its transportation policy. Employees should not be charged personally unless an approved policy explicitly requires it.

#### Scenario 3: RYDO Campus — School and College Transportation

Schools and colleges register buses, drivers, routes, stops, and schedules.

Students are assigned to authorized pickup points. Parents receive access to the relevant student's transportation information.

Drivers use the mobile app to start trips and share authorized GPS updates. Parents and students can view the bus location, route progress, and estimated arrival time when available.

School administrators use the web application to manage routes, buses, drivers, student assignments, and active trips.

Evaluate optional features such as boarding confirmation, drop-off confirmation, emergency alerts, and attendance integration.

Student safety, parental authorization, and restrictions on location visibility are mandatory design considerations.

### 4. User Roles

Design a centralized role-based access control system covering:

**Platform roles**
- RYDO Super Admin.
- RYDO Support Administrator.

**Organization roles**
- Organization Owner/Admin.
- HR Administrator.
- Transport Manager.
- School/College Administrator.
- Fleet or Vendor Manager.

**End-user roles**
- Employee.
- Rider.
- Driver.
- Student.
- Parent/Guardian.

A user may have multiple roles when authorized. For example, an employee can also be a verified carpool driver.

Define the responsibilities, permissions, application access, and data visibility for each role.

### 5. Shared Backend for Mobile and Web

The mobile application and web application must use a common backend and a consistent data model.

Do not build independent backends or separate databases for mobile and web unless there is a compelling architectural reason.

The architecture should look conceptually like this:

```text
Mobile Application (Android/iOS) ─┐
                                  ├── Shared Backend/API ── Database
Web Application ─────────────────┘           │
                                             ├── Authentication
                                             ├── Real-Time Tracking
                                             ├── Maps and Routing
                                             ├── Notifications
                                             └── Document Storage
```

This is a conceptual diagram. Refine it into a detailed architecture based on the final technology selection.

The shared backend must ensure that:
- Both applications use consistent business rules.
- Role-based authorization is enforced server-side.
- Tenant boundaries are respected.
- Location updates are validated.
- Booking and seat-allocation operations are consistent.
- Sensitive documents are protected.
- Application versions can evolve without breaking existing clients.

### 6. Technology Stack Evaluation

Compare at least two realistic technology stacks before making a recommendation.

Evaluate the following options.

**Mobile**
- React Native with Expo.
- Flutter.

**Web**
- React with TypeScript.
- Next.js with TypeScript.

**Backend**
- Node.js with NestJS or Express.
- Python with FastAPI or Django.
- Supabase-managed backend capabilities where suitable.

**Database**
- PostgreSQL.
- PostGIS for geospatial operations.
- Supabase as a possible managed PostgreSQL platform.

**Real-time**
- WebSockets.
- Supabase Realtime.
- Other managed real-time services if justified.

**Maps and routing**
- Google Maps Platform.
- Mapbox.
- OpenStreetMap-based services.

**Supporting services**
- Authentication.
- Document storage.
- Push notifications.
- Email notifications.
- Logging and monitoring.
- CI/CD.
- Hosting for web and backend.
- Mobile app builds and distribution.

Recommend a stack that supports both mobile and web development efficiently without compromising security or future scalability.

For every selected technology, explain:
1. Why it is suitable.
2. What it will be responsible for.
3. Whether it can be used free during development.
4. What its free-tier limitations are.
5. What may require payment.
6. How it can scale in production.
7. Any relevant migration or vendor-lock-in risks.

Verify current pricing and free-tier restrictions when necessary. Do not promise that third-party services will remain free.

### 7. Proposed Initial Architecture

Evaluate this candidate stack:

| Layer | Candidate technology | Responsibility |
|---|---|---|
| Mobile app | React Native + Expo | Android/iOS user experiences and driver location tracking |
| Web app | Next.js + TypeScript | Organization portals and administration dashboards |
| UI styling | Tailwind CSS or a suitable component system | Consistent, responsive interfaces |
| Backend | Supabase and/or a dedicated API built with NestJS | Shared business logic, authorization, and integrations |
| Database | PostgreSQL + PostGIS | Core data and geospatial queries |
| Authentication | Supabase Auth or equivalent | Identity and session management |
| Real-time | Supabase Realtime or WebSockets | Authorized live trip updates |
| Maps | Google Maps Platform or Mapbox | Map rendering, routing, and ETA capabilities |
| Document storage | Protected object storage | Driver licences, vehicle RCs, and verification documents |
| Version control | Git + GitHub | Source control and collaboration |

This is a proposed stack to evaluate, not a fixed requirement.

Explain whether a dedicated backend API is necessary from the beginning or whether managed backend functions are sufficient for the MVP.

Avoid introducing unnecessary infrastructure, microservices, or complexity at the initial stage.

### 8. Database and Multi-Tenant Design

Design a shared database model that supports multiple organizations while maintaining strict data isolation.

Evaluate entities such as:

- organizations
- organization_memberships
- users
- roles and permissions
- drivers
- driver_documents
- vehicles
- vehicle_documents
- verification_requests
- rides
- ride_stops
- ride_bookings
- routes
- route_stops
- scheduled_trips
- trip_assignments
- trip_events
- vehicle_locations
- students
- parent_guardian_relationships
- student_route_assignments
- notifications
- payments
- subscriptions
- audit_logs

Refine this list into a normalized schema.

Clearly distinguish recurring routes, scheduled journeys, individual trip instances, and carpool rides.

For every important entity, define its relationships, tenant ownership, indexes, access-control rules, and retention requirements.

Use PostGIS where it provides practical value for pickup proximity, route matching, and geographic searches.

### 9. Live GPS Tracking

Design the live tracking system for mobile drivers and authorized viewers on both mobile and web.

The expected flow is:

1. A verified driver signs in to the mobile application.
2. The driver starts an authorized trip.
3. The mobile app obtains location permission.
4. Location updates are transmitted securely at an appropriate interval.
5. The backend validates the driver, assigned trip, timestamp, and authorization.
6. The latest vehicle location is made available to authorized viewers.
7. Riders, parents, and transport managers see updates in the relevant application.
8. The system handles stale locations, network disconnections, inaccurate GPS readings, and reconnection.
9. ETA calculations and notifications run where appropriate.
10. Location sharing ends according to the trip lifecycle and applicable policy.

Define separate tracking behavior for:
- Foreground operation.
- Background operation.
- Screen-locked operation.
- Poor network connectivity.
- App termination or operating-system restrictions.

Explain battery consumption, update intervals, data costs, location retention, and permission requirements.

Do not claim production-grade background tracking without validating the implementation on physical Android and iOS devices.

### 10. Free-First Development Environment

Initially, I want to minimize infrastructure expenses.

Recommend a practical setup using free local development tools and appropriate free service tiers.

Include:
- Visual Studio Code.
- Git and GitHub.
- Node.js and the relevant package manager.
- Android Studio or equivalent Android testing tools.
- iOS build and testing requirements, including the limitations of Windows-based development.
- Local database development with PostgreSQL/PostGIS where appropriate.
- Supabase or an equivalent backend.
- Local and hosted document storage.
- Maps development options.
- Push notification development and testing.
- Frontend and backend hosting.
- Mobile development builds and device testing.

Separate the environment into:

1. Local development.
2. Hosted prototype.
3. Pilot with real users.
4. Production deployment.

Identify all potential billing triggers, particularly for maps, routing, background location infrastructure, storage, notifications, and hosted services.

Do not assume that every feature can be tested reliably using only a free hosted environment.

### 11. MVP Development Roadmap

Build mobile and web capabilities together in coordinated milestones.

**Phase 0 — Product discovery**
- Finalize business requirements.
- Confirm user roles.
- Select technology stack.
- Identify legal, privacy, and security requirements.

**Phase 1 — Foundation**
- Create the mobile and web projects.
- Set up GitHub and development environments.
- Configure the shared backend and database.
- Implement authentication, profiles, and organization membership.
- Establish tenant isolation and role-based access.

**Phase 2 — Verification**
- Implement rider eligibility approvals.
- Build driver and vehicle registration.
- Implement document upload and verification workflows.
- Build the corresponding mobile and web screens.

**Phase 3 — Ride management**
- Implement ride creation and discovery.
- Add route and pickup matching.
- Implement booking, acceptance, cancellation, and seat management.
- Add trip lifecycle and history.

**Phase 4 — Live tracking**
- Implement driver GPS tracking.
- Build the live tracking map for mobile and web.
- Add trip status updates, location freshness indicators, and appropriate notifications.
- Validate background tracking on physical devices.

**Phase 5 — Enterprise transportation**
- Add employee eligibility, transport scheduling, fleet assignment, and administrative reporting.

**Phase 6 — School and college transportation**
- Add student assignments, parent access, bus schedules, and authorized bus tracking.

**Phase 7 — Testing and pilot**
- Test tenant isolation, authorization, GPS reliability, device compatibility, performance, and security.
- Run a limited pilot with a suitable organization.

**Phase 8 — Production readiness**
- Deploy the services.
- Configure backups, monitoring, incident handling, and support.
- Review operational costs and scalability.
- Prepare the commercial onboarding process.

For each phase, define deliverables, dependencies, acceptance criteria, and testing requirements.

### 12. UX and Design Requirements

Both applications should look and feel like parts of the same professional product.

Establish a consistent design system, including typography, colors, spacing, buttons, forms, navigation, and feedback states.

The mobile application should prioritize quick actions, map visibility, accessibility, and usability while traveling.

The web application should prioritize efficient administration, data tables, filters, reporting, operational dashboards, and map-based monitoring.

Include loading, empty, error, offline, permission-denied, and stale-location states.

Keep the design clean, modern, professional, responsive, and suitable for enterprise customers.

### 13. First Response Requirements

For your first response, do not generate code.

Provide:

1. Your understanding of the complete RYDO concept.
2. The mobile and web application responsibilities.
3. A role-by-role application access matrix.
4. A comparison of three suitable technology stacks.
5. The recommended shared backend architecture.
6. An editable system architecture diagram.
7. A proposed database model.
8. An MVP feature list.
9. A free-first development and testing plan for mobile and web.
10. A coordinated mobile and web development roadmap.
11. Technical, security, privacy, and commercial risks.
12. A prioritized list of questions that need answers before implementation.

**Final objective:** Build RYDO as one multi-tenant SaaS platform with a shared backend, a mobile application for Android and iOS, and a web application for administration and transportation operations. Start with a practical free-first development environment, validate the product with real workflows, and scale to production when required.

Guide me step by step and do not begin the next major implementation phase until the preceding decisions and deliverables have been reviewed.
