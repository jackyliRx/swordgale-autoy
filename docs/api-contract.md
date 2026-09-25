# Autoy API Contract

> Status: observation-based. Only use a write/action endpoint after it has
> been observed from an authorized account and confirmed with a single manual
> action.

## Shared rules

- Base URL observed: `https://myteam.swordgale.online/api`
- Authentication is supplied as the raw JWT in the HTTP `token` request
  header. It is not a Bearer Authorization header.
- The server exposes the `token` response header. When a successful response
  contains a replacement value, update only the matching account's local token
  before the next request.
- The requests below returned HTTP 200 from an authenticated browser session.
- Examples intentionally omit character names, complete timestamps, and
  account-specific progress.
- Autoy stores multiple account tokens separately in browser `localStorage`,
  along with settings scoped to each account. Switching accounts stops the
  active runner and clears its role view and scheduled recovery polling before
  loading the selected account. Only one account runs at a time until safe
  cross-account concurrency and rate limits are established.

## `GET /heroes`

Lists all role cards available to the current account. This establishes that a
single account may own and manage more than one hero.

| Property | Type | Meaning observed |
| --- | --- | --- |
| `heroes` | `HeroCard[]` | All role cards for the authenticated account |
| `HeroCard.id` | number | Stable role-card identifier; use as `heroId` internally |
| `name` | string | Display name |
| `hp`, `sp` | number | Current health and skill points |
| `fullHp`, `fullSp` | number | Maximum health and skill points |
| `lv`, `exp`, `fullExp` | number | Level and experience state |
| `perished` | boolean | Whether the role is unavailable due to defeat |
| `actionState` | number | Action state code; enum is unknown |
| `actionTarget` | unknown/null | Current action target, when available |
| `actionStart`, `actionCompleteTime` | ISO date-time | Action timing data |
| `canComplete` | boolean | Whether a current action can be completed |
| `huntZone`, `huntStage`, `zoneName` | number, number, string | Hunt location/progress |
| `forge`, `tailor`, `craft`, `efficiency` | number | Crafting-related values |
| weapon fields | numeric string | Weapon coefficients, such as `sword` and `rapier` |

Two observed role cards both reported `selected: true`. Therefore `selected`
must not be used to identify the active role until a role-card click captures
the related request and response.

## `GET /heroes/{heroId}`

Loads one role card's full detail. A role-card click produced this read request;
it did not produce a state-changing "select hero" request. The frontend should
therefore hold `heroId` in its route and pass it explicitly to role-scoped API
methods.

Additional observed properties include base attributes (`str`, `tou`, `agi`,
`tec`, `int`, `lck`), profession values (`hunt`, `mining`, `logging`),
`position`, `tier`, `potential`, reincarnation data, and `recyclePrice`.

## `GET /heroes/{heroId}/statuses`

Lists the active status effects for a specific role card.

| Property | Type | Meaning observed |
| --- | --- | --- |
| `statuses` | array | Active role-status entries; empty for both observed roles |

## `GET /equipments`

Lists the account's equipment inventory. It is not role-scoped at the endpoint
level. An equipment record's `equipped` property contains the `heroId` of the
role currently using it, or should be treated as absent when unequipped.

Autoy should fetch this once at account scope and derive each card's equipped
items by filtering `equipment.equipped === heroId`.

## `POST /heroes/{heroId}/completeAction`

Completes the role's current completed action. Observed without a request body.
The response returned the updated role under `hero` and a human-readable
`message`. In the observed case it restored HP and SP, then set
`hero.actionState` to `0`.

This endpoint changes game state. The runner must call it only when the latest
`GET /heroes` or `GET /heroes/{heroId}` response reports `canComplete: true`.
It must use a per-role idempotency guard: after issuing the request, mark the
turn as pending, refresh state, and never retry the POST merely because its
response timed out. A later state refresh determines whether the action
completed.

## `POST /heroes/restAll`

Observed from the UI action labelled 「全部休息」. The observed request had no
request body. It starts rest for every participating role in the account and
returns a hunt-info-shaped response with the updated `heroes` list.

Each returned role had `actionStart` and `actionCompleteTime`; both roles
received the same completion time in the observed run. `actionState` was `2`
while resting. Treat these as observed values, and schedule from the returned
`actionCompleteTime` rather than a hard-coded 60-second duration.

The end-to-end party rest sequence is:

1. Call `POST /heroes/restAll` once.
2. Wait until the latest returned completion time plus a safety margin.
3. Call `POST /heroes/restAll/complete` once.
4. Use the returned party snapshot to confirm every enabled role is idle.
5. Start a hunt only after the full party is idle.

## `POST /heroes/restAll/complete`

Observed from the UI action labelled 「全部完成休息」. The observed request had
no request body. It completes the whole account party's rest in one action and
returns `huntInfo.heroes` with every observed role at `actionState: 0`, plus a
localized recovery message for each role.

For party rest, this replaces individual `POST /heroes/{heroId}/completeAction`
calls. The runner must wait for the server's completion time, issue this POST
once, and on network uncertainty refresh party state before taking another
action.

## Configurable repeat-rest policy

A hunt party has these rest settings:

| Setting | Type | Meaning |
| --- | --- | --- |
| `hpTargetPercent` | integer, 1–100 | Minimum HP percentage required for every enabled role |
| `spTargetPercent` | integer, 1–100 | Minimum SP/體力 percentage required for every enabled role |
| `restIntervalMinutes` | positive decimal | Minimum desired rest duration for one cycle; changeable while the runner is waiting |

After a rest completes, calculate each enabled role's percentages from the
latest server state: `hp / fullHp * 100` and `sp / fullSp * 100`. A party is
ready only when **every** enabled role reaches both configured targets.

Repeat-rest algorithm:

1. If the party is already ready, leave rest mode.
2. Call `POST /heroes/restAll` once and retain the returned latest
   `actionCompleteTime`.
3. Schedule completion at the later of the server completion time and
   `rest started time + restIntervalMinutes`. A setting below the server action
   duration cannot make completion happen earlier.
4. Call `POST /heroes/restAll/complete` once, then refresh party state.
5. If any enabled role remains below either target, begin the next rest cycle;
   otherwise allow the hunt runner to continue.

If a role is perished, missing, has an invalid maximum HP/SP, or cannot be
refreshed, stop the party and show the reason. Do not continue resting or hunt
with a partial party.

## Startup/resume from an existing rest action

Every 「開始自動狩獵」 turn begins with fresh `GET /heroes` and
`GET /huntInfo` data. If every participating role is already in the observed
rest state (`actionState: 2`), Autoy resumes that rest cycle instead of calling
`restAll` again or attempting to hunt. It waits until both the server's
`actionCompleteTime` and the account's configured minimum interval have passed.
It then requires `canComplete: true` for every resting role before issuing one
`POST /heroes/restAll/complete`.

After completing the existing rest, the runner refreshes state and checks each
role's HP/SP percentages. If every role meets both thresholds and the entire
party is idle, it can continue to the configured hunt action. If any role is
below either threshold, it begins another complete party-rest cycle. Mixed
rest/idle states, non-idle actions, empty role lists, invalid vitals, or
unknown action states stop the runner; they never fall through to a hunt POST.

## Multi-role hunt coordination

User-confirmed game rule: when two or more role cards are dispatched together,
every participating role must finish rest or any existing action before the
next hunt starts. Starting a hunt while another participating role is still
busy causes only one role to act.

Autoy must therefore model a `HuntParty`, not independent battle loops:

1. Load the current state for every enabled party member.
2. For a party rest, use `restAll`, wait for its server completion time, then
   use `restAll/complete` once.
3. If any member is still busy, perished, missing, or has an unknown action
   state, set the party to `waiting` and make no hunt-start request.
4. Begin the next hunt only after every enabled member is confirmed idle by
   the API contract.
5. Lock the party during start and completion. A different party under the
   same account must wait until the lock is released.

The complete `actionState` enum remains unconfirmed. Use `canComplete` and
server timestamps as control data; the observed rest value must not be
generalized to other actions.

## `POST /hunt` — original-location hunt

Observed from the UI action labelled 「原地狩獵」. The observed request had no
request body. It executed one hunt for all currently participating role cards
under the account: the returned combat report contained both roles, and
`huntInfo.heroes` contained both updated role states.

| Response property | Use in Autoy |
| --- | --- |
| `report` | Display-only battle report. Do not parse localized messages as control logic. |
| `huntInfo.heroes` | Updated party snapshot after the hunt. |
| `huntInfo.huntAvailableAt` | Server-authoritative earliest time for the next hunt. |
| `huntInfo.attackAvailableAt` | Server-authoritative earliest time for the next attack action. |
| `huntInfo.canBack`, `huntInfo.canForward` | Available hunt navigation; endpoint contracts remain unconfirmed. |
| `equipmentChanges` | Update local durability/inventory cache from server data. |
| `money`, `huntCount` | Account progress summary. |

Runner rules:

1. Refresh the whole party and pass the multi-role readiness barrier before
   calling this endpoint.
2. Issue one POST only. On network uncertainty, refresh `/heroes` and hunt
   status before considering another attempt.
3. Schedule the next decision from the returned ISO timestamps, with a small
   safety margin; never calculate cooldown duration locally.
4. Keep future `attack` and back requests disabled until their UI actions and
   endpoint contracts have been recorded.

## `POST /hunt?type=forward` — move forward and hunt

Observed from the UI action labelled 「前行」. The request has no body and uses
the query string `type=forward`. In the observed response it ran a full
multi-role combat report and advanced `huntInfo.huntStage` from 2 to 3 while
remaining in the same `huntZone`.

The response has the same top-level shape as `POST /hunt`: `report`,
`huntInfo`, `equipmentChanges`, `money`, and `huntCount`. It also supplies new
`huntAvailableAt` and `attackAvailableAt` timestamps.

The runner may issue this request only after the latest party snapshot reports
`canForward: true`, all enabled roles pass the party readiness barrier, and the
applicable server cooldown has passed. Confirm the returned stage instead of
assuming it always increases by one. Do not retry an uncertain POST; refresh
party/hunt state first.

## Target-stage auto-hunt mode

The user configures `targetHuntStage` as a positive integer. The runner uses
the latest server-provided `huntInfo.huntStage`, not a locally incremented
counter:

| Current state | Action |
| --- | --- |
| Any party member is below the configured HP/SP targets | Run the repeat-rest policy. |
| Current time is before `huntAvailableAt` | Wait until the server timestamp. |
| `huntStage < targetHuntStage` and `canForward` is true | `POST /hunt?type=forward` once. |
| `huntStage === targetHuntStage` | `POST /hunt` once for original-location hunting. |
| `huntStage > targetHuntStage` | Stop with `target exceeded`; automatic backtracking is not implemented. |
| `huntStage < targetHuntStage` and `canForward` is false | Stop with `forward unavailable`; do not substitute original hunting. |

After each POST, refresh from the returned `huntInfo`, recalculate party
readiness, and schedule the next decision from the returned cooldown time.

## Death and final-death policy

The runner distinguishes two game states:

| State | Allowed recovery action | Automation behavior |
| --- | --- | --- |
| `死亡` | `POST /heroes/reviveAll`; later complete the hero action when `canComplete: true` | Stop the hunt party. The endpoint starts eligible normal-death rebirth actions. |
| `死透了` | `POST /heroes/{heroId}/reincarnate` | Stop the hunt party; require an explicit per-hero confirmation before reincarnation. |

Neither state may enter rest, forward, original hunt, attack, or back actions.
After a recovery action succeeds, refresh the full party and require every
member to pass normal readiness checks before resuming. The current observed
role fields distinguish the states: `hp: 0, perished: false` is `死亡`, while
`perished: true` is `死透了`. After recovery, refresh the full party and require
every member to pass normal readiness checks before resuming.

## `POST /heroes/reviveAll`

Observed from the game UI action 「全部重生」 with no request body. It returns
the party's `heroes` array. In the capture, a normal-death hero
(`hp: 0, perished: false`) entered `actionState: 3` with a future
`actionCompleteTime` approximately ten minutes later and `canComplete: false`;
a final-death hero (`perished: true`) remained unchanged. Thus this endpoint
starts rebirth for eligible normal-death roles and does not handle final-death
reincarnation.

Use each returned `actionCompleteTime` as the next status-refresh time, with a
small safety margin; do not hard-code ten minutes. Refresh `/heroes` then, and
only offer explicit per-hero completion when the fresh response reports
`actionState: 3` and `canComplete: true`. Do not automatically repeat a POST
after an uncertain response.

The recorder console confirmed an individual reincarnation POST at
`/heroes/{heroId}/reincarnate`. The supplied raw log file does not contain this
request entry, so its request body and response schema remain unverified.
Autoy exposes this action only for `perished: true`, asks for confirmation,
sends no body, then refreshes `/heroes`. If the result is uncertain, do not
retry until the user refreshes and inspects the role state.

## `POST /move/0`

Observed from the user's 「回程」 capture, with no request body. The response
includes `huntZone`, `huntStage`, `zoneName`, `canBack`, `canForward`, cooldown
timestamps, and a `heroes` array. The captured result placed the returned hero
at 「大草原」 stage 1 and gave it `actionState: 1` with a future
`actionCompleteTime`. This supports describing the action as a return to the
starting point; the capture does not establish that it moves to a named town
or that it restores every member of a multi-hero party. Require explicit user
confirmation, then refresh both `/heroes` and `/huntInfo`. Keep automation
stopped until the user reviews the new party state.

## `POST /move/complete`

Observed from the game UI action 「完成移動」 with no request body. Both
captures returned the role to idle (`actionState: 0`), but the destination
depends on the move context: one response was `huntZone: 0`, `huntStage: 0`,
`zoneName: 初始之鎮`, `canForward: false`; another was `huntZone: 1`,
`huntStage: 1`, `zoneName: 大草原`, `canForward: true`. Treat the endpoint
response (and a fresh `/huntInfo`) as authoritative; do not assume it always
returns to town. The frontend also requested `GET /zoneUsers` afterward. Only
show the completion action when a fresh role response reports `actionState: 1`
and `canComplete: true`. After the POST, refresh `/heroes` and `/huntInfo`;
keep hunting stopped for user review.

## `GET /reports/defend/status`

Returned a status object with `newReportId`, which was `null` in the observed
response. This is unrelated to role selection and should remain a passive
notification query.

## Supporting read endpoints

| Endpoint | Response property | Purpose |
| --- | --- | --- |
| `GET /quests` | `active`, `cooldown` | Current quests and quest-roll availability |
| `GET /achievements` | `achievements`, `stats` | Achievement list and account statistics |
| `GET /profile` | account summary | Account ID, currency, expansions, and hero-slot limit |
| `GET /zones` | `zones` | Available hunt-zone metadata |
| `GET /huntInfo` | `heroes`, `huntStage`, cooldowns, navigation | Authoritative current hunt-party state; use this to initialize `canForward` and cooldown values after a page reload |
| `GET /captcha` | `pendingCaptchaId`, `sitekey` | Read-only CAPTCHA status; the app must stop and ask the user to complete any CAPTCHA themselves |

## Required next captures

1. [Confirmed] A role-card click reads `GET /heroes/{heroId}` and
   `GET /heroes/{heroId}/statuses`; no selection write request was observed.
2. [Confirmed] `POST /heroes/{heroId}/completeAction` completes an available
   action. It must be guarded by a fresh `canComplete: true` check and never
   automatically retried after an uncertain response.
3. [Confirmed] 「全部重生」 calls `POST /heroes/reviveAll` without a body;
   it starts rebirth for normal-death heroes and leaves final-death heroes
   unchanged. The response provides `actionCompleteTime` for each rebirth.
4. [Confirmed] 「全部休息」 calls `POST /heroes/restAll` with no observed request
   body and starts rest for all participating role cards.
5. [Confirmed] 「全部完成休息」 calls `POST /heroes/restAll/complete` with no
   observed request body and completes all resting role cards in one action.
5. [Confirmed] 「原地狩獵」 calls `POST /hunt` with no observed request body and
   returns a combined multi-role report plus server cooldown timestamps.
6. [Confirmed] 「前行」 calls `POST /hunt?type=forward` with no observed request
   body and returns a combined multi-role report plus server cooldown timestamps.
7. Capture the remaining UI actions available after `huntAvailableAt` or
   `attackAvailableAt` (attack or back) before automating them.
8. Establish whether two role cards can act concurrently or share an account
   action queue before enabling same-account parallel automation.
9. Capture a `死亡` role's detail response and its manual 「重生／復活」 action.
10. Capture a `死透了` role's detail response and its manual 「轉生／復活」 action.
