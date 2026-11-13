# KH Royals and WCA — one codebase, a school app each

One Expo / React Native codebase that ships to **iOS, Android and web** for two schools,
each as its own app with its own data:

| School | App | Folder | Web app | Supabase project |
|---|---|---|---|---|
| **Kingdom Heights Preparatory School** (the Royals, Huntsville) | KH Royals (`com.khroyals.app`) | `schools/khroyals` | https://royalrockinapps.github.io/khroyals/ | `twmeenkvoedoryhterpf` |
| **Westminster Christian Academy** (the Wildcats, Madison and Huntsville) | WCA (`org.wcahsv.app`) | `schools/wca` | https://royalrockinapps.github.io/khroyals/wca/ | `nnbhslmvgabygvhugqfm` |

Each school's site content — every page, news post, video and the school calendar — is
imported from its real website ([khroyals.com](https://www.khroyals.com/),
[wca-hsv.org](https://wca-hsv.org/)).

## Schools

Every feature, workflow and test is shared; what makes an app a school's own lives in
`schools/<id>/`, and a build picks the school with `SCHOOL` (Kingdom Heights when unset):

```bash
npx expo start                 # Kingdom Heights
SCHOOL=wca npx expo start      # Westminster
```

```
schools/index.js        the list of schools and SCHOOL → folder (read by app.config.js and metro.config.js)
schools/<id>/
  app.json              app name, app IDs, link scheme, icons, web address, its Supabase project
  school.ts             names (app, school, community, newsletter), website, colors and fonts
  content/site/         the website's imported content
  assets/               icon, tiles, uniform pictures, car line map
  menu.ts uniform.ts uniformImages.ts handbook.ts handbookOutline.ts carline.ts carlineMap.ts tiles.ts fonts.ts
supabase/schools/<id>/  database changes for that school only (its names and settings)
```

- **Shared code never names a school.** Screens read `SCHOOL` from `src/school.ts` and import
  a school's files as `@school/…` (the bundler points that at the school's folder; tsconfig
  at Kingdom Heights', `tsconfig.wca.json` at Westminster's, so `npm run typecheck` checks both).
  `tests/schools.test.ts` checks each school has every file, its own app IDs and its own
  Supabase project, and that no shared file names a school.
- **Data never mixes.** Each school has its own Supabase project; the app only ever knows its
  own (`@school/app.json`). The same migrations (`supabase/migrations/`) run on every project,
  and read the school's names from `app.settings` (`app.brand('app_name')`, …); a school's own
  values and data are in `supabase/schools/<id>/`, applied once after the shared migrations.
- **CI builds both:** an APK per school, both web apps (WCA under `/khroyals/wca/`), and the
  database deploy for each school's project.
- **Adding a school:** copy `schools/wca` and `supabase/schools/wca`, change the values, add
  its id to `SCHOOLS` and to the three workflows' matrices, and give its Supabase project's
  token a repository secret.

> **Building it or putting it on a phone?** See [DEVELOPING.md](DEVELOPING.md).
> AI coding agents: read [AGENTS.md](AGENTS.md).
> What's left to do, and who owns it: [ROADMAP.md](ROADMAP.md).

## Run it

```bash
npm install
npx expo start          # press i for iOS simulator, a for Android, w for web
npm test                # permission engine tests
npm run typecheck
```

Video playback uses native modules (`expo-video`, `react-native-webview`), so use a
development build or the APK below rather than Expo Go to see the videos.

## Site content (real, from khroyals.com)

```bash
pip install beautifulsoup4
npm run import-site     # re-scrape khroyals.com into schools/khroyals/content/site/
npm run import-site-wca # re-scrape wca-hsv.org (WordPress) into schools/wca/content/site/
```

`scripts/import_site.py` reads the sitemap, every page and the news collection
(Squarespace `?format=json`) and writes:

```
schools/<id>/content/site/
  site.json        school info, colours, the site menu, footer, social links
  home.json        the home page
  pages/*.json     all 23 menu/footer pages (admissions, academies, our story, …)
  pages.ts         generated import map of those pages
  news.json        all 55 news posts with full bodies
  calendar.json    2026–27 important dates (from the official calendar PDF)
```

Each page is a list of sections → blocks (heading, paragraph, button, image,
gallery, cards, accordion, video, …) rendered natively by `src/site/Blocks.tsx`.
Links keep the site's URLs; `src/site/links.ts` opens site pages and news in-app,
videos in the in-app player, and PDFs/portals/forms in the browser.

**Videos** are the site's own:

| Where | Source | Played with |
|---|---|---|
| Home hero background, Our Story, Admissions, academy pages, Giving, Butler campus | Squarespace-hosted (HLS) | `expo-video` |
| "What parents are saying" testimonials, "Our Story" vision film | Vimeo | WebView / iframe |
| Hillsdale curriculum, CHOOSE Act, motto section | YouTube | WebView / iframe |

The tuition calculator is an interactive widget on the website, so the app links
to it. The calendar's dates are transcribed in the importer from the official PDF.

## Layout

```
schools/         each school's own app settings, content and pictures (see Schools above)
mock-db/comms/   Royals Connect demo data (npm run regen-comms); seeds Supabase
supabase/        migrations, seed, local test stubs, Edge Functions (send-push)
scripts/         import_site.py (website), gen_comms.py (Connect demo)
plugins/         Expo config plugins (withSceneLifecycle: iOS 27 UIScene life cycle;
                 withGradleMemory: 4 GB for the Android release build)
app.config.js    build-time tweaks: iPhone test signing, no web prefix in iOS release bundles
src/api/mockApi.ts    the ONLY module screens call; swap bodies for fetch() later
src/site/             block renderer, link routing, video players
src/comms/            types, presets, permission engine, roster auto-assignment, settings UI
src/carline/          Car Line parent and duty views, automatic check-in
src/market/           Marketplace terms gate and helpers
src/volunteer/        Volunteer gate and helpers
src/attendance/       Classes: marks, a class's roll in words, school-day stepping, class cards and their tools
src/checkin/          checking students in and out: reasons, pickup-list picker, field trip lists
src/handbook/         Handbook reader: pages, paragraphs, sections, search
src/questions/        Ask the School gate and helpers
src/share/            the Share tab's pass and what it shares; QR codes drawn with plain views (qrcode-generator)
src/calendar/         past events: the school's date, "Show past events", greyed-out style
src/ScreenEdge.tsx    the thin red line around every light screen (navigators' screenLayout)
src/sports/           Activities: categories, season and sign-up rules, sample data, shared pieces
src/carplay/          what the CarPlay screen shows and does (car line check-in)
modules/carplay/      local Expo module: the CarPlay scene and templates (Swift)
app/                  expo-router screens (tabs: Planner · Share · Home · Connect · Profile;
                      Home is the shield button, labeled along its curve, which opens
                      the Apps page: Car Line, Student, Calendar, News, …)
tests/                permission engine tests
```

## Backend (Supabase)

Royals Connect, group calendars and the admin console run on Supabase when
`app.json → expo.extra.supabaseUrl/supabaseKey` are set (otherwise the app uses
the bundled demo data). The publishable key ships in the app; **the database
enforces every rule**:

- `supabase/migrations/` — tables (profiles, rosters, groups, memberships, posts,
  replies, reactions, votes, polls, audit log, events), row-level security, and
  the API functions the app calls. `app.can()` is a port of
  `src/comms/permissions.ts` (locks, quiet hours in Central time, mutes, slow
  mode, approval queues), and roster rules keep group membership in sync
  (`app.sync_rule_memberships`, triggered by roster/guardian/profile changes).
- Writes only go through the functions (`create_post`, `add_comment`,
  `moderate_post`, `create_group`, `update_group_settings`, `set_membership`,
  `admin_update_profile`, `admin_link_guardian`, …); direct table writes are
  refused, except calendar events, which have their own policies.
- Realtime is on for posts, replies, reactions, poll votes, memberships and events.
  A private `attachments` storage bucket is ready (`<group id>/<file>`); the app
  doesn't upload yet.
- New sign-ups wait for an admin to approve them in **Connect → Admin console**.

```bash
npm test                         # includes tests/db.test.ts: migrations + seed + RLS in PGlite
python3 scripts/gen_seed.py      # rebuild supabase/seed.sql and supabase/setup_all.sql
# apply to a project (needs a personal access token for schema changes):
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ACCESS_TOKEN=… \
  NODE_USE_ENV_PROXY=1 node scripts/supabase_setup.mjs     # add --demo (+ DEMO_PASSWORD) for demo data
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… DEMO_PASSWORD=… node scripts/smoke_supabase.mjs
```

Without an access token, paste `supabase/setup_all.sql` into the dashboard's SQL editor.

**Sign-up & sign-in (no passwords).** *Log in*: enter your email, we email a
6-digit one-time code, type it in. An email with no account moves you to *Create
account* (name + email → code); an admin then approves the account. There is no
password to forget — a lost-access user just logs in again with a fresh code.
Codes last 10 minutes. The email shows the code only once the project has custom
SMTP (see DEVELOPING.md); until then Supabase's default email has a sign-in
button, which the app also accepts (`khroyals://auth`, web `/auth`).

**Admins.** **Directors** have every permission and manage admins and roles.
There can be several, never zero (a database trigger blocks removing the last
one), so changing personnel = add the new director, then the old one steps down.
Directors create **roles** (bundles of permissions — *Administrator* and *Office*
come built in and are editable) and assign them to staff, and can grant single
extra permissions to anyone. The portal's people list is paged and searchable
server-side (`admin_list_people`). Admin tools need a code
from an authenticator app (free TOTP, enforced in the database; switch with
`app.settings.require_admin_mfa`). The admin portal is the app's **Admin portal**
screen: same on web (`npx expo export --platform web`, host the `dist/` folder),
Android and iPhone. It opens on a dashboard: **On-Site Attendance** for today on top
(for the office: who is at school now, below), tiles for what needs attention (accounts
waiting for approval, family requests, questions to route, new feedback, absence reports
to mark seen), its sections (People, Students, Classes,
Admins & roles, Activity log; each opens its own screen), recent activity, and the
admin's tools in other apps. It holds people and access only. Admin tools that belong to an app live in that app:
sending a notification on the bell page, routing questions in Ask the School, the
Alert map in Alerts, and so on. The portal lists the ones an admin holds under *Your
tools in other apps*. Those screens ask for the authenticator code right where the
tool is (`VerifyCard` in `src/comms/MfaGate.tsx`), so nobody goes to the portal and
back.

**My profile** (the Profile tab, or your name on Connect): profile
photo (private `avatars` bucket, signed URLs; staff with *people.roles* can remove
one), name, and push settings — group posts, Marketplace, Volunteering, quiet
hours, and a level per group. School-wide announcements always push. Settings only
filter pushes (`app.wants_push`); the in-app inbox still lists everything. At the bottom
(and on the Waiting for approval screen), **Delete my account**: type DELETE and the
login, profile, posts, comments, sign-ups and settings go for good; children stay with
the school. A student whose parents use the app loses only the login (their parents are
told and can give one again). Directors hand the role on first. **About** (`app/about.tsx`,
a row on the Profile tab; once the More tab) keeps the school's website menu, contact
details and social links.

**Android Auto:** the car line on the car's screen — each child's status and an
"I'm here" button (`modules/car-line`, using a per-phone car pass that can only do
that). CarPlay does the same on iPhone (see **CarPlay** below).

**Stats.** The app records who saw each post (`record_post_views`, once per person
plus repeat counts) and who opened each notification. Authors and group moderators
(admins with *groups.manage* too) get **📊 Stats** on a post (`post_stats`: % of the
group who saw it, views, reactions, replies, poll votes, followers, push opens, views
by day, who saw it) and a **Group stats** screen (`group_post_stats`); the portal's
notification history shows opens. **Following:** authors and repliers follow a post
automatically; anyone can follow/unfollow (🔔), and new replies notify followers
(`app.notify_reply`). My profile toggles: school announcements (urgent ones always
push), group posts, replies, Marketplace, Volunteering, quiet hours, per-group level.

**Children.** Children are students without a login: profiles with `managed = true`
(no auth account), linked to any approved adult through `guardians`, so the car line,
family groups and grade-based groups work for them. The office adds them (Admin portal
→ **Students**) or approves parents' requests (`request_child`, `request_child_edit` →
`admin_decide_family_request`). Parents edit photo, bio, birthday, allergies and health
notes themselves (**My children**); those details (`student_details`, child photos under
`avatars/children/<id>/`) are visible only to the child's parents and staff. Grades come
from the graduation year (`class_of`) and move up every July 1 (`app.refresh_grades`,
daily via pg_cron). K2 = -3, K3 = -2, K4 = -1, Kindergarten = 0.

**Family accounts.** A school role for grandparents and other relatives who pick
children up (`school_role = 'family'`). The office approves the account as Family and
links it to children in Admin portal → **Students**; those links go in `family_pickups`,
never `guardians`. Family accounts get the car line for those children (with their pickup
numbers, but no allergies, health notes or photos), Volunteer and its chat, Activities
(browse and follow, no sign-ups), and the news, calendar and Handbook everyone sees.
They're kept out of Royals Connect groups, the Student app, the Marketplace, Ask the School
and family requests, by the database as well as the app.

**Car line (like PikMyKid).** Every student has a pickup number (auto-assigned,
editable by the office/car line leads; siblings may share). Parents tap **I'm here**
(or Android Auto, or automatic check-in) and the app sends their location; the server
only accepts it within the radius of the pickup spot during pickup hours (or when staff
opened the line today). Only a child's linked parents, or a Family account linked to
them, can announce them. Drivers save the vehicles they use in My profile → **My
vehicles** (make, type, color; `vehicles`) and pick one above I'm here; the last one used
is the default, which automatic check-in and the car screen use too. All staff see
the live board (number, name, grade, vehicle, driver, distance) and mark pickups. Car line leads
and the office set the spot ("Use my location"), radius (feet) and hours in **Car line
settings**.

**Critical alerts** (Apps → Alerts; teachers, staff and admins only). Admins with **Send
critical alerts** (`alerts.send`: Director, Administrator and Office to start) send an alert
for severe weather, an active threat (lockdown), a dangerous situation or another urgent
message. Each kind starts with a template the sender edits. Every teacher and staff member
gets it at once (always pushed, loud: see DEVELOPING §10), and it covers their app until they
answer **I'm safe** or **I need help** (with where they are). Senders see a live roll call
(need help first, then no answer, then safe) and give the **all clear**, which everyone is
told about. Parents, students and Family accounts never see alerts.

**Where they answered from.** After signing in, teachers and staff are asked once whether
their location may go with their alert answers (`LocationConsent`; `location_consents`,
`alert_location_consent`; changeable in My profile). Yes asks the phone for location
permission. From then on, tapping I'm safe or I need help sends the answer at once and,
right behind it, a GPS fix with its accuracy and the BSSID of the Wi-Fi access point the
phone is on (`src/alerts/locate.ts`, `critical_alert_share_location`; nothing is kept from
anyone who said no). Senders tap anyone in the roll call to see their answer, the place
("Room 112 · Main building · 1st floor"), the GPS spot with **Open in Maps**, or why there's
no location. The place comes from the **Alert map** (Alerts → Alert map; `alerts.map`:
directors, administrators and IT): the school's access points and the room or area each is in,
added one at a time (on a phone, *Use this phone's access point* while standing in the room)
or pasted from IT's list (`wifi_access_points`, `wifi_ap_save` / `wifi_ap_import`). A BSSID
that's only off by its last hex digit from a mapped one (another radio of the same access
point) shows as "Probably" that place (`app.ap_place`). Locations are erased
`alert_location_days` (30) after the all clear (`app.purge_alert_locations`, daily). iPhones
need the Access Wi-Fi Information capability (`app.config.js`) to read the BSSID.

**Needs you today** (the Planner, for teachers and staff on the Staff view). One card (tap its heading to fold it; it starts open) at the
top lists what's waiting on them across the apps, each opening its screen: roll still to take
in their classes, questions waiting for their answer (and, for routers, ones to route), absence
reports to mark seen (the office), volunteer shifts they led that nobody marked, accounts and
family requests waiting for approval and new feedback (admins, in a verified session), and
heads-ups: their students reported out today, a sub with their class, lunch visitors. One call
counts it all (`staff_today`; rows in `src/info/needsYou.ts`), and the card is left out when
nothing is waiting.

**Settings live behind the gear.** An app's settings and the tools for running it sit behind
one gear in its header, shown only to people who can use them (`src/ManageButton.tsx`): Car
line settings, Lunch Visits' times and rules, Calendar's dress-up days, Volunteer analytics,
Activities' *Add an activity*, Photos' categories. Buttons that make something (+ Add event,
+ Opportunity, + New album) stay on the screen.

**Notifications.** Everything sent to a person lands on the Notifications page
(the bell in the top bar, `app/notifications.tsx`): the school's notifications
(`public.notifications` via `my_notifications()`: group posts, announcements,
Marketplace, Volunteer, Ask the School) merged with the ones the phone shows by
itself (the car line's, kept on the phone by `src/comms/localInbox.ts`). Tapping
one opens what it's about (`notificationHref()` in `src/comms/inbox.ts`). New ones
are marked; swipe one (or tap ✕) to delete it, or *Clear all* (`dismiss_notifications`,
`clear_my_notifications`; the phone's own are deleted on the phone). After
sign-in the iPhone and Android apps ask permission to show notifications; the page
says when they're off and links to Settings.

**Push** goes through Expo's free push service: new posts notify group members
(per-group preferences), and staff with *Send notifications* send to everyone, a role,
or a group from the bell page (*Send a notification*, `app/notifications/send.tsx`).
`supabase/functions/send-push` delivers them (deployed by the setup script). Phones
register after sign-in once the build has an Expo project id (`eas init` →
`extra.eas.projectId`) and that Expo project has an APNs key (iPhone) or Firebase
credentials (Android); see DEVELOPING.md §7.

**CarPlay** (iPhone). On the car's screen, KH Royals shows today's car line for the
parent's children with their pickup numbers: *I'm here* checks everyone in (with the
phone's location, which the server checks like the phone app's), each child's row
checks in just them or (after a confirmation) cancels, and statuses update live as
staff confirm pickups. Nothing is tappable while the line is closed. The car line notifications show on CarPlay too. It's a CarPlay *driving task*
app: Apple has to grant the entitlement before iPhone builds include it; simulator
builds have it already. Setup and Apple's approval steps: DEVELOPING.md §8.

**Share** (the second tab). A pass in the school's colors (`src/share/Pass.tsx`: the
name in the newsletter's script, the motto, a QR code with the shield in its middle, and a
ticket's tear line) that anyone can scan with a phone camera. Chips pick what it opens
(`src/share/targets.ts`): *Get the app* (the web app), the website, the school calendar PDF
and the latest Royal News issue, each only when it has a public link. *Share* opens the
phone's share sheet, *Copy link* the clipboard, and *Save image* makes a picture of the pass
for a flyer or the newsletter (`react-native-view-shot`; the share sheet's Save Image on
phones, a download on the web). The code is drawn with plain views (`src/share/QrCode.tsx`;
with the shield it uses high error correction). **News** moved from its tab to Apps → News.

**Car line** (Apps → Car Line). Parents tap *I'm in the car line* for the children
they're picking up; staff on car line duty see arrivals live and tap *Picked up*
(with Undo for mis-taps). Office staff with *Families & rosters* put staff on duty
in Admin portal → People. Duty isn't an admin permission, so it needs no
authenticator code. Check-ins are kept as the day's pickup record
(`carline_pickups`), and the line starts fresh each day (Central time). The seed puts
the demo Teacher on duty so the staff side can be tried.

Parents can also turn on **Check in automatically** (phones only): a geofence
around the car line (`src/carline/autoCheckIn.ts`) wakes the app on arrival, and
`carline_arrived()` checks the children in if it's pickup time on a school day,
followed by a "You're checked in" notification with *Cancel check-in*. Arriving up
to 45 minutes early schedules a reminder for opening time instead. The zone and
hours live in `app.settings` (`carline_latitude`, `carline_longitude`,
`carline_radius_m`, `carline_start`, `carline_end`, `carline_days`,
`carline_first_day`, `carline_last_day`); No School, Teacher In-Service and
E-Learning days on the school calendar are skipped. The zone starts at the school's
street address; move it to the car line entrance.

**Folder** (the top of the Main Page; parents, and staff with children here on Standard).
A bi-fold folder in the school's colors, closed, saying what's new inside. Tap it: the page
behind blurs, the folder comes up, and its cover, with the school's shield, lifts from its
right edge and swings open to the left, as tall as the screen allows; tap anywhere outside
it (or the **×** on its bottom left corner) and it swings shut and goes back. The **+** on its
bottom right corner writes a note to one of your child's teachers or reports an absence
(Excused Absence). Inside, the papers are a stack, with the newsletter's latest issue (the
one the Planner links to) always on top first, then notes from teachers (yellow sticky
notes) and class bulletins, then the forms to sign; the papers behind peek out above it,
with a count. Swipe sideways (or tap the arrows) to go through them, tap one to read or
sign it, and swipe a paper up (or tap Remove) to take it out of your folder after
confirming. Signed, expired and removed forms leave the folder and wait under *Done &
removed* for 30 days (notes and bulletins after two weeks); a removed one still open can be
put back. Removing only hides it for you: the school still sees whether a form is signed.

**Class bulletins and notes** (Classes → Bulletins & notes, or *Bulletin* on a class; the
Folder tile in Staff view). A teacher posts a bulletin (a title and what to say) to the
classes they lead, or writes a note to one student's parents. Each lands in those parents'
Folders and they're told; students and other families never see a note. The teacher sees
how many parents have read each, and deletes it if needed. Notes parents write to them (the
Class Folder's +) arrive under *From parents* (and on the bell), marked Seen for the parent once
opened; *Reply* answers with a note into that family's Folder. Only that parent and teacher see them.

**Marketplace** (Apps → Marketplace). Parents and staff buy and sell uniforms and
school-related items after accepting the Marketplace terms (text and version in
`app.settings`: `market_terms`, `market_terms_version`; bump the version to ask
everyone again). A post has an optional photo (private `marketplace` bucket, one
folder per seller), price, quantity (the whole bundle goes to one buyer) and
condition. Buyers call **Dibs** (take it as posted) or make an **Offer**; the
seller accepts or counters once, and the buyer accepts or declines. The seller
sees everyone in line in the order they responded, selects a buyer whose price is
agreed, and confirms; then both get a deal card to hand the item off at school.
Every step notifies the other side through the inbox (`notifications.audience =
'user'`). Admins with *Manage all groups* can remove any post, and the seller is
told why. Students can't use it.

**Volunteer** (Apps → Volunteer). Volunteer Leaders (parents or staff the office
chooses in Admin portal → People) and the coaches and directors of activities post
opportunities (concession stand helpers for a game, drivers to an away meet) with a description, date,
optional times, place and an optional number of spots. Parents and staff tap
**Say Yes!** until it's full; the opportunity joins their *My sign-ups* list and
they can **Remove me** (the leader is told). A people icon shows everyone the count
and who signed up. Each opportunity has a chat for its volunteers and leader; the
leader's messages are highlighted. A leader deletes an opportunity with a reason
that every volunteer is sent. Students can't take part. The seed makes the demo
Teacher a Volunteer Leader.

**Time slots.** Help needed at several times (book fair helpers Monday 3–5 and Tuesday
3–5) is one opportunity with time slots: *+ Add another time slot* when posting, or
*Time slots → + Add a time slot* on its page later. Each slot has its own spots, sign-ups,
check-in QR code and hours, so people say yes to the times they can make. The list shows
one card with how many slots and spots are left across them; its page lists the slots to
switch between. Each slot is an opportunity row pointing at the first (`slot_of`,
`volunteer_add_slot`, `src/volunteer/slots.ts`); the photo, event and order follow all of them.

**Cover photos.** Whoever posts an opportunity or starts an event can put their own photo
on its card and across the top of its page (*Add a cover photo* when posting; later, the
opportunity's *Cover photo* section or the event's *Change event details*); without one the
card shows a drawing that matches its title. The photo is cropped to the banner's 2:1 shape
and kept in the private `volunteer` bucket, readable only by whoever can see the opportunity
or event (`volunteer_set_image`, `volunteer_event_set_image`).

**Invites.** A leader asks people in particular from an opportunity's page (*Invited* →
*Invite people*: find them by name, add a note). Each is told and finds it under
*Invitations* at the top of Volunteer, with **Say Yes!** and **Deny**. Saying yes signs
them up (it's in their *My sign-ups*) and tells the leader, who follows each invite there:
waiting, said no, said yes, then checked in or done on the day. On an opportunity everyone
sees, an invite holds its spot until it's answered. Posting with *Who can say yes → Only
people I invite* makes a draft nobody else sees; when someone denies, the leader invites
someone else or deletes the draft (no reason needed before anyone has said yes).

Opportunities can be grouped under an **event** (`volunteer_events`): Harvest Fest
is one card in the Volunteer list, and tapping it opens the event with its
opportunities inside (bringing bottled water, setting up the day of); the rest
follow under *Other opportunities*. Any Volunteer Leader starts an event (+ Event)
and adds opportunities to it from the event's page or the event picker on a new
opportunity; an opportunity's leader can move it into or out of an event. The
leader who started an event puts its opportunities in order, most important first
(**Reorder** on the event's page; everyone sees that order, and ones added later
follow by date), changes the event, or removes it, which keeps its opportunities,
on their own.

**Classes** (Apps → Classes, the `app/attendance` screens; teachers and staff). A teacher's
class sections (`rosters` with kind 'section', Admin portal → Classes) each show the day's roll
at a glance: a bar of present / late / absent and "Roll not taken yet" until it's started, with
*Take roll* and *Assignments* (that class's, and assigning more) along the bottom. Below them are
*Messages* (the teacher side of Ask the Teacher, with the unread count) and *Substitutes*.
Students keep Ask the Teacher and Assignments as their own apps. Tapping a class opens the roll: P, L or A for each student (tap again to clear) and
*Mark the rest present*. The office's late arrivals and early check-outs (Check In &
Out) show on the student's row, a late check-in counts as Late whatever the teacher
marked, and the teacher gets a notification for each. Earlier school days are a tap
away; the last two weeks can still be changed. The office (`checkin.manage`) opens
*All classes* to see every section's roll, the ones still to take first, and can
take roll for a teacher who's out, and *Check a student in or out* to record late
arrivals and early pickups (with a reason, and only to someone on the child's pickup
list; parents and the class's teachers are notified). Field trip and Activities event
check-out lists sit below the classes.

**On-Site Attendance** (the Admin portal's top card, *On-Site Attendance - Thursday,
November 5*; the office, `checkin.manage`). One bar of everyone at school right now, staff,
faculty, visitors and students, with each group's count (of how many are expected), then
where the students are: in class; after the dismissal time, at an activity, in extended
care or **not sent home yet** (amber until it's zero); gone home; absent; not checked in.
*See who* (or Classes → On-Site Attendance) lists the names: students by group with how each
went home, teachers and staff with when they came and went (the office checks someone in or
out when they can't), and the visitor desk (sign a visitor in with who they're seeing and
how many are with them, sign them out; today's booked lunch visitors are a tap). The
dismissal time is behind its gear. Teachers, staff and substitutes **check in** on their
Planner when they get to school (only at school, by location, like the car line) and check
out when they leave. Students are checked in by their teacher's roll, and sent home by the
car line, the office's check-out, a check-out list, extended care, or their teacher: the
class roll's **Going home** view (where it opens after dismissal) marks the rest Walked,
Drove, Bus or Other, and parents are told. **Extended care** (Classes → Extended care): the
office sets which students stay on which days and who its staff are (the gear); its staff
open today's check-out list and release each child only to someone on their pickup list.

**Event tickets** (Activities). An activity's coaches and directors tap *Sell tickets* on
an event: kinds of ticket with prices and optional limits (Adult $10, Student $5, Under 5
free), on sale or not, when sales close, and how many one order holds. Parents, staff and
Family accounts then see *Tickets · from $5* on the event, choose how many of each, and pay
on Stripe's page (card, Apple Pay, Google Pay); tickets are held for 30 minutes while they
pay. Paid tickets land in **My Tickets** (in Activities: the ticket button at the top, and a
card while they hold tickets) with a QR code and a short code, and can be
added to Apple Wallet or Google Wallet. At the door the leaders scan each ticket (or type
its short code); each admits once, and the screen counts who's in. *Sell tickets* also
shows what's sold, who bought and what's come in. Stripe and the Wallets switch on when the
school adds its keys (DEVELOPING.md); until then only free tickets are issued.

**Substitutes.** A Substitute account (Admin portal → People → role Substitute) is
closed by default: Apps shows only *Sub Days* and the public apps (Calendar, News,
Handbook, Feedback), and they're in no groups. A teacher schedules a sub for the
classes they lead (Classes → Substitutes → *Schedule a sub*): who, which classes,
the first and last day, the hours, and sub plans; the office (Schedule substitutes
permission) does it for any class. The sub gets a notification and sees which classes
and when. Only during those days and hours does *Sub Days* open the classes: the
roll (today's), the office's late arrivals and early check-outs with their
notifications, the sub plans, field trip check-out lists from the class's students,
the car line board, and critical alerts (they answer and appear on the roll call
like staff). Afterwards none of it is visible to them. Teachers and staff can be
scheduled to cover a class too.

**Handbook** (Apps → Handbook). The Student / Parent Handbook as its table of contents:
its parts, and each section folded until tapped, opening to that section's text (with
the PDF page it starts on). Searching opens every section the words are in, highlights
them, shows how many matches each has, dims the rest and scrolls to the first; *Fold all*
closes them again. The text is extracted from the school's PDF (`schools/<id>/handbook.ts`,
regenerated with `swift scripts/import_handbook.swift`) and rebuilt into headings and
paragraphs by `src/handbook/handbook.ts`; the sections follow the school's outline
(`schools/<id>/handbookOutline.ts`: each section's title and the line it starts at). The top
shows the edition from the PDF's cover. After a new edition is imported, `npm run handbook:check`
says which sections to fix (DEVELOPING.md → Update the handbook).

**Activities** (Apps → Activities: the basketball-and-masks tile). Sports, theater,
music, art and clubs, picked with the category pills at the top (or All). Anyone
signed in sees what's **happening now**, seasons **coming up** with dates,
eligible grades, details, an info link and sign-up dates, and each activity's
**schedule**: games, practices, tryouts and tournaments for sports; rehearsals,
auditions and performances for theater and music; meetings, competitions and exhibits
for art and clubs; home/away and cancellations. An activity's coaches and directors add
events to its schedule with *+ Add an event* (on the Activities home, or the activity's page). People with an approved account tap an
activity's ★ button to **follow** it, and parents **sign up** their children during a
season's sign-up window; its coach or director approves, and only then is the child
registered. The Activities home has a search (🔍) and two carousels: **Your activities**
(registered, followed, then ones you opened lately) and **Upcoming events**, which counts
down to each game, practice or rehearsal with its venue, address and **Directions** (Maps),
then **Full schedule** for the next two months. Parents answer **Are you going?** (Going /
Not going) for each registered child, and students for themselves (`sport_event_rsvps`);
coaches and directors see who's coming on each item (`sport_event_attendance`). Coaches,
directors and activity managers can add a **team photo** (`avatars/sports/<id>/`, seen by
approved accounts; signed-out visitors see the emoji). Managers: the *Manage
activities* permission (`sports.manage`; Director and Administrator roles to start; add
it to a role like "Athletic Director") adds activities and their coaches or directors,
who (staff, no authenticator code needed) run its seasons, schedule and sign-ups.
Notifications: schedule changes go to everyone involved, sign-up decisions to the
parent, new sign-ups to the coaches/directors (or the activity managers), and "sign-ups
are open" to followers on the opening day (`app.announce_sport_signups`, daily via
pg_cron). Activities live in the `sports` tables (named before theater was added;
`sports.category` says which kind) and the `app/activities` screens. Without the school
server the app shows sample activities (`src/sports/sample.ts`).

**My calendar** (teachers, staff and admins: Calendar → *My calendar*, where Calendar opens in the staff view). One
list, day by day: their own events (meetings, duties, grades due; `personal_events`, private to them,
`personal_event_save` / `personal_event_delete`), the activity items they're going to (★ Going; they follow
the schedule, so a moved or cancelled game moves or shows *Cancelled* too, `my_calendar`), and, lighter with a
dashed edge, the games, performances and meets students in the sections they lead are registered for, with
which of their students take part, as a row of their photos under the time (`student_events`; never "Are you
going?" answers). *I'll be there* stars
one and tells those students (with a login) and their parents, once; *Add without telling* doesn't
(`student_event_plan`). Filters: All, Mine, My students'. The Planner tab shows the day's items.

**Calendars outside the app.** Everyone signed in subscribes once (Calendar → *In your Google, Outlook,
Yahoo or iPhone calendar*; also at the bottom of My calendar) with a private link that keeps itself up to
date: the school calendar, their own events and the games they're going to (staff), their children's or
their own activities (families, students). It's served by the `calendar-feed` Edge Function from
`calendar_feed_events` (`calendar_feed_token` makes the link; a new one turns the old off), in the standard
calendar format (`supabase/functions/calendar-feed/ics.ts`). **Students' names never leave the app.** Each
event in Calendar and My calendar also has *Add to calendar* (Google, Outlook, Yahoo, and Apple for school
and activity events, `calendar_event`), a one-time copy (`src/calendar/addTo.ts`).

**App usage** (Admin portal → App usage; admins with the Activity log). Which apps
people actually open and how often, over the last 7, 30 or 90 days: people active
today, this week and this month; active people each day; each role's active people
out of its accounts; and every app's people, opens and days used per person (with
people by role), most used first, then the apps nobody opened. The app counts each
person once per app per day, with each time they went into it; students are counted
too, as totals. Counts only: nobody's own use is shown, and records are erased after
400 days.

**A/B tests** (Royal News → the gear, or Admin portal → *A/B tests*; staff with Send
notifications). Different groups of people see different versions of one part of the app,
and the counts show which works better. The first is the **Royal News button on the
Planner** (above Coming Up: the newsletter's name in its masthead's brush script on ruled
paper): A is the masthead alone (opens the archive); B adds the latest issue's date under
it, with New in its first week (opens that issue). Everyone with an account
except students is in a running test, about half on each version, and keeps the same
version on every device. The app counts, once per person and issue, who saw the button
(scrolled into view), opened it and read the issue to the end. The results screen shows
each version's counts and rates and says whether one is really ahead (95% sure, with at
least 30 people per version) or it could still be chance. Start, stop or start over
there; it starts switched off. Counts only, never names.

**Feedback** (Apps → Feedback, or My profile → *Send feedback*). Anyone with an approved
account reports a problem or suggests an idea: what it is, where in the app, a title and
details; the phone and app version go along (`feedback_send`). They see their own reports
with the status (New, Being reviewed, Planned, Being worked on, Done, Not planned) and the
team's reply, and are told when either changes. Triage (the *Triage feedback* permission,
`feedback.triage`: a ready-made **IT** role, directors and administrators) gets every report
with the sender, high priority and new ones first, filtered by status; sets status, priority
and the reply (`feedback_triage`); and keeps **Workshops** (`feedback_workshops`): sessions,
with a date and what students will do, that group reports for students to learn on by fixing
real bugs and building requested features. New reports notify the triage team.

**Excused Absence** (Forms → Forms to Send to Office). A parent reports that their child is absent (one day or several),
arriving late or leaving early, with a reason (sick, appointment, family, travel, other) and a note.
The office and the child's teachers are told right away and see it, a day at a time, in Classes →
Absences reported by parents and on the class roll; the office marks each one seen, and the parents
hear back. Parents call a report off if plans change. They can attach a **doctor's note**, a photo of
the paper excuse or a PDF from the clinic, when they report it or up to 30 days afterwards, and view,
replace or remove it. Only the child's parents and the office open it; teachers see that there is one.

**Lunch visits** (Apps → Lunch Visits). Parents, and grandparents or other family the office linked,
book a time to come eat lunch with their child. The office (*Lunch visits* permission) sets the lunch
times open to visits (weekdays, time, grades and how many visitors a day, guests included), closes
days (no-school days on the calendar are closed already) and writes the rules. Before booking, the
visitor sees the allergy notes for that lunch, their child's own and the allergies among the students
at it (never with names), and the rules, and confirms they've read them. The child's teachers are told,
and teachers and staff see who's coming each day with each child's allergies.

**Ask the School** (Apps → Ask the School). Anyone with an approved account sends
the school a question (topic, subject, message); it stays in *My questions* with the
whole conversation, so they can come back for the answer and follow up. Routers (the
*Route questions* permission, in the Director, Administrator and Office roles to
start) work from Ask the School → *All questions*: oldest waiting first, with ages that turn amber
after a day and red after three, and they assign each question to a faculty or staff
member, who sees it under *Assigned to me* and answers it. Only the asker, the
assignee and routers can see a question. Routers are told about new questions,
assignees about assignments and follow-ups, and askers about answers. Under *+ Ask a
question*, *Your questions* lists each one with the school's latest answer, and the
F.A.Q.s follow below as one list that opens question by question (`src/questions/FaqSection.tsx`;
the old F.A.Q.s screen sends people here). People who can't ask (signed out, Family accounts)
still see the F.A.Q.s under the message.

**Demo data** (accounts like `u-eng@demo.khroyals.test` with groups and posts) is
only created with `supabase_setup.mjs --demo`, for local or throwaway projects. The
app has no demo logins.

## Royals Connect — how groups work

Every group is one primitive with a **style preset** plus fully overridable settings.

**Hide, archive, delete.** Any member hides a group from their own list (*Hide from my groups* on
the group; it comes back under *Hidden from my list* on the Connect tab), which matters for groups
the school put them in and they can't leave (`group_hide`, `memberships.hidden_at`). A group's owners
(and `groups.manage`) **archive** it in Group settings: it's gone for everyone else (lists, its posts,
events and members) and takes nothing new, until they restore it (`group_archive`; `app.effective_role`
and a trigger on posts, comments and events). Only an archived group can be **deleted**, by typing its
name; its posts, comments, events and members go with it, and the school's activity log keeps who
deleted it (`group_delete`).

| Style | Feels like | Default |
|---|---|---|
| Group Chat | GroupMe | everyone in the group talks |
| Discussion Board | Reddit | threads, nested replies, votes |
| Announcements | blog / channel | staff post, everyone subscribes, read-only |
| Q&A | ask-the-office | members ask, staff answer, questions screened |

**Every action has its own "who can" setting** — read, post, reply, react/vote, ask,
answer, attach files, polls, pin, see members, DM members, @everyone — set to
`nobody · owners · moderators · members · subscribers`. So "Announcements but parents
can comment" or "Discussion board where only students post" are just toggles.

**Lock-down & moderation**: one-tap lock with a reason; post approval queue; question
approval; anonymous questions; slow mode; quiet hours (e.g. no student posts 9 PM–7 AM);
auto-close replies after N days; content filter; per-person mute or "can't post"; pin;
close replies per post; full audit log; retained deleted content for records requests.

**Assignment**: rules auto-add people by school role, grade, class section, team or club,
optionally adding their **guardians** too (e.g. "Volleyball Families" = parents of
players). `syncRuleMemberships()` keeps groups in step with roster changes without
touching manually-added people. Groups can nest (Volleyball → Volleyball Families).

**Roles**: school admins act as owners everywhere; only staff can create groups.

The **Connect** tab has a "Viewing as" switcher so you can test as admin, teacher,
coach, student, a muted student, or a parent and watch permissions change.

## Moving to production

1. Replace `mockApi.ts` bodies with real HTTP calls (same return shapes), or run
   `npm run import-site` on a schedule to refresh content.
2. Re-run `can()` **on the server** for every write; the client copy is for UI only.
3. Roster sync: feed `syncRuleMemberships()` from the SIS (OneRoster/Clever/ClassLink).
4. Push notifications via `expo-notifications`; builds via EAS (`eas build -p all`).
5. Student data: plan for FERPA/COPPA review, records retention, and district approval.

## Web app (GitHub Pages)

**Actions → Web app (GitHub Pages)** publishes the web version (school site,
Royals Connect and the admin portal) to **https://royalrockinapps.github.io/khroyals/**
on every push to `main`. One-time setup: *Settings → Pages → Source: GitHub Actions*.
The build is served under `/khroyals` (`expo.experiments.baseUrl`).

**Demo overview:** **https://royalrockinapps.github.io/khroyals/overview/** is a one-page
summary of every feature (tap one for its workflow and safeguards) with a running-cost tab
(Supabase vs AWS, with a slider from 300 to 50,000 people, monthly or yearly). It's `overview/index.html`, copied into the
site by the web workflow, and deliberately not linked from the app. Update it when features change.

## Download the Android APK

Every push to `main` (and every pull request) runs **Actions → Android APK**:
type-check, tests, then a release build. Open the finished run and download
**khroyals-android-apk** under *Artifacts*. Unzip it and install the `.apk`
on an Android phone (allow "Install unknown apps" for your browser or Files app).
You can also start a build by hand with **Run workflow**.

The APK is signed with the default development key, which is fine for testing.
Before publishing to Google Play, create an upload keystore and store it as a
repository secret (or switch to EAS Build).
