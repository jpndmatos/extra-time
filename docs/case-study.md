# Touchline: a personal football goal room

![Actual goal playback in Touchline](goal-room-live.png)

Touchline brings recent r/soccer goal clips, favourite clubs and match fixtures into one local application. The main interaction is selecting a goal and watching it without leaving the feed.

## Design decisions

- A three-column workbench keeps the goal queue, video and fixtures in view. On phones, the player opens from the queue and fixtures move into a keyboard-accessible drawer.
- Club names and official crests identify each side. Scores, goal minute, scorer and posting time support quick scanning.
- Manual imports are secondary. Technical setup and playback guidance use native disclosures so they remain available without dominating the viewing screen.
- Player recovery controls sit below the footage. Failed native clips refresh their publisher URL once, then try distinct mirrors of the same goal. Embedded players also offer a manual source switch because their internal playback errors may be inaccessible.
- The existing warm dark palette, restrained orange selection and serif wordmark stay consistent across viewing, team selection and Sources. Controls retain visible keyboard focus and reduced-motion support.

## Implementation

ASP.NET Core supplies typed fixture, clip and preference endpoints. SQLite persists follows and manually added links. Shared provider caches limit upstream requests; server-sent events deliver changed snapshots without dashboard polling. React preserves the selected player as other goals arrive.

Clip metadata requests use host allowlists, bounded redirects, response limits and deadlines. Secrets stay on the server. Videos stream from their publishers; the app does not download or rehost footage. Source attribution and original threads remain accessible.

## Validation

The project has 47 backend tests and seven frontend tests. Browser checks cover 320–1920px layouts, favourites, spoiler reveal, persistence, offline recovery and uninterrupted playback during live updates. Controlled failures verify missing videos, stalls, expired metadata, mirror selection and exhausted-source retries. Desktop and mobile accessibility checks use axe.

The Hallmark redesign sweep captured all three screens at desktop and phone sizes. It finished with zero Floor failures and zero unresolved Reflex findings, retaining all recorded links, fields and handlers. The screenshot above was captured only after actual native video playback began; sample mode contains no footage.

## Practical limits

Touchline is a single-user local project. Football-data free-plan scores can be delayed. Reddit's public RSS connection ends on 13 November 2026; long-term automatic discovery needs a supported replacement. Third-party clip availability cannot be guaranteed. These limits appear in the application and are not disguised as live coverage or permanent access.
