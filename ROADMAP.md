# Roadmap

What's still to do on KH Royals, and who owns each item. Build and setup steps
are in [DEVELOPING.md](DEVELOPING.md).

**How to use it**

- **Claim an item:** put your name in **Owner** and commit. Leave Owner as `—` if
  nobody has it yet.
- **Status:** `Not started`, `In progress`, `Blocked: <on what>`,
  `Waiting on <who>`, `Needs a decision` or `Recurring`.
- **Finished:** delete the row in the commit that finishes it; git history keeps
  the record. If it's something people will use, add a line to
  [Already built](#already-built).
- **New item:** add a row in the right phase. Keep Notes to a line and link to
  DEVELOPING.md for the steps.
- Everyone pushes to `main`, so pull first and only change the rows you're
  working on; that keeps merge conflicts rare.

## Phases

The work follows the program timeline: build for the school's RFI, present for
approval, integrate with the school, field a beta, then release. Approval is the
gate: Phase 1 needs only Ben, and everything that depends on the school's systems,
documents or accounts waits for Phase 2.

1. **[RFI development](#phase-1--rfi-development)** — the app as presented
2. **[Full integration](#phase-2--full-integration)** — starts at approval; connects the school's systems
3. **[Beta fielding](#phase-3--beta-fielding)** — a group of families and staff use it
4. **[Full release](#phase-4--full-release)** — the app stores, for every family
5. **[Future features and bug fixes](#phase-5--future-features-and-bug-fixes)** — ongoing

## WCA setup

Westminster Christian Academy's app (`schools/wca`, built from this codebase with `SCHOOL=wca`; the old
RoyalRockinApps/wca repo is no longer used). Its Supabase project (`nnbhslmvgabygvhugqfm`, separate account)
has every migration; nobody has an account yet.

| Item | Owner | Status | Needs | Notes |
|---|---|---|---|---|
| WCA's first director | — | Not started | Who runs WCA's app | They sign in once, then `SCHOOL=wca SUPABASE_ACCESS_TOKEN=… node scripts/supabase_setup.mjs --director=<email>` (DEVELOPING §5). |
| WCA sign-in and email | — | Not started | WCA's own email (SMTP), Google/Apple sign-in, a Resend key | Same steps as Kingdom Heights (DEVELOPING §5) on WCA's project; free Supabase email sends a link, not a code, and only a few an hour. |
| School calendar | — | Not started | WCA's 2026–27 calendar | `schools/wca/content/site/calendar.json` is empty; the office can add dates in the app. |
| Dress code on the Planner | — | Not started | WCA's uniform guide | Fill `schools/wca/uniform.ts` (and pictures in `uniformImages.ts`) like Kingdom Heights'. |
| Family handbook | — | Not started | The handbook PDF | `SCHOOL=wca swift scripts/import_handbook.swift <pdf>`, then list its sections in `schools/wca/handbookOutline.ts`; the Handbook tile appears once it has pages. |
| Car line spot and traffic map | — | Not started | Which campus and where cars line up | The pickup zone starts at the Lower Campus (375 Mt. Zion Rd.); car line leads move it in the app. Add a traffic map in `schools/wca/carline.ts` / `carlineMap.ts`. |
| Newsletter | — | Not started | What WCA sends families | WCA News imports Smore newsletters; adjust if WCA uses something else. |
| App store accounts and push | — | Not started | WCA's Apple and Google accounts | Its own listings (`org.wcahsv.app`); same steps as Kingdom Heights (DEVELOPING §7, §9 with `SCHOOL=wca`). |

## Phase 1 — RFI development

What the presentation should show. All of it can be built and demoed without the
school. Build in table order: the tutorial comes last so it can show each user type
only the apps they'll have.

| Item | Owner | Status | Notes |
|---|---|---|---|
| Views and app availability by user type | Ben | In progress | Set which apps and home view each user type gets (parent, student, teacher, staff, admin, family). Done: every user type has its tiles (`src/appTiles.ts`): students see Student, Calendar, News, Activities, Handbook, Ask the Teacher and Assignments; staff get the Standard / Staff switch; Family accounts and substitutes see only their apps. Left: a final review, then close. |
| Chat look and feel | Ben | Not started | Texting-style Group Chat: bubbles (yours on the right), newest at the bottom, sender and time grouped. Same style for Volunteer chat. Today messages are cards like board posts. Prompt if team agrees on path forward "In the Connect Tab within a Group, the chat feature should start with a card at the top with the title and a short summary of what the group is about along with a graphic. The texting style for Group Chat should have bubbles for each response with the User's bubble being a different color and on the right. Newest should be at the bottom. Sender and time grouped. Same style as the Volunteer chat."|
| App tutorial | Ben | Not started | Walkthrough that highlights each feature with a one-sentence explanation and Next and Back buttons. |
| Proposal package | Ben | Not started | What it costs to run and who supports it: Apple Developer ($99/year), Google Play ($25 one-time), a paid Supabase plan, a possible FACTS API fee, hosting and post-launch support. |

## Phase 2 — Full integration

Starts at approval. Most items need the school's systems, documents or sign-off.
The first three come first: the agreement, the school's developer accounts (slow to
set up) and a private repo. Do the data review before FACTS grades come into the app.

| Item | Owner | Status | What's needed from the school | Notes |
|---|---|---|---|---|
| Agreement and ownership | Ben | Not started | Agreement on who owns the code and data, a data-privacy agreement and support terms | Settle first, at approval. |
| School-owned developer accounts | — | Not started | Apple Developer enrollment as an organization (needs a D-U-N-S number, which can take a couple of weeks) and a Google Play account | Start right away: TestFlight and push notifications depend on it. |
| Make the repo private | Ben | Not started | — | The repo is public today; fine for a prototype, not once it handles student data. |
| Student data review (FERPA/COPPA) | — | Not started | Approval of how student data is stored and shown | Gate for the FACTS grades work. Include Ask the Teacher: students and teachers message each other, and parents and admins with Student messages can read it. Also My students: teachers see which of their class students are signed up for each activity. And critical alert answers: staff's location (GPS and Wi-Fi access point), with their consent, seen by alert senders and erased 30 days after the alert. |
| FACTS SIS API integration (read-only) | Ben | Not started | A read-only API key from someone with FACTS admin rights (People, Academics, Gradebook: Read; Admissions, Billing: None) | Also needs a vendor subscription key from FACTS. Nightly roster sync (including class sections and their teachers, which Ask the Teacher and Assignments use) plus grades, report cards and schedules in the Student app; keys stay on the server. The Student app's side is built: the `sis_*` tables, `student_record` / `student_course`, and `sis_import` (service role), which takes one shape whatever the system. What's left is the connector: an Edge Function holding the FACTS keys that reads students, attendance and gradebook nightly and calls `sis_import` (check its `unmatched` list). Real grades wait for the student data review. |
| Family onboarding | Ben | Not started | Which enrollment form new families fill in (online in FACTS or on paper), the FACTS API keys, and when invitations go out | The app keeps a list of expected families (parent emails with their children); a parent's first sign-in with that email approves them and links their children, with no approval wait or family request. New families come from a nightly FACTS check for newly enrolled students and their parents (confirm FACTS's API gives enrollment status and parent emails; until then the office uploads a FACTS export). Trigger on enrollment, not acceptance. The office reviews and sends invitations in batches (at orientation, say), or one family's for a mid-year transfer. Invitations should come from the school's address (Email from the school's address); Apple's Hide My Email won't match. |
| Ticket payments and Wallet passes | — | Waiting on the school | The school's Stripe account (or how its billing service, likely FACTS, takes card payments), an Apple Pass Type ID certificate, and a Google Wallet issuer account | The app is built and sells free tickets now; each part switches on when its keys are added as function secrets (DEVELOPING.md → Event tickets). If the school would rather bill tickets through FACTS, the `tickets` function's checkout is the one piece to swap. |
| Blackbaud integration | — | Needs a decision | Which Blackbaud product the school uses (Raiser's Edge NXT for donors, or Blackbaud's school suite) and what it should send to the app | The school's student system is FACTS, so Blackbaud is likely fundraising. Its SKY API has webhooks (e.g. a new gift), so it can push to us; the app would add an Edge Function that receives them and posts a notification or updates a page. Nothing built yet. |
| Class sections on live | — | Not started | Each class's teacher and students | Set them up in Admin portal → Classes (or from FACTS). Until then students see no teachers in Ask the Teacher and get no class assignments. |
| Email from the school's address | — | Not started | DNS access for khroyals.com | Sign-in and app email already go through Resend's SMTP (6-digit code, up to 60 an hour), but from keytrainlearning.com; verify khroyals.com in Resend and switch the sender. |
| Push notifications on iPhone and Android | — | Not started | Which Apple and Google accounts the app is published under | Expo project + Apple push key; Firebase project and `google-services.json` for Android ([DEVELOPING §7](DEVELOPING.md#7-push-notifications)). Until then notifications only show on the bell page, and critical alerts only when the app is open. |
| Alert map access points | — | Waiting on the school | IT's list of Wi-Fi access points (BSSID/MAC) and the room or area each is in | Paste it in Alerts → Alert map, or walk the building with a phone (Use this phone's access point). Until then alert answers show GPS only. Also confirm how long locations are kept (30 days after the all clear today; `alert_location_days`). |
| Review critical alert templates | — | Not started | The school's safety plan and sign-off on wording | Lockdown, severe weather and hold-in-place templates (`src/alerts/kinds.ts`). |
| Critical Alerts entitlement | Ben | Not started | A school safety use case for Apple's request | Alerts arrive as Time Sensitive now; Apple's approval lets them ring on silent ([DEVELOPING §10](DEVELOPING.md#10-critical-alerts-loud-on-staff-phones)). |
| Secure web interface for elevated users | Ben | Not started | Security requirements, e.g. whether staff sign in with school Google or Microsoft accounts | Dedicated admin and faculty portal; candidates include separate hosting, session timeouts, SSO and login monitoring. |
| Edit site pages and news from the admin portal | — | Not started | Who on staff will maintain content | Site content is re-imported from khroyals.com today ([DEVELOPING §6](DEVELOPING.md#6-refresh-the-school-website-content)). |
| Confirm Planner tab contents | Ben | Not started | Hours, lunch, key contacts and how "report an issue" is handled | Anything the school wants added to the Planner. |
| Form fees (payment provider) | — | Not started | The school's payment account (e.g. Stripe) and who reconciles payments with the office | Parents pay a form's fee (a field trip, say) in the app when they sign. Fees and payments recorded by the sender are already built (`form_payments`); this adds paying online and recording it automatically. |
| Legal check on release forms | — | Not started | The school's lawyer's OK on typed-name signatures for liability releases | Typed-name signatures with a timestamp are common for permission slips; releases may need more. |
| Production setup | Ben | Not started | — | Paid Supabase plan (the free plan has no automatic backups), separate test and live environments, crash reporting (none today). |
| Load test at car line time | Ben | Not started | — | Every parent uses the app in the same 15-minute window; check the live board and check-ins against Supabase's realtime connection limits. |
| Accessibility review | — | Not started | Whether the school is held to a specific standard (often WCAG) | Screen reader support, text sizes, contrast. |
| Real data load | Ben | Not started | Family and roster data (via FACTS) and the car line entrance location | Assign pickup numbers; move the car line geofence from the street address to the actual entrance. |

## Phase 3 — Beta fielding

Gets test builds onto beta testers' phones and makes new builds quick to ship as
feedback comes in.

| Item | Owner | Status | Notes |
|---|---|---|---|
| Google Play release signing | — | Not started | The APK uses the development key; needs an upload keystore or EAS Build, then a Play testing track. |
| Build the iPhone app in CI | — | Not started | GitHub Actions builds Android only; iPhone builds are made on a Mac. |
| Check the app on iPhone Duo | — | Not started | The inner display runs it in both orientations (iPhone Duo ignores the portrait lock), and the app resizes as it folds. Built for it but never seen: needs an iPhone Duo simulator (not in Xcode 27.0) or a device. |
| Penetration testing | — | Not started | Must pass before Full release. Run on the integrated beta build: phone apps, admin web portal, database permissions and API functions, sign-in, and the FACTS connection. Fix and retest any findings before Phase 4. |
| Switch on Google and Apple sign-in | Ben | Not started | Built and hidden until switched on: create the Google OAuth client and turn on the Apple and Google providers in Supabase ([DEVELOPING §5](DEVELOPING.md#google-and-apple-sign-in)). Then try both on an iPhone and Android, including an existing account (it should land in the same account) and Apple's Hide My Email. |
| Beta plan | Ben | Not started | Who's in the beta, how testers send feedback (the Feedback app is built; give someone the IT role to triage), and what has to be true to go ahead with release. |

## Phase 4 — Full release

Starts once penetration testing has passed. Cleans out everything used for testing
and publishes the app to every family.

| Item | Owner | Status | Notes |
|---|---|---|---|
| Remove test data from live | — | Not started | Ben's test family (two test children linked to his account), the sample Soccer and Volleyball seasons and schedule, and the "Test Leader" account (no login) with its four Volunteer opportunities. The presentation data comes out with `node scripts/presentation_data.mjs --parent <email> --remove`. Also decide whether Ben's account stays a director (made Admin + director on Oct 21, 2026 to test the staff view). |
| Publish to the App Store and Google Play | Ben | Not started | Privacy policy URL, Apple’s privacy labels, store listings and screenshots (iPad screenshots too, since the app runs on iPad); allow time for App Store review, then public release. Public or unlisted is an open decision (below). |
| App Review sign-in | Ben | Needs a decision | Apple's reviewer must be able to sign in, but sign-in is by emailed code and they can't read our email. Needs a review account (approved, no admin powers) with a safe way in that doesn't bring back passwords or demo logins for everyone else, plus reviewer notes on what to try. |
| Staff training and parent rollout | — | Not started | A short guide, an announcement to families and a support contact. |

## Phase 5 — Future features and bug fixes

Ongoing after release; bugs reported in beta and after release go here too.

| Item | Owner | Status | Notes |
|---|---|---|---|
| CarPlay | Ben | Waiting on Apple | Built; needs Apple's CarPlay entitlement and a first look at the car screen in the simulator ([DEVELOPING §8](DEVELOPING.md#8-carplay)). |
| File and photo attachments in Connect posts | — | Not started | The storage bucket and "attach files" permission exist, but the app has no upload button. |
| Better graphics for the car line's festive touches | Ben | Not started | The big screen's holiday and break scenes (`src/carline/SeasonScene.tsx`) are built from emoji piles and pop-out emoji characters, which look a little different on each TV and computer. Replace them with custom artwork: drawn piles and characters for each break and holiday, matched to the school's look. |
| Pickup display for kids lining up inside | — | Not started | A screen inside the school per child: red (no one coming), yellow (their pickup is on the way: inside a wider radius around school, e.g. on Holmes Ave), green (in line). Yellow needs a second, larger geofence next to automatic check-in's; like it, it works with the app closed only with "Always" location. |
| "Evaluate" flag for custody concerns | — | Not started | The office flags a child; staff must confirm and sign off on who they release that child to, in the car line and at check-out. |
| QR check at release | — | Not started | Staff scan a QR code from the adult's app to confirm they're on the child's pickup list; who and when is kept on the child's record. |
| Employee time tracking | — | Not started | Teachers and staff already check in and out at school on their Planner (On-Site Attendance). Left: clocking in automatically on campus (a geofence like the car line's), and hours reports; needs the school's rules for hours and who sees them. |
| Tuition calculator | — | Not started | Links to the website's widget instead of running in the app. |
| Notification switches for Activities and Ask the School | — | Needs a decision | My profile has switches for groups, replies, Marketplace, Volunteer and school announcements; these two can only be held back by quiet hours. |
| Yearly upkeep | — | Recurring | Load the new school calendar (typed in by hand from the PDF), update the handbook, check the July 1 grade rollover, upgrade Expo once a year for new iOS and Android versions. |
| Ticket refunds in the app | — | Not started | Today a refund is made in Stripe's dashboard and the ticket stays valid in the app; let leaders refund (and void) a ticket or a whole cancelled event from *Sell tickets*. |

## Open decisions

- [ ] How do Apple's reviewers get in? The app opens only for approved accounts, so App Review (and
  Beta App Review for a new version) needs a working sign-in. They can't read an emailed code; options
  are a reviewer account the team watches and approves on request, or Sign in with Apple (once
  switched on) with the team approving the reviewer quickly. Decide before the next version's review.
- [ ] Public App Store listing, or Apple's unlisted distribution? Unlisted is a normal App Store
  app that only opens from a link the school shares (it doesn't show in search); it needs a request
  to Apple. Decide with the school before publishing (Phase 4).
- [ ] Add notification switches for Activities and Ask the School? (Phase 5)
- [ ] Should Family accounts see the F.A.Q.s? They're at the bottom of Ask the School
  (`src/questions/FaqSection.tsx`), and Family accounts don't get the Ask the School tile. Ask the School
  shows them the F.A.Q.s under its message, so a link elsewhere would do it without opening Ask the School.
- [ ] Ask FACTS how a developer gets a vendor subscription key for the SIS API, and
  what it costs ([FACTS partners](https://factsmgt.com/become-a-partner/)).
- [ ] Blackbaud: which product does the school use, and what should flow to the app (donation
  thank-yous, campaign progress, event registrations, alumni news)? And does Blackbaud already send
  those to families another way? Either way it would come into the app through Blackbaud's SKY API
  (needs a SKY developer account and the school's approval of the app in Blackbaud).
- [ ] Confirm who at the school has FACTS admin rights to generate the read-only
  API key.

## Already built

Working in the app and on the server today.

| Area | Feature | What it does |
|---|---|---|
| Accounts | Passwordless sign-in | Email a 6-digit code (10 min); new accounts wait for admin approval |
| Accounts | My profile | The Profile tab (in place of More; the top bar keeps only the bell): your photo and name, then a Settings-style menu for name and photo, children, vehicles, notifications and quiet hours, emergency alerts, About the school and feedback |
| Accounts | My children | Parents edit photo, bio, birthday, allergies, health notes; grades move up every July 1 |
| Accounts | Family accounts | Grandparents and relatives get car line, Volunteer, Activities; kept out of groups, Marketplace, Student, Ask the School |
| School site | Website content in-app | All 23 pages, 55 news posts, home page and videos imported from khroyals.com |
| School site | News | News articles (Apps → News) |
| School site | Calendar | 2026–27 dates, "Show past events" toggle, group calendars |
| School site | Share tab | A school pass with the shield in its QR code; share the app, website, calendar or latest Royal News; share, copy or save the pass as an image |
| School site | Handbook | The table of contents with each section folded until tapped; search opens and highlights every section it's in; works signed out |
| Royals Connect | Groups | Chat, Discussion Board, Announcements and Q&A styles, each action's "who can" set separately |
| Royals Connect | Moderation | Lock, approval queues, slow mode, quiet hours, mutes, pinning, audit log |
| Forms | Permission slips, releases and acknowledgments | Teachers send to their classes, coaches to their activities' sign-ups and the office to grades or the school; parents sign once per child (either parent counts), senders see who has signed and send reminders, and record fees paid |
| Forms | Excused Absence (Forms to Send to Office) | Parents report absent, late or leaving early with a reason from the Forms app; the office and teachers are told, see it on the roll and under Sent to the office, and the office marks it seen; parents attach a doctor's note (photo or PDF) that only they and the office open |
| Families | Lunch visits | Parents and linked family book a lunch time with their child after reading the allergy notes and rules; the office sets times, capacity and closed days; staff see who's coming |
| Admin portal | App usage | Which apps people open and how often (7, 30 or 90 days): active people today, this week and this month, by role and per day, and every app's people, opens and days used; counts only |
| Royal News | A/B tests | Two versions of the Planner's Royal News button, about half of people on each; counts who saw, opened and read to the end, and says when one is really ahead; started and stopped by staff with Send notifications. Built to reuse for other tests |
| Royal News | Write or paste an issue | Staff with Send notifications write an issue in the app or paste the newsletter's text, besides adding it from its Smore link |
| Royals Connect | Hide, archive, delete | Members hide a group from their own list; owners archive a group (gone for everyone else, restorable) and delete an archived one for good |
| Royals Connect | Auto-membership | Rules add people by role, grade, section, team or club, plus their guardians |
| Royals Connect | Post stats and following | Who saw each post, opens, reactions; follow a post for reply notifications |
| Car Line | Parent check-in | Check In with a location check, pickup numbers, saved vehicles (a button under Check In switches today's vehicle, even while in line), and the traffic flow map with each family’s line (blue for K2–K4, red for K–12th) |
| Car Line | Automatic check-in | Geofence checks children in on arrival; skips no-school days |
| Car Line | Duty board | Live board for staff, "Picked up" with Undo, daily pickup record |
| Car Line | Big-screen board | Staff open it on a TV or monitor (Big screen): every car that checked in today, live, with pickup number, child, vehicle and minutes waiting; yellow ripples spread from the Kingdom Heights shield when a car checks in; on a child's birthday a crown hangs off their name and a fanfare (confetti, trumpets, Happy Birthday card) plays when they're announced; the week before Thanksgiving, leaf piles fill the bottom corners and a turkey pops out to gobble for each car, the week before Christmas break, snow piles, falling snow and a snowman saying Merry Christmas; the weeks before Fall Break (acorns and a squirrel) and Spring Break (sand, shells and a crab); and holiday scenes the school day before and the day of Labor Day, Veterans Day, MLK Day, Valentine's Day, Presidents' Day, St. Patrick's Day, Easter, Mother's Day and Memorial Day; car line leads and the office switch any of these (and birthdays) off for every screen in Car line settings; picked-up rows grey out and drop below the line |
| Car Line | Pickup emails | Every parent is emailed who picked the child up, which staff member released them, and when (undo within a minute cancels it) |
| Car Line | Approved pickup people | Parents (or the office) let another account holder pick a child up, for today, until a date, or until removed; at most one mother and one father per child |
| Car Line | Pickup transfers | A parent hands a day's pickup (today or up to 60 days ahead) to another approved adult found by name; they accept or decline in their Car Line, and once accepted only they can check the child in until a parent cancels or they say they can't make it |
| Students | Check in & out | The front office checks students in when they arrive late and out when they leave early (Classes → Check a student in or out), with a reason, and only to someone on the child's pickup list; parents and the child's teachers are notified |
| Students | Class attendance | Teachers take roll for their classes (present, late, absent; mark the rest present), see the office's late arrivals and early check-outs on it and get a notification for each; the office sees every class's roll and can take it for a teacher who's out |
| Activities | Event tickets | Leaders sell tickets for an event (kinds, prices, limits, sales close); parents, staff and family pay by card, Apple Pay or Google Pay on Stripe's page; tickets in My Tickets with a QR code and Apple / Google Wallet; scanned at the door, once each |
| Students | Substitutes | Teachers (their classes) and the office (any class) schedule a Substitute or another teacher with days, hours and sub plans; only during those hours the sub takes the class's roll, sees the office's check-ins, reads the plans, runs field trip check-out, sees the car line board and gets critical alerts; otherwise a Substitute account is closed |
| Students | Event check-out | In Classes, below the classes: teachers, coaches and directors check each student out of a field trip, class event or Activities event to someone on their pickup list, and see who's still waiting before they leave; parents are notified |
| Accounts | Approved accounts only | The app opens on the Kingdom Heights welcome screen (Log in / Create account) and shows nothing else until an approved account signs in; new accounts wait there for the office, can add their name, and the app opens when they're approved |
| Accounts | Duplicate children | One record per child: same name and birthday is refused; likely matches (typos, nicknames, birthday, grade) are shown to the office, which links the parent to the existing child |
| Car Line | Car line settings | Spot, radius and hours set by leads and the office |
| Car Line | Android Auto | Car-screen status and "I'm here" button |
| Alerts | Location with answers | Staff agree once; answers then carry GPS and the Wi-Fi access point, placed on the Alert map (in Alerts) for senders, who tap a person to see it and open it in Maps; erased after the alert |
| Alerts | Critical alerts | Templates for weather, lockdown, hold; staff answer "I'm safe" / "I need help"; live roll call and all clear |
| Activities | Sports, theater, music, art, clubs | Seasons, schedules, follow, sign-ups with coach approval |
| Activities | Coaches add events and post volunteer help | Coaches and directors add events from the Activities home or their activity's page, and post opportunities and start events in Volunteer like Volunteer Leaders |
| Activities | Events and RSVPs | Countdown carousel, directions, Going / Not going, attendance for coaches, team photos |
| Marketplace | Buy and sell | Terms gate, photos, Dibs or Offer with one counter, deal card |
| Volunteer | Activities-style look | Banner art on every opportunity, details in section cards, and a clapping celebration on Say Yes! |
| Volunteer | Time slots | An opportunity can run at several times, each with its own spots, sign-ups and check-in; one card in the list, slots to pick on its page, and leaders add more later |
| Volunteer | Cover photos | Whoever posts an opportunity or starts an event puts their own photo on its card and page (and changes or removes it later); otherwise the card keeps its drawing |
| Volunteer | Opportunities, item requests and events | Leaders post, "Say Yes!" sign-ups with spot limits, item requests people pledge toward with quantity progress, chat per opportunity, events (Harvest Fest) holding their opportunities on one card, in the leader's order |
| Volunteer | Invites | Leaders invite people by name (with a note) to help with an opportunity, or post one only for the people they invite; each answers Say Yes! or Deny, the leader is told and follows each one (waiting, said no, said yes, checked in, done), and after a no invites someone else or deletes the draft |
| Volunteer | Check-in and analytics | Volunteers scan the leader's QR code (one per opportunity, or one for a whole event) when they arrive and when they're done (reminded as it starts); leaders mark who came, no-shows and hours; Volunteer Leaders and directors see hours, show-up rate, unmarked shifts and who's doing a lot, for the last 30 days, this or last school year or all time; everyone sees their own hours |
| Ask the School | Questions | Ask and follow up; routers assign to staff; ages turn amber and red |
| Ask the School | Your questions and F.A.Q.s | Your questions with the school's latest answer right under Ask a question, then every F.A.Q. below |
| Student | Student app | A dashboard for each child (a drop-down at the top, oldest first) or the student themselves: general information (tap the photo to take, choose or remove it), attendance this school year (tap absences, times late or left early for those days), and grades with the overall average and letter; each class opens a graph of its average through the semester or year to date and every grade. Read from a copy of the school's student information system (`sis_import`; sample data until FACTS is connected). Parents read each child's messages with teachers |
| Student | Ask the Teacher | Students message the teachers of their classes; teachers reply or start a conversation; parents and admins with Student messages can read |
| Student | Assignments | Teachers assign work to a class; students add their own, sorted overdue / today / coming up, and check them off privately |
| Staff | My calendar | In Calendar (School / Mine at the top; staff view opens on Mine). One list: teachers' and staff's own events, the games they're going to (moved or cancelled games follow), and their class students' games and performances to star ("I'll be there" tells the students and parents) |
| Calendar | Subscribe and Add to calendar | Everyone subscribes once in Google, Outlook, Yahoo or Apple Calendar to a private, self-updating link (school calendar, own events, children's activities); single events add with one tap. No student names leave the app |
| Everyone | Feedback | Anyone approved reports a problem or suggests an idea (where in the app, details, phone and app version) and sees the status and the team's reply; the IT role triages (status, priority, reply) and groups reports into student workshops |
| Admin portal | Classes | Class sections with their teacher and students, for Ask the Teacher and Assignments |
| Folder | Assigned documents | A bi-fold folder in the school's colors at the top of the Main Page, closed until tapped; it opens to the left over a blurred page and closes with a tap outside; the newsletter's latest issue first, then teachers' notes and class bulletins, then the forms to sign, as a stack of papers; swipe through them, tap to read and sign, swipe up or Remove to take one out; signed, expired and removed papers stay under Done & removed for 30 days |
| Folder | Class bulletins and teacher notes | Teachers post bulletins to their classes and write notes to one student's parents, from Classes; they land in those parents' Folders, and teachers see how many have read each |
| Folder | Notes to teachers | The open Class Folder's + writes a note to one of the child's teachers (or opens Excused Absence); the teacher reads it under From parents, the parent sees Seen, and Reply answers into the Folder |
| Notifications | Bell page | Inbox of everything sent to you, swipe to delete, clear all |
| Admin portal | People and roles | Directors, custom roles, single permissions, authenticator-app code required |
| Accounts | Delete my account | Anyone deletes their own account in My profile (or while waiting for approval) by typing DELETE: login, profile, posts and comments go; a student with parents in the app loses only the login; directors hand the role on first |
| Accounts | Student logins | Parents (or the office) give a child their own login by adding their email; the child is emailed how to sign in and keeps their classes and links |
| Photos | Photo gallery | Staff start albums by category, for everyone or staff only; everyone who can see an album adds photos to it, and browses and searches them by school year (Apps → Photos, Latest Photos on the Planner). Teachers, staff and admins remove any photo with a reason (school guidelines, not appropriate, no photo permission, wrong album, duplicate or blurry, or a note), and the person who added it is told |
| Photos | Grade and event albums | Every grade K2–12th gets an album a week before each school year starts; only that grade's students, their parents and staff see it, and families keep it until their account is deleted or they (or the office) take it off. Volunteer and school calendar events can get an album when they're made |
| Planner | Two weeks a day at a time | The date and a greeting, then each day: the uniform (folds away, remembered on the phone), assignments, a card per child, events, activities, volunteering and car line hours; then the Royal News button (the newsletter's masthead), Coming Up and Latest News |
| Planner | Needs you today | Teachers and staff see what's waiting on them across the apps (roll to take, questions, absence reports, volunteer shifts to mark, approvals, feedback) and heads-ups (students out today, a sub with their class, lunch visitors), each opening its screen |
| Everyone | Settings behind the gear | Each app's settings and running tools sit behind one gear in its header, shown only to those who can use them |
| Planner | Royal News archive | Every newsletter issue in the app (sections, pictures, links); staff add one by pasting its Smore link |
| Planner | Dress-up days | Staff add Spirit Week themes (per day, optionally by grade); the Planner shows them above the uniform |
| Admin portal | Delete accounts | Holders of Delete accounts (directors by default) remove someone's login, profile, posts and comments; never yourself or a director; admins need Manage admins too |
| Admin portal | Students | Add children, approve family requests |
| Admin portal | On-Site Attendance | The dashboard's top card: everyone at school now (staff, faculty, visitors, students), where the students are, and after dismissal who isn't sent home yet; the office's screen lists names, checks staff in and out, and runs the visitor desk |
| Staff | Checking in at school | Teachers, staff and substitutes check in on their Planner when they arrive (only at school) and out when they leave |
| Staff | Going home | The class roll's Going home view: how each student left (car line, office, check-out lists and extended care fill in by themselves; the teacher marks Walked, Drove, Bus or Other) |
| Staff | Extended care | The office sets which students stay which days and who runs it; extended care staff release each child from a daily check-out list, only to someone on the pickup list |
| Staff | Standard / Staff view | Teachers, staff and admins switch the Main Page to Staff: Alerts, Classes, the Admin portal and the staff versions of Car Line, Calendar, Forms and Ask the School, marked in gold; coaches add Activities events and post in Volunteer |
| Staff | Classes | One app for a teacher's classes: each class's roll and assignments, messages from students (Ask the Teacher), substitutes and check-out lists; the office's every-class roll, check in and out, and reported absences at the top |
| Admin tools | In their apps | Sending a notification is on the bell page, routing questions in Ask the School (All questions), the Alert map in Alerts; each asks for the authenticator code right there, and the Admin portal (people and access) lists the ones an admin holds |
| Builds | iPhone app on TestFlight | Version 1.0 builds with date build numbers go to the Core 4 testers with a What to Test note, through Beta App Review ([DEVELOPING §9](DEVELOPING.md#9-testflight-iphone-testers)) |
| Builds | Web, Android and iPad | Web app on GitHub Pages and an Android APK built on every push; on iPads and tablets pages sit in a centered column with five Main Page tiles across |
